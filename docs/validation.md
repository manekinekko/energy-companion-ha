# Validation

## Actual Home Assistant runtime

`tests/test_integration.py` uses **the real HA runtime**, without replacing its dependencies with mocks. Tests create a temporary directory, start HA, load the integration, and stop HA. Input entities and measurements are fictional. Each case runs in a fresh interpreter: restarting multiple HA instances and event loops within one process caused a runtime finalization crash. The runner also checks each process's normal exit code; a crash after successful assertions still fails the test.

Validated environment: the official **Home Assistant 2026.9.2** image with **Python 3.14.6**, locally on Linux ARM64 and in GitHub CI on Linux AMD64. `scripts/test-ha.sh` pins the multiarchitecture image-index digest so the container engine selects the correct native architecture. No ports are published. The container runs with `--network none`, the checkout is mounted read-only, and no user HA directory is mounted.

```sh
sh scripts/test-ha.sh
```

The six runtime cases cover entry creation, options forms, removal of optional fields, reconfiguration, Wh/kWh/MWh and Celsius/Fahrenheit/Kelvin normalization, missing/invalid/unavailable sources, event-driven updates, multiple entries, unload/reload/removal, and static resources. The Recorder test imports fictional values into a **real SQLite database** and invokes the official statistics API processing: millisecond hourly boundaries, Wh-to-kWh conversion, meter reset handling, and preservation of a gap.

HA emits its normal "custom integration ... not tested by Home Assistant" warning. These tests are not HA certification. Internal aiohttp/Rich warnings and mDNS socket warnings in the network-isolated environment may also appear.

Initial macOS virtualenv installation attempts were blocked by package transport failures: inaccessible public downloads and an HTTP 403 from the configured mirror for `aiooui`. These attempts do not count as validation. The official container replaced that testing route. No global Python or network settings were modified.

The first GitHub HA job failed before Python started because an ARM64-only image digest was used on an AMD64 runner (`exec format error`). Pinning the official multiarchitecture index fixed the architecture mismatch; subsequent runtime validation passed on both architectures.

## Mathematical models and frontend

```sh
npm ci --ignore-scripts
npm run build
npm test
npx playwright install firefox
```

All 11 original mathematical model tests are retained. Additional tests cover units, HA-local period boundaries, 23-hour/25-hour days, incomplete windows, meter resets, COP, and avoiding double-counted backup energy. The earlier independent 21,504-point comparison against a JVM reference concerned the preserved chart formulas; that JVM comparison was not rerun here and does not certify a hardware controller.

For the card browser journey, start this server from the repository root:

```sh
node scripts/serve.mjs
```

Then run:

```sh
npm run test:browser
```

The card is exercised in a **mocked HA frontend harness**, distinct from the native HA runtime-loading tests. Coverage includes simulated live state, unavailable inputs, Recorder gaps, local scenarios, CSV export, light/dark themes, small screens, multiple cards, the project title, and no service commands or external requests. The standalone demo browser test has been removed; its mathematical model tests remain in the Node suite.

Firefox is the validated browser engine. Chromium crashes at startup in the project's macOS environment; no Chromium validation is claimed. Local screenshots are written to `screenshots/` and are not automatically published.

The reproducible browser setup uses Playwright **1.58.2** and Firefox **146.0.1 (build 1509)**, with lockfiles pointing to the public npm registry. Initial journeys also ran with an already-installed Firefox engine, but distributed files do not depend on that local cache.

The GitHub workflow runs the actual HA tests, reproducible frontend installation, deterministic build check, Node tests, and the Firefox card journey. A frontend harness pass alone is not evidence of native HA loading.

## Verified API references

- [HA configuration flow](https://developers.home-assistant.io/docs/core/integration/config_flow/) and [OptionsFlowWithReload](https://developers.home-assistant.io/docs/core/integration/options_flow/).
- [Asynchronous static-resource registration](https://developers.home-assistant.io/blog/2024/06/18/async_register_static_paths/).
- [Lovelace resources](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources/).
- Official implementations in `homeassistant/components/recorder/websocket_api.py`, `statistics.py`, `helpers/selector.py`, and `config_entries.py`, inspected in the tested runtime. Tests execute these APIs rather than assuming signatures from older releases still work.

## Outside the validation scope

No testing on the user's live Home Assistant, no connection to a heat pump, no energy calibration, and no sanitary or hydraulic validation. HA versions older than 2026.9.2 and future versions are not guaranteed. Custom HA themes must maintain their own accessible contrast.
