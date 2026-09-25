# Energy Assistant

A native Home Assistant integration and Lovelace card for monitoring heat-pump energy using **entities already available in HA**. The dashboard has a pastel-red light/dark theme. Its interface remains French; HA configuration forms and sensor names support English and French. All repository documentation is in English.

**Version 0.1.2, entirely read-only.** No vendor account, cloud API, long-lived token, heating command, or live automation. Missing data stays unavailable. The standalone demo is separate from real measurements.

Previously named PAC Energy, the project is now **Energy Assistant**. The integration domain `pac_energy`, custom card type `pac-energy-card`, resource paths, and existing entity identifiers are intentionally unchanged so installed configurations keep working. Existing installation names are user-defined and are not overwritten.

## Installation

Validated with **Home Assistant 2026.9.2 / Python 3.14.6**, using the official container. HA OS supplies its own Python runtime. See [validation scope and limitations](docs/validation.md).

### Manual installation

1. Download this repository. Copy the **entire** `custom_components/pac_energy` directory to `<HA config>/custom_components/pac_energy`, including `www` and `translations`.
2. Restart HA, then open **Settings / Devices & services / Add integration / Energy Assistant**.
3. Select the heat pump's total electrical energy counter, including backup heating. Counters must be `energy` sensors with `state_class: total` or `total_increasing`, in Wh, kWh, or MWh. A W power sensor is not an energy counter; create an HA Integral helper first if needed.
4. Add optional sources: produced thermal energy, heating/domestic hot water (DHW)/backup electrical breakdowns, temperatures, climate, and presence. Confirm that the thermal and electrical counters cover the same equipment only if that is true. Otherwise, COP remains unavailable.
5. Optionally enter a constant tariff in EUR/kWh. For the heating-curve chart, explicitly select a profile and **both configured supply-temperature bounds for your installation**. If these are unknown, leave the profile unknown and the bounds empty. Demo bounds are never applied to real mode.
6. Add the following Lovelace resource as a **JavaScript module**, then reload your browser.

```yaml
url: /pac_energy/pac-energy-card.js?v=0.1.2
type: module
```

Resources are available under **Settings / Dashboards / menu / Resources**, with advanced mode enabled. For YAML configuration:

```yaml
lovelace:
  resources:
    - url: /pac_energy/pac-energy-card.js?v=0.1.2
      type: module
```

Add a manual card. Replace the placeholder with the **diagnostic Status entity** created by Energy Assistant:

```yaml
type: custom:pac-energy-card
entity: sensor.example_pac_energy_status
```

The exact entity ID depends on the installation name and HA language. Find it on the integration's device page; in French, the sensor is named **État**. The [example dashboard](examples/dashboard.yaml) displays a full-width card. Multiple installations are supported, with one card per Status entity.

### HACS custom repository

In HACS, add `https://github.com/manekinekko/energy-companion-ha` as a **custom repository of type Integration**, then download Energy Assistant. Continue from step 2 above. The repository layout and `hacs.json` support this installation method; the project is not claimed to be included in the default HACS catalog. You must still register the Lovelace resource manually. The tests do not claim an end-to-end installation through the HACS UI.

## Real and simulated features

| Section | Lovelace with HA | Standalone demo |
| --- | --- | --- |
| Overview | Live counters, period energy, constant-tariff estimate, conditional COP | Entirely fictional data |
| Analyses | Recorder statistics, raw comparison, daily table, CSV | Synthetic history and fictional forecast |
| Simulators | Explicitly configured curve profile/bounds, simplified DHW, exportable local scenario log | All controls, JSON import/export, local persistence |
| Automations | **Simulated** absence, return, open windows, and preheating | Full laboratory with fictional rooms, clock, and modulation |
| Monthly reports | Completed-month summary, conditional COP/cost, real CSV | Fictional printable report, PDF through browser printing |
| Home Assistant | Sources, errors, configuration guidance, explicit demo access | Demo help and settings |

Costs are **not historical electricity bills**. Comparisons are not weather-normalized. Attributable savings, real forecasts, dynamic tariffs, and automation execution remain unavailable. Scenarios never modify heating, DHW, presence, or valve entities.

## History and data quality

Recorder must record the **source entities** and provide cumulative statistics. The card uses complete days in HA's configured time zone, not the browser's time zone. It excludes the current day; reports exclude unfinished months. Use **Actualiser les statistiques** (Refresh statistics) to read fresh data or move to the next day.

An incomplete window, missing hour, incompatible unit, or missing boundary makes the result unavailable. COP requires complete electrical and thermal statistics over identical boundaries, confirmation of the same equipment scope, and positive electricity consumption. The total never adds subcounters to the main counter. Time zones whose local midnight does not align with a whole UTC hour are explicitly unsupported in this version.

A stuck counter can still produce constant statistics: check its freshness and quality in HA. Heating/DHW/backup details may cover different scopes; they are displayed separately without assuming they partition the total.

The [data contract](docs/data-contract.md) describes sensors, subscriptions, Recorder requests, boundaries, and calculations. The [simulation methodology](demo/methodologie-calculs.md) distinguishes chart formulas, fictional assumptions, and unvalidated models. The methodology's original filename is retained to preserve existing download links; its contents are in English.

## Standalone demo

Open `demo/index.html` directly, or run:

```sh
python3 -m http.server 8768 --bind 127.0.0.1 --directory demo
```

The laboratory preserves all six sections, simulators, local persistence, import/export, and printable reports from the prototype. It makes **no HA connection**. The integration also serves a public copy at `/pac_energy/demo/index.html`, linked from its Home Assistant tab. See the [demo guide](demo/README.md).

## Configure, update, and remove

Change entities and settings through **Energy Assistant / Configure**; HA reloads the entry. Reconfiguration is also available. Missing or unavailable sensors are reported in the Status entity and the card.

To update, replace the complete integration directory, restart HA, and refresh the browser and resource URL version as needed. When updating from PAC Energy, keep the directory, card type, and entity references unchanged. Update any bookmarked repository or HACS custom-repository URL to `https://github.com/manekinekko/energy-companion-ha`. You may rename an existing installation in HA if you want its user-defined name to match the new project name.

To remove, delete the cards, remove the integration entries under Devices & services, remove the Lovelace resource, then delete only `<HA config>/custom_components/pac_energy` and restart HA. This does not delete source entities or their statistics. The demo stores only fictional scenarios in browser storage; reset these through the demo UI if desired.

Static files are public, like normal Lovelace resources, and contain no HA configuration. Real measurements are exported only through an explicit CSV action. Card scenarios remain in memory per card until reload.

## Development and status

```sh
npm ci --ignore-scripts
npm run build
npm test
sh scripts/test-ha.sh
```

See [Validation](docs/validation.md) for actual HA runtime, SQLite Recorder, and Firefox coverage. The build regenerates translations, the shared theme, and the bundled demo from their sources. Installing the distributed files requires neither Node nor a build step.

This independent project is not a heat-pump controller or health guidance. The two chart profiles do not establish a device's control law. These sources do not deploy anything to a real installation.

## License

Energy Assistant is licensed under the [MIT License](LICENSE). Third-party dependencies retain their respective licenses.
