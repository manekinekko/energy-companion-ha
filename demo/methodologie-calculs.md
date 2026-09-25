# Calculation methodology

Energy Assistant. Last mathematical review: September 23, 2026.

## Verified arithmetic

Constant-tariff cost is total electrical energy multiplied by the price per kWh. It excludes standing charges and does not reconstruct a historical electricity bill.

Period COP is produced heat divided by consumed electricity over the same interval and equipment scope, including backup heating in the demo dataset. It is not a certified SCOP.

Percentage change between periods is `(current - reference) / reference × 100`. A zero reference makes the percentage unavailable.

These are verifiable arithmetic definitions. They do not, by themselves, establish equivalence with every calculation performed by a remote service.

## Heating curve: verified chart math

Two chart expressions were identified in an Android 3.41.2 client. Their mathematical transcription is independent of that client's code.

Notation:

- `Te`: outdoor temperature.
- `Tc`: room setpoint.
- `s`: slope.
- `n`: level.
- `d = Te - Tc`.

Standard profile:

`T = Tc + n - (0.0002479 × d² + 0.021 × d + 1.4347) × s × d`

Legacy heat-pump profile, circuit 0:

`T = Tc + n - (0.0002479 × d² + 0.021 × d + 1.148987) × s × d + 5`

The order of single-precision operations is preserved. The result is rounded to the nearest integer, with ties toward positive infinity, then clamped to the supply-temperature bounds.

In the standalone prototype, bounds are fixed at 20 and 55 °C and clearly identified as demo assumptions. For a real installation, they must come from the equipment and its configuration. The Lovelace card requires explicit configuration and treats unknown bounds as unavailable. The legacy profile does not apply indiscriminately to all heat pumps.

Examples with a 20 °C room setpoint, slope 0.8, and level 0:

| Outdoor temperature | Standard profile | Legacy heat-pump profile, circuit 0 |
| --- | --- | --- |
| -10 °C | 45 °C | 43 °C |
| 0 °C | 38 °C | 38 °C |
| 10 °C | 30 °C | 33 °C |
| 20 °C | 20 °C | 25 °C |

The verified match concerns the **client-side chart**, not firmware control laws, safety protections, or the heat pump's dynamic behavior. An earlier independent JVM reference comparison covered 21,504 points; it is distinct from this repository's test suite and was not rerun during HA integration validation.

## What is not verified as equivalent

The original remote services' complete DHW calculator, attributable automation savings, and personalized forecasting models were not obtained.

Available information is insufficient to reconstruct their learning models, home-specific calibration, quality processing, or internal coefficients.

Consequently:

- No fixed savings percentage is applied to the dashboard.
- Savings attributable to regulation are shown as **not calculated**.
- The DHW simulator remains a **simplified, unvalidated local model**.
- Forecasting uses **fictional weather** and an educational model.
- Presence, preheating, and modulation rules are explicit scenarios, not certified algorithms.

## Prototype DHW model

Demo reference: 55 °C, 16.5 hours per day. This is neither a recommended sanitary setpoint nor a value read from an installation.

`Electricity/day = [V × 0.001163 × (T - 12) + 1.8 × (T - 20)/35 × h/24] / COP`

`V` is assumed daily water volume, `T` is simulated temperature, and `h` is the heating window. COP is constant and entered by the user.

The first term uses water's heat capacity. The second is a simplified tank-loss assumption; its linear relationship with heating hours is not a validated model. Annualization assumes 365 identical days.

## Home Assistant usage

Unlike the standalone prototype, the live card initializes curve and DHW target inputs from explicitly selected HA sources. Empty inputs stay unavailable, and user changes are separately identified as local assumptions. No demo people, rooms, temperatures, schedules or water volumes seed the live card.

The live DHW model is limited to sensible heat: `Q = V × 0.001163 × (T - Tin)` kWh per assumed day. Estimated electricity requires an explicitly supplied constant COP and is `Q / COP`. Its signed comparison replaces only the target with the current HA setpoint while keeping all other assumptions equal. It excludes standby losses, schedules, annualization and certified savings. Reported seasonal performance factors are display-only, never implicit model COPs.

The live presence/window rule reads selected HA boolean context or explicit hypothetical overrides. Missing context stays unknown. It does not establish household-wide absence, predict return times or control equipment. Scenario exports contain private baseline values and assumptions, but omit entity IDs, names and coordinates.

The native integration connects explicitly selected existing entities and statistics in read-only mode. Users must check source quality, confirm matching thermal/electrical scope, identify the chart profile, and configure actual bounds. See the repository's [data contract](https://github.com/manekinekko/energy-companion-ha/blob/main/docs/data-contract.md) for strict statistics-window handling.

There is no equipment-control implementation. Any future automation must run on the HA side, not depend on an open browser tab, and preserve sanitary, frost, hydraulic, and anti-cycling protections. Neither the demo nor the integration sends commands.
