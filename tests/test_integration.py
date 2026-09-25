"""Exercise the actual HA runtime inside the official, network-isolated image."""

import json
import shutil
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from aiohttp import ClientSession
from homeassistant import loader
from homeassistant.bootstrap import async_from_config_dict
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.models import StatisticMeanType
from homeassistant.components.recorder.statistics import async_import_statistics
from homeassistant.components.recorder.websocket_api import _ws_get_statistics_during_period
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from custom_components.pac_energy.validation import normalized, source_error

ENERGY = {
    "device_class": "energy",
    "state_class": "total_increasing",
    "unit_of_measurement": "Wh",
}
CONFIG = {
    "name": "Test installation",
    "electricity": "sensor.example_electricity",
    "thermal": "sensor.example_thermal",
    "same_scope": True,
    "profile": "standard",
    "minimum": 20.0,
    "maximum": 50.0,
    "tariff": 0.25,
}


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        shutil.copytree(
            Path(__file__).parents[1] / "custom_components",
            root / "custom_components",
            ignore=shutil.ignore_patterns("__pycache__"),
        )
        self.hass = HomeAssistant(str(root))
        loader.async_setup(self.hass)
        result = await async_from_config_dict(
            {
                "homeassistant": {
                    "time_zone": "Europe/Paris",
                    "latitude": 0,
                    "longitude": 0,
                    "elevation": 0,
                    "unit_system": "metric",
                    "country": "FR",
                },
                "http": {"server_port": 8123},
                "recorder": {
                    "db_url": f"sqlite:///{root / 'test.db'}",
                    "auto_purge": False,
                },
            },
            self.hass,
        )
        self.assertIsNotNone(result)
        self.assertIn("http", self.hass.config.components)
        await self.hass.async_start()
        self.hass.states.async_set("sensor.example_electricity", "10000", ENERGY)
        self.hass.states.async_set("sensor.example_thermal", "30000", ENERGY)
        await self.hass.async_block_till_done()

    async def asyncTearDown(self):
        await self.hass.async_stop(force=True)

    async def create_entry(self, config=None):
        result = await self.hass.config_entries.flow.async_init(
            "pac_energy", context={"source": "user"}, data=config or CONFIG
        )
        self.assertEqual(result["type"], "create_entry", result)
        await self.hass.async_block_till_done()
        entry = result["result"]
        self.assertEqual(entry.state, ConfigEntryState.LOADED)
        return entry

    def sensor(self, entry, key):
        entity_id = er.async_get(self.hass).async_get_entity_id(
            "sensor", "pac_energy", f"{entry.entry_id}_{key}"
        )
        self.assertIsNotNone(entity_id)
        return self.hass.states.get(entity_id)

    async def test_actual_setup_updates_unload_reload_and_multiple_entries(self):
        first = await self.create_entry()
        second = await self.create_entry({**CONFIG, "name": "Second installation"})
        self.assertNotEqual(
            self.sensor(first, "status").entity_id, self.sensor(second, "status").entity_id
        )
        state = self.sensor(first, "electricity")
        self.assertEqual(state.state, "10.0")
        self.assertEqual(state.attributes["unit_of_measurement"], "kWh")
        self.assertNotIn("state_class", state.attributes)
        status = self.sensor(first, "status")
        self.assertEqual(status.state, "ready")
        self.assertEqual(status.attributes["contract_version"], 1)
        self.assertTrue(status.attributes["read_only"])
        self.assertNotIn("cop", status.attributes)
        original_id = state.entity_id
        self.hass.states.async_set("sensor.example_electricity", "unavailable", ENERGY)
        await self.hass.async_block_till_done()
        self.assertEqual(self.sensor(first, "electricity").state, "unavailable")
        self.assertEqual(
            self.sensor(first, "status").attributes["input_errors"], {"electricity": "unavailable"}
        )
        self.hass.states.async_set("sensor.example_electricity", "12000", ENERGY)
        await self.hass.async_block_till_done()
        self.assertEqual(self.sensor(first, "electricity").state, "12.0")
        self.assertTrue(await self.hass.config_entries.async_unload(first.entry_id))
        await self.hass.async_block_till_done()
        self.hass.states.async_set("sensor.example_electricity", "14000", ENERGY)
        await self.hass.async_block_till_done()
        self.assertEqual(self.sensor(second, "electricity").state, "14.0")
        self.assertEqual(self.sensor(first, "electricity").state, "unavailable")
        self.assertTrue(await self.hass.config_entries.async_setup(first.entry_id))
        await self.hass.async_block_till_done()
        self.assertEqual(self.sensor(first, "electricity").entity_id, original_id)
        self.assertEqual(self.sensor(first, "electricity").state, "14.0")
        await self.hass.config_entries.async_remove(first.entry_id)
        await self.hass.async_block_till_done()
        self.assertIsNone(
            er.async_get(self.hass).async_get_entity_id(
                "sensor", "pac_energy", f"{first.entry_id}_status"
            )
        )

    async def test_options_clear_optional_sources_and_reconfigure(self):
        entry = await self.create_entry()
        form = await self.hass.config_entries.options.async_init(entry.entry_id)
        self.assertEqual(form["type"], "form")
        changed = {k: v for k, v in CONFIG.items() if k not in ("thermal", "minimum", "maximum")}
        result = await self.hass.config_entries.options.async_configure(form["flow_id"], changed)
        self.assertEqual(result["type"], "create_entry")
        await self.hass.async_block_till_done()
        status = self.sensor(entry, "status")
        self.assertNotIn("thermal", status.attributes["sources"])
        self.assertIsNone(status.attributes["curve"]["minimum"])
        flow = await self.hass.config_entries.flow.async_init(
            "pac_energy", context={"source": "reconfigure", "entry_id": entry.entry_id}
        )
        result = await self.hass.config_entries.flow.async_configure(
            flow["flow_id"], {**CONFIG, "name": "Reconfigured"}
        )
        self.assertEqual(result["type"], "abort")
        self.assertEqual(result["reason"], "reconfigure_successful")
        await self.hass.async_block_till_done()
        self.assertEqual(entry.title, "Reconfigured")
        self.assertEqual(dict(entry.options), {})
        self.assertIn("thermal", self.sensor(entry, "status").attributes["sources"])

    async def test_flow_errors_and_unavailable_source(self):
        for data, field, error in [
            ({**CONFIG, "name": ""}, "name", "invalid_config"),
            ({**CONFIG, "electricity": None}, "electricity", "missing"),
            ({**CONFIG, "tariff": float("nan")}, "tariff", "invalid_value"),
            ({**CONFIG, "thermal": 123}, "thermal", "invalid_config"),
            ({**CONFIG, "electricity": "sensor.missing"}, "electricity", "missing"),
            ({**CONFIG, "thermal": CONFIG["electricity"]}, "thermal", "duplicate_source"),
            ({**CONFIG, "minimum": 60}, "base", "invalid_bounds"),
            ({k: v for k, v in CONFIG.items() if k != "maximum"}, "base", "bounds_pair"),
        ]:
            result = await self.hass.config_entries.flow.async_init(
                "pac_energy", context={"source": "user"}, data=data
            )
            self.assertEqual(result["type"], "form")
            self.assertEqual(result["errors"][field], error)
            self.hass.config_entries.flow.async_abort(result["flow_id"])
        self.hass.states.async_set("sensor.example_electricity", "unavailable", ENERGY)
        entry = await self.create_entry()
        self.assertEqual(self.sensor(entry, "status").state, "source_error")
        self.hass.states.async_remove("sensor.example_thermal")
        await self.hass.async_block_till_done()
        self.assertEqual(
            self.sensor(entry, "status").attributes["input_errors"]["thermal"], "missing"
        )

    async def test_units_validation_and_source_disappearance(self):
        for unit, value, expected in [("Wh", "1000", 1), ("kWh", "1", 1), ("MWh", "1", 1000)]:
            self.hass.states.async_set(
                "sensor.input", value, {**ENERGY, "unit_of_measurement": unit}
            )
            self.assertEqual(
                normalized(self.hass.states.get("sensor.input"), "electricity"), expected
            )
        for value, attrs, error in [
            ("nan", ENERGY, "invalid_value"),
            ("inf", ENERGY, "invalid_value"),
            ("-1", ENERGY, "invalid_value"),
            ("10", {**ENERGY, "unit_of_measurement": "W"}, "invalid_unit"),
            ("10", {**ENERGY, "device_class": "power"}, "invalid_device_class"),
            ("10", {**ENERGY, "state_class": "measurement"}, "invalid_state_class"),
        ]:
            self.hass.states.async_set("sensor.input", value, attrs)
            self.assertEqual(
                source_error(self.hass.states.get("sensor.input"), "electricity"), error
            )
            self.assertIsNone(normalized(self.hass.states.get("sensor.input"), "electricity"))
        for unit, value in [("°C", 0), ("°F", 32), ("K", 273.15)]:
            self.hass.states.async_set(
                "sensor.input", value, {"device_class": "temperature", "unit_of_measurement": unit}
            )
            self.assertAlmostEqual(normalized(self.hass.states.get("sensor.input"), "outside"), 0)

    async def test_bundled_assets_registered_once(self):
        await self.create_entry()
        await self.create_entry({**CONFIG, "name": "Another"})
        paths = [str(route.resource) for route in self.hass.http.app.router.routes()]
        self.assertTrue(any("/pac_energy" in path for path in paths))
        self.assertFalse(self.hass.services.has_service("pac_energy", "turn_on"))
        self.assertFalse(self.hass.services.has_service("pac_energy", "set_temperature"))
        manifest = json.loads(
            (Path(__file__).parents[1] / "custom_components/pac_energy/manifest.json").read_text()
        )
        self.assertEqual(manifest["version"], "0.1.2")
        self.assertEqual(manifest["name"], "Energy Assistant")
        async with ClientSession() as client:
            for path in ("pac-energy-card.js", "data.mjs", "theme.mjs", "demo/index.html"):
                async with client.get(f"http://127.0.0.1:8123/pac_energy/{path}") as response:
                    self.assertEqual(response.status, 200)
                    self.assertGreater(len(await response.read()), 100)
                    if path.endswith(".mjs"):
                        self.assertIn("javascript", response.headers["Content-Type"])

    async def test_real_recorder_hourly_api_units_boundaries_and_gap(self):
        instance = get_instance(self.hass)
        start = datetime(2026, 3, 28, 23, tzinfo=timezone.utc)
        end = datetime(2026, 3, 29, 22, tzinfo=timezone.utc)
        self.assertEqual((end - start).total_seconds() / 3600, 23)
        for key, factor in (("electricity", 1), ("thermal", 3)):
            async_import_statistics(
                self.hass,
                {
                    "source": "recorder",
                    "statistic_id": f"sensor.example_{key}",
                    "name": key,
                    "unit_of_measurement": "Wh",
                    "unit_class": "energy",
                    "has_sum": True,
                    "mean_type": StatisticMeanType.NONE,
                },
                [
                    {
                        "start": start + timedelta(hours=i - 1),
                        "sum": (100 + i * factor) * 1000,
                        "state": i * 1000 if i < 10 else (i - 10) * 1000,
                    }
                    for i in range(24)
                    if key != "thermal" or i != 10
                ],
            )
        await instance.async_block_till_done()
        payload = await instance.async_add_executor_job(
            _ws_get_statistics_during_period,
            self.hass,
            1,
            start - timedelta(hours=1),
            end,
            {"sensor.example_electricity", "sensor.example_thermal"},
            "hour",
            {"energy": "kWh"},
            {"sum"},
        )
        result = json.loads(payload)["result"]
        rows = result["sensor.example_electricity"]
        self.assertEqual(len(rows), 24)
        self.assertEqual(rows[0]["end"], int(start.timestamp() * 1000))
        self.assertEqual(rows[-1]["end"], int(end.timestamp() * 1000))
        self.assertEqual(rows[-1]["sum"] - rows[0]["sum"], 23)
        thermal = result["sensor.example_thermal"]
        self.assertEqual(len(thermal), 23)
        self.assertNotIn(
            int((start + timedelta(hours=9)).timestamp() * 1000), [row["start"] for row in thermal]
        )
