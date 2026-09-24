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

Energy roles are `electricity` (required), `thermal`, `heating`, `dhw`, and `backup`. Optional context roles are `outside`, `room`, `climate`, and `presence`. No person's name or GPS coordinates are copied into the contract. The frontend reads only context entities' state and unit.

Energy Assistant's numerical sensors normalize counters to kWh and temperatures to degrees Celsius. They deliberately declare **no `state_class`**: source statistics remain authoritative without duplication. Do not use these copied counters as additional meters in HA's Energy dashboard.

## Statistics

The card uses `hass.callWS` with the existing HA session:

1. `recorder/get_statistics_metadata` for selected sources accessible in `hass.states`, checking `has_sum` and Wh/kWh/MWh units.
2. `recorder/statistics_during_period`, with `period: hour`, `types: [sum]`, and `units: {energy: kWh}`.

There are no custom HTTP requests, stored tokens, or vendor APIs. Official Recorder operations run in Recorder's executor, not the integration's event loop. The card does not expand HA permissions.

The query includes **the hour preceding the previous period's start**, through the current period's exclusive end. A row with `start = H` contains the normalized sum at `end = H + 1 hour`. Consumption over `[start, end)` is therefore the difference between the sums at `end` and `start`.

Every hour and both boundaries must be present, finite, and contiguous. Decreasing `sum` values are rejected. Physical meter resets are handled by Recorder's normalized sum, not naive subtraction of raw counters. Duplicates, gaps, and incomplete windows return `null`, never zero. This cannot detect a stuck sensor if Recorder keeps recording a constant value: the physical meter's quality still needs checking.

Midnight is calculated in `hass.config.time_zone`, not the browser's time zone. Paris daylight-saving transitions are covered, including 23-hour and 25-hour days. Time zones whose local midnight is not a whole UTC hour, and rare nonexistent or ambiguous local midnights, are explicitly unsupported. The current day and unfinished months are excluded.

Refresh buttons reload statistics; ordinary counter updates do not issue new requests. Configuration or availability changes invalidate results. The read timestamp and loaded dates are displayed. A card left open does not automatically advance to the next day: use Refresh.

## Aggregation

The total comes only from `electricity`. The three breakdowns are independent and **never added to the total**. COP requires `same_scope`, two identical complete windows, and strictly positive electricity consumption. It never divides cumulative counters. Period change is raw, without weather normalization. A zero reference makes percentage change unavailable.

Cost is `kWh × configured tariff`, in EUR, excluding standing charges and tariff history. No attributable savings are calculated. CSV uses an empty cell for unavailable energy.

## Scenarios and lifecycle

Lovelace scenarios live in memory per card instance, with explicit JSON export. The demo has separate local storage for fictional data only. No real state is copied into these scenarios.

Sensors subscribe to state changes and unsubscribe when removed. Options trigger an HA reload. IDs are stable across reloads and distinct across entries. Static resources are registered once per HA process and remain served until restart, even after the last entry is deleted. They contain only public files.
