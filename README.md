# Avon Relay

HackUTD Day Zero 2026

The Avon tank is filling. The gauge and flow readings fit two different faults. A one-minute check at the pump tells the crew whether to send the truck or open the auxiliary tank.

## Run it

Install Node.js 18 or newer. Download and unzip the project. In Terminal, type `cd `, drag the unzipped project folder into the window, and press Enter. [Download the project ZIP](https://github.com/ezernackchristopher97-cloud/hack-utd-day-zero-2026/archive/refs/heads/main.zip) · [Mac launch guide](docs/launch.md)

```sh
npm start
```

Open [localhost:2026](http://localhost:2026). Press **Control+C** in Terminal to stop. The built-in cases run offline. Run `npm test` to check the project.

To open Relay on a second device, run `npm start -- --host 0.0.0.0`. On the same trusted Wi-Fi network, open the address printed in Terminal.

## Try the water case

Open **Avon produced water**. Under **What would change your mind?**, try both results of the drive contact check.

| Contact reading | Shutdown window if the crew does nothing | Response | Simulated cost |
| --- | ---: | --- | ---: |
| Latched | 12–16 minutes | Throttle the well pad and send the truck | $981 |
| Clear | 16–19 minutes | Open the auxiliary tank | $662 |

Try the portable flow meter next. It takes four minutes and leaves both faults in play. The lowest-cost response that stays within the limit is the $1,748 bypass.

Pick a response, then **Stage response → Apply in simulation → Play**. The shift handoff records the reading and the chosen response. Dispatch receipts go in `.relay/dispatches/`.

**Avon data center** follows a cooling fault through a shift change. **Avon Exchange property** estimates which tenants are affected by an equipment failure and for how long. [Demo steps](docs/demo.md) · [Method and sources](docs/method.md)

## Load EOG practice data

Put `network.json`, `ops.json`, and `telemetry.csv` in the same folder. Start Relay with that folder's path. The imported cases appear first in the scenario list. [EOG practice files](https://github.com/nihaal419/HackUTD-ZeroDay)

```sh
npm start -- --eog "/path/to/eog-data"
```
