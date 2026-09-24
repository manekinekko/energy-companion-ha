"""UI configuration for existing HA entities. No device or cloud connection."""

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import DOMAIN, ENERGY_KEYS, TEMPERATURE_KEYS
from .validation import validate_config


def schema() -> vol.Schema:
    """Use suggested values, not defaults, so optional selections can be cleared."""
    fields: dict = {vol.Required("name", default="Energy Assistant"): selector.TextSelector()}
    for key in ENERGY_KEYS:
        marker = vol.Required(key) if key == "electricity" else vol.Optional(key)
        fields[marker] = selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="energy")
        )
    for key in TEMPERATURE_KEYS:
        fields[vol.Optional(key)] = selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="temperature")
        )
    fields[vol.Optional("climate")] = selector.EntitySelector(
        selector.EntitySelectorConfig(domain="climate")
    )
    fields[vol.Optional("presence")] = selector.EntitySelector(
        selector.EntitySelectorConfig(
            filter=[{"domain": "person"}, {"domain": "binary_sensor", "device_class": "occupancy"}]
        )
    )
    fields[vol.Required("same_scope", default=False)] = selector.BooleanSelector()
    fields[vol.Optional("tariff")] = selector.NumberSelector(
        selector.NumberSelectorConfig(min=0, max=10, step="any", mode="box")
    )
    fields[vol.Required("profile", default="unknown")] = selector.SelectSelector(
        selector.SelectSelectorConfig(
            options=["unknown", "standard", "legacy-pac-0"], translation_key="profile"
        )
    )
    for key in ("minimum", "maximum"):
        fields[vol.Optional(key)] = selector.NumberSelector(
            selector.NumberSelectorConfig(min=0, max=100, step=0.5, mode="box")
        )
    return vol.Schema(fields)


class PacEnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Configure any number of independent installations."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        errors = {}
        if user_input is not None:
            errors = validate_config(self.hass, user_input)
            if not errors:
                return self.async_create_entry(title=user_input["name"], data=user_input)
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(schema(), user_input),
            errors=errors,
        )

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None):
        entry = self._get_reconfigure_entry()
        errors = {}
        if user_input is not None:
            errors = validate_config(self.hass, user_input)
            if not errors:
                return self.async_update_reload_and_abort(
                    entry, data=user_input, options={}, title=user_input["name"]
                )
        return self.async_show_form(
            step_id="reconfigure",
            data_schema=self.add_suggested_values_to_schema(
                schema(), user_input if user_input is not None else entry.options or entry.data
            ),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return PacEnergyOptionsFlow()


class PacEnergyOptionsFlow(config_entries.OptionsFlowWithReload):
    """Replace options atomically and let HA reload the entry."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        errors = {}
        if user_input is not None:
            errors = validate_config(self.hass, user_input)
            if not errors:
                return self.async_create_entry(data=user_input)
        return self.async_show_form(
            step_id="init",
            data_schema=self.add_suggested_values_to_schema(
                schema(),
                user_input
                if user_input is not None
                else self.config_entry.options or self.config_entry.data,
            ),
            errors=errors,
        )
