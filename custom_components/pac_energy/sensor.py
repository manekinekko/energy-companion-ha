"""Normalized source counters and a diagnostic configuration entity."""

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.event import async_track_state_change_event

from .const import DOMAIN, ENERGY_KEYS, ENTITY_KEYS, TEMPERATURE_KEYS
from .validation import normalized, source_error


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities):
    config = dict(entry.options or entry.data)
    async_add_entities(
        [
            PacEnergySensor(entry, config, "status"),
            *(
                PacEnergySensor(entry, config, key)
                for key in ENERGY_KEYS + TEMPERATURE_KEYS
                if config.get(key)
            ),
        ]
    )


class PacEnergySensor(SensorEntity):
    """Subscribe to source events, never poll or send a service call."""

    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(self, entry: ConfigEntry, config: dict, key: str) -> None:
        self._config = config
        self._key = key
        self._entry_id = entry.entry_id
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_translation_key = key
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=config["name"],
            model="Read-only energy helper",
            manufacturer="Energy Assistant",
        )
        if key == "status":
            self._attr_entity_category = EntityCategory.DIAGNOSTIC
            self._attr_device_class = SensorDeviceClass.ENUM
            self._attr_options = ["ready", "source_error"]
        else:
            self._attr_device_class = (
                SensorDeviceClass.ENERGY if key in ENERGY_KEYS else SensorDeviceClass.TEMPERATURE
            )
            self._attr_native_unit_of_measurement = "kWh" if key in ENERGY_KEYS else "°C"
        # Source statistics remain authoritative. Copies must not produce new statistics.

    async def async_added_to_hass(self) -> None:
        sources = [self._config[key] for key in ENTITY_KEYS if self._config.get(key)]
        self.async_on_remove(
            async_track_state_change_event(self.hass, sources, self._source_changed)
        )

    @callback
    def _source_changed(self, event) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return (
            self._key == "status"
            or source_error(self.hass.states.get(self._config[self._key]), self._key) is None
        )

    @property
    def native_value(self):
        if self._key == "status":
            return "source_error" if self._errors() else "ready"
        return normalized(self.hass.states.get(self._config[self._key]), self._key)

    def _errors(self) -> dict[str, str]:
        return {
            key: error
            for key in ENTITY_KEYS
            if self._config.get(key)
            if (error := source_error(self.hass.states.get(self._config[key]), key))
        }

    @property
    def extra_state_attributes(self) -> dict:
        if self._key != "status":
            return {"source_entity": self._config[self._key]}
        return {
            "contract_version": 1,
            "entry_id": self._entry_id,
            "read_only": True,
            "sources": {key: self._config[key] for key in ENTITY_KEYS if self._config.get(key)},
            "input_errors": self._errors(),
            "tariff_eur_kwh": self._config.get("tariff"),
            "same_scope": self._config.get("same_scope", False),
            "curve": {
                "profile": self._config.get("profile", "unknown"),
                "minimum": self._config.get("minimum"),
                "maximum": self._config.get("maximum"),
            },
        }
