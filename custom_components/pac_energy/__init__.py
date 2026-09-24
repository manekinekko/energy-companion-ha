"""Read-only Energy Assistant integration."""

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Serve only bundled public assets, never configuration or source states."""
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/pac_energy", str(Path(__file__).parent / "www"), cache_headers=False)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Forward to event-driven sensors."""
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Entity removal tears down all source listeners."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
