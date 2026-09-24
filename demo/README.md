# Energy Assistant Lab

A standalone French-language prototype, preserved alongside the native Home Assistant integration. This guide and the downloadable calculation methodology are in English.

**All data is fictional. No external API is called. No equipment is controlled.**

## Open the demo

Open `index.html` in a browser. It contains its own CSS, scripts, and dataset. It needs neither a server nor an Internet connection.

To serve it locally from this directory:

```sh
python3 -m http.server 8768 --bind 127.0.0.1 --directory .
```

Then open `http://127.0.0.1:8768/`.

The [calculation methodology](methodologie-calculs.md) is a separate English document. Keep it beside `index.html` so its download link works. The filename is retained for compatibility. External analysis material is not part of this web application.

## Features

- Consumption analysis: compressor heating, domestic hot water (DHW), backup heating, costs, and period COP.
- Period comparison, fictional seven-day forecast, and CSV export.
- Simplified, unvalidated DHW calculator and verified heating-curve chart math, with explicit assumptions.
- Simulated multi-occupant presence, preheating, open windows, and supply-temperature modulation.
- Printable monthly summary and PDF export through the browser print dialog.
- Locally saved scenarios and JSON import/export.
- Light/dark modes with a persistent preference, pastel-red styling, and mobile layout.

Theme priority is a valid `?scoutTheme=light` or `?scoutTheme=dark` parameter, then the local preference, then the system preference. The theme button saves the preference and updates the URL parameter if present. Existing storage keys remain unchanged after the project rename, preserving saved demo scenarios and preferences.

Fictional history ends on September 22, 2026. Simulation controls do not rewrite that history. The demo clock advances manually so transitions can be checked.

## Limitations

The two chart formulas were checked in an Android 3.41.2 client, then independently transcribed mathematically with the same single-precision arithmetic and rounding. The 20 to 55 °C bounds remain demo assumptions. This does not establish equivalence with hardware control behavior.

Remote DHW calculation, forecasting, and optimization models are unavailable. Local estimates remain explicitly unvalidated. The dashboard does not quantify attributable automation savings or apply an arbitrary savings coefficient. Period COP is not a certified SCOP. No real authentication, account invitation, or GPS collection is implemented.

Monthly PDF export uses the browser, not an embedded PDF engine.

## Relationship to Home Assistant

The repository now includes a separate [native HA integration and Lovelace card](../README.md), using HA authentication, configurable entities, and Recorder statistics. This standalone demo is still disconnected and fictional; it does not become live when installed beside the integration.

Both implementations are read-only. Future equipment control would require data validation, permissions and logging, sanitary and hydraulic protections, manufacturer limits, and installer validation. A browser tab must never be responsible for heating control.

## Edit and rebuild

Sources: `model.js` contains calculations and state, `app.js` contains interactions, and `template.html` contains structure and styles.

From this directory:

```sh
npm run build
npm test
```

The script produces the standalone HTML and checks that the methodology is available.

The standalone demo browser test has been removed. Its mathematical model tests are still run by `npm test`, both here and from the repository root. The separate Lovelace card retains its own Firefox browser coverage; see [Validation](../docs/validation.md).
