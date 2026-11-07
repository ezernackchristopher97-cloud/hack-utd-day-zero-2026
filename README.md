# Hack UTD Day Zero 2026

## Avon Relay

A night shift console for operators who have a warning, incomplete evidence, and minutes to act. Compare what happens with and without a response, see which services are exposed, and create a simulated work order and shift handoff.

### Start here

1. Install [Node.js LTS](https://nodejs.org/en/download) if `node --version` does not print a version. Relay needs Node 18 or newer.
2. Open Terminal and go to the project folder that contains `package.json`.
3. Run `npm start` and leave Terminal open.
4. Open [http://localhost:2026](http://localhost:2026). Press **Control+C** in Terminal when you are done.

There are no packages to install or keys to enter. The built-in exercises run offline. Run `npm test` to check the project.

### Open from another device on the same Wi-Fi

Start Relay with `npm start -- --host 0.0.0.0`. On a Mac, run `ipconfig getifaddr en0` in a second Terminal window to find its Wi-Fi address. If that prints nothing, look under **System Settings → Wi-Fi → Details → TCP/IP**. On the second device, open `http://YOUR-ADDRESS:2026` using that address. Both devices need to be on the same trusted network.

### Bring your own EOG exercise

Put `network.json`, `ops.json`, and `telemetry.csv` together. Type `npm start -- --eog ` in Terminal, drag the folder into that window, and press Enter. Imported scenarios appear before the built-in exercises. Inputs are read locally. See the [EOG challenge repository](https://github.com/nihaal419/HackUTD-ZeroDay) for formats and practice files.

### One-minute walkthrough

1. Open **Avon produced water**. Compare the no-response deadline range with the response preview.
2. Run the independent local trip check in **Evidence**. See how it changes the range of possible outcomes. Try the slower flow check to see the cost of waiting.
3. Stage and apply a response. Replay through the original deadline. Copy the handoff or keep the work-order ID.
4. Switch to the building exercise to see the same workflow connect equipment failure to tenant commitments.

[Demo steps](docs/demo.md) · [Method and sources](docs/method.md)

| Path | Purpose |
| --- | --- |
| `public/` | Console, forecast, and replay |
| `server.mjs` | Local API and simulated dispatch receipts |
| `lib/engine.mjs` | Time-step simulation, cascade, and response ranking |
| `lib/evidence.mjs` | Evidence updates and probe scoring |
| `lib/eog.mjs` | Challenge file import and fleet allocation |
| `lib/scenarios.mjs` | Built-in exercises |
| `test/` | Automated checks |

All actions are simulated. Forecasts, costs, and exposure depend on exercise assumptions. Dispatch receipts are saved under `.relay/dispatches/`.
