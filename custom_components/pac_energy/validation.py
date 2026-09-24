"""Validate source metadata without substituting demonstration values."""

import math

from homeassistant.core import HomeAssistant, State, valid_entity_id
from homeassistant.util.unit_conversion import TemperatureConverter

from .const import CONTEXT_KEYS, ENERGY_KEYS, ENERGY_UNITS, ENTITY_KEYS, TEMPERATURE_KEYS


def source_error(state: State | None, key: str) -> str | None:
    """Return a stable diagnostic, including missing or unavailable sources."""
    if state is None:
        return "missing"
    if state.state in ("unknown", "unavailable"):
        return "unavailable"
    if key in CONTEXT_KEYS:
        domain = state.domain
        if key == "climate" and domain != "climate":
            return "invalid_domain"
        if key == "presence" and domain not in ("person", "binary_sensor"):
            return "invalid_domain"
        if domain == "binary_sensor" and state.attributes.get("device_class") != "occupancy":
            return "invalid_device_class"
        return None
    if state.domain != "sensor":
        return "invalid_domain"
    try:
        value = float(state.state)
    except (ValueError, TypeError):
        return "invalid_value"
    if not math.isfinite(value) or (key in ENERGY_KEYS and value < 0):
        return "invalid_value"
    if key in ENERGY_KEYS:
        if state.attributes.get("device_class") != "energy":
            return "invalid_device_class"
        if state.attributes.get("state_class") not in ("total", "total_increasing"):
            return "invalid_state_class"
        if state.attributes.get("unit_of_measurement") not in ENERGY_UNITS:
            return "invalid_unit"
        if not math.isfinite(value * ENERGY_UNITS[state.attributes["unit_of_measurement"]]):
            return "invalid_value"
    if key in TEMPERATURE_KEYS:
        if state.attributes.get("device_class") != "temperature":
            return "invalid_device_class"
        if state.attributes.get("unit_of_measurement") not in ("°C", "°F", "K"):
            return "invalid_unit"
    return None


def normalized(state: State | None, key: str) -> float | None:
    """Return kWh or Celsius. Invalid data remains unavailable."""
    if source_error(state, key) or state is None:
        return None
    value = float(state.state)
    unit = state.attributes["unit_of_measurement"]
    if key in ENERGY_KEYS:
        return value * ENERGY_UNITS[unit]
    return TemperatureConverter.convert(value, unit, "°C")


def validate_config(hass: HomeAssistant, data: dict) -> dict[str, str]:
    """Validate selections; temporary unavailability does not prevent setup."""
    errors = {}
    if not isinstance(data.get("name"), str) or not data["name"].strip():
        errors["name"] = "invalid_config"
    if not data.get("electricity"):
        errors["electricity"] = "missing"
    if data.get("profile", "unknown") not in ("unknown", "standard", "legacy-pac-0"):
        errors["profile"] = "invalid_config"
    if not isinstance(data.get("same_scope", False), bool):
        errors["same_scope"] = "invalid_config"
    for key in ("tariff", "minimum", "maximum"):
        if key in data and (
            not isinstance(data[key], (int, float))
            or not math.isfinite(data[key])
            or not 0 <= data[key] <= (10 if key == "tariff" else 100)
        ):
            errors[key] = "invalid_value"
    if errors:
        return errors
    selected: set[str] = set()
    for key in ENTITY_KEYS:
        if entity_id := data.get(key):
            if not isinstance(entity_id, str) or not valid_entity_id(entity_id):
                errors[key] = "invalid_config"
                continue
            if entity_id in selected:
                errors[key] = "duplicate_source"
            selected.add(entity_id)
            error = source_error(hass.states.get(entity_id), key)
            if error and error != "unavailable":
                errors[key] = error
    minimum, maximum = data.get("minimum"), data.get("maximum")
    if (minimum is None) != (maximum is None):
        errors["base"] = "bounds_pair"
    elif minimum is not None and minimum > maximum:
        errors["base"] = "invalid_bounds"
    return errors
