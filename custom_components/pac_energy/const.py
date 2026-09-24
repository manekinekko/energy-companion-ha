"""Energy Assistant's versioned, read-only data contract."""

DOMAIN = "pac_energy"
ENERGY_KEYS = ("electricity", "thermal", "heating", "dhw", "backup")
TEMPERATURE_KEYS = ("outside", "room")
CONTEXT_KEYS = ("climate", "presence")
ENTITY_KEYS = ENERGY_KEYS + TEMPERATURE_KEYS + CONTEXT_KEYS
ENERGY_UNITS = {"Wh": 0.001, "kWh": 1.0, "MWh": 1000.0}
