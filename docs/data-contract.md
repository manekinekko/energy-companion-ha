# Data contract 1

Each configuration entry creates a virtual device and a diagnostic **Status** entity (named **État** in French). Its `unique_id` is `<entry_id>_status`. The card references this entity through `entity`, not a hard-coded installation identifier.

The public project name is Energy Assistant. The `pac_energy` integration domain and `pac-energy-card` custom element remain unchanged for compatibility.

## Attributes

| Attribute | Type and meaning |
| --- | --- |
| `contract_version` | `1` |
| `entry_id` | Opaque HA configuration-entry identifier |
| `read_only` | Always `true` |
| `sources` | Roles mapped to explicitly selected HA entities |
| `input_errors` | Roles mapped to `missing`, `unavailable`, `invalid_value`, `invalid_unit`, `invalid_device_class`, `invalid_state_class`, or `invalid_domain` |
| `tariff_eur_kwh` | Optional number, otherwise `null` |
| `same_scope` | Explicit confirmation that electrical and thermal counters cover the same equipment |
| `curve` | `profile`: `unknown`, `standard`, or `legacy-pac-0`; `minimum` and `maximum`: degrees Celsius or `null` |

Energy roles are `electricity` (required), `thermal`, `heating`, `dhw`, and `backup`.

Optional measured-temperature roles are `outside`, `room`, `supply`, `return`, `dhw_current`, and `cold_water`, using temperature-class sensors. Optional setting roles accept `sensor`, `number`, or `input_number`: `room_target`, `dhw_target`, `curve_slope`, `curve_level`, and `dhw_performance`. Setpoints require °C/°F/K. Slope and performance are dimensionless (absent/empty unit or `1`); slope is supported from 0 to 4, reported performance from 0 to 20. Curve offset accepts temperature-difference units: °F is multiplied by 5/9, while K and °C are unchanged, with a supported normalized range of -20 to 40 K. No absolute-temperature offset is applied to a difference.

Optional context roles are `climate`, `presence` (person or occupancy binary sensor), and `window` (window/opening binary sensor). No person's name or GPS coordinates are copied into the contract. The frontend reads selected states, units and last-update timestamps. Settings have no copied sensor; they appear in the source mapping and diagnostics. Measured-temperature roles do create normalized sensors.

Energy Assistant's numerical sensors normalize counters to kWh and temperatures to degrees Celsius. They deliberately declare **no `state_class`**: source statistics remain authoritative without duplication. Do not use these copied counters as additional meters in HA's Energy dashboard.

## Statistics

The card uses `hass.callWS` with the existing HA session:

1. `recorder/get_statistics_metadata` for selected sources accessible in `hass.states`, checking `has_sum` and Wh/kWh/MWh statistics units. Current responses use `statistics_unit_of_measurement`; the older `unit_of_measurement` field is accepted only when the current field is absent. Display units do not override statistics units.
2. `recorder/statistics_during_period`, with `period: hour`, `types: [sum]`, and `units: {energy: kWh}`.

There are no custom HTTP requests, stored tokens, or vendor APIs. Official Recorder operations run in Recorder's executor, not the integration's event loop. The card does not expand HA permissions.

The query includes **the hour preceding the previous period's start**, through the current period's exclusive end. A row with `start = H` contains the normalized sum at `end = H + 1 hour`. Consumption over `[start, end)` is therefore the difference between the sums at `end` and `start`.

Every hour and both boundaries must be present, finite, and contiguous. Decreasing `sum` values are rejected. Physical meter resets are handled by Recorder's normalized sum, not naive subtraction of raw counters. Duplicates, gaps, and incomplete windows return `null`, never zero. This cannot detect a stuck sensor if Recorder keeps recording a constant value: the physical meter's quality still needs checking.

Midnight is calculated in `hass.config.time_zone`, not the browser's time zone. Paris daylight-saving transitions are covered, including 23-hour and 25-hour days. Time zones whose local midnight is not a whole UTC hour, and rare nonexistent or ambiguous local midnights, are explicitly unsupported. The current day and unfinished months are excluded.

Refresh buttons reload statistics; ordinary counter updates do not issue new requests. Configuration or availability changes invalidate results. The read timestamp and loaded dates are displayed. A card left open does not automatically advance to the next day: use Refresh.

## Aggregation

The total comes only from `electricity`. The three breakdowns are independent and **never added to the total**. If an individual breakdown exceeds the total over the same complete period, the card warns about source scope/quality without correcting either value. COP requires `same_scope`, two identical complete windows, and strictly positive electricity consumption. It never divides cumulative counters. Period change is raw, without weather normalization. A zero reference makes percentage change unavailable.

Cost is `kWh × configured tariff`, in EUR, excluding standing charges and tariff history. No attributable savings are calculated. CSV uses an empty cell for unavailable energy.

## Scenarios and lifecycle

Lovelace scenarios live in memory per card instance. Unedited fields follow the configured HA sources; explicit overrides remain separate across state updates. Clearing an override resumes live tracking. Reconfiguring a card clears its local history and overrides to avoid mixing installations. Missing data is `null`, not a demo default. Curve calculation requires all four inputs plus an explicit profile and configured bounds; its supported mathematical ranges are not recommendations or physical limits.

Explicit JSON export includes the current numerical/boolean baseline, overrides, resolved scenario, curve configuration and saved snapshots (maximum 100), each timestamped. It excludes entity IDs, names and coordinates, but still contains private installation values. Nothing is persisted automatically. The demo retains separate local storage for fictional data only.

DHW uses `volume × 0.001163 × (target - coldWater)` kWh of heat per assumed day, divided by an explicitly entered COP for estimated electricity. The signed comparison changes only the target from the live HA setpoint, holding volume, inlet temperature and COP constant. Missing baseline only disables comparison; missing inlet/volume/target disables heat, and missing COP disables electricity. No schedules, losses or annual savings are inferred. `dhw_performance` is display-only.

The local rule checks selected window state first; an open window indicates a hypothetical pause. Otherwise both window and selected presence must be known. Presence keeps the current target; absence subtracts an explicitly entered setback. No household-wide occupancy inference, duration prediction or equipment action occurs.

Sensors subscribe to state changes and unsubscribe when removed. Options trigger an HA reload. IDs are stable across reloads and distinct across entries. Static resources are registered once per HA process and remain served until restart, even after the last entry is deleted. They contain only public files.
