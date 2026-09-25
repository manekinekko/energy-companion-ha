"""Energy Assistant's versioned, read-only data contract."""

DOMAIN = "pac_energy"
ENERGY_KEYS = ("electricity", "thermal", "heating", "dhw", "backup")
TEMPERATURE_KEYS = ("outside", "room", "supply", "return", "dhw_current", "cold_water")
SETTING_TEMPERATURE_KEYS = ("room_target", "dhw_target")
NUMERIC_KEYS = ("curve_slope", "curve_level", "dhw_performance")
SETTING_KEYS = SETTING_TEMPERATURE_KEYS + NUMERIC_KEYS
CONTEXT_KEYS = ("climate", "presence", "window")
ENTITY_KEYS = ENERGY_KEYS + TEMPERATURE_KEYS + SETTING_KEYS + CONTEXT_KEYS
ENERGY_UNITS = {"Wh": 0.001, "kWh": 1.0, "MWh": 1000.0}
