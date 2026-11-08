# Avon Relay

HackUTD 2026 Zero Day

The Avon tank is at 799 barrels and rising. The gauge and flow readings fit two faults. Without a response, the tank could reach its shutdown limit of 875 barrels in 12 minutes. One minute at the pump can change whether the crew sends a truck or opens the auxiliary tank.

Avon Relay lets a crew compare those choices before dispatch. It replays the incident with and without a response, shows how long the crew has, and records the decision for the next shift.

## Run it

Use Node.js 18 or newer. Start the console from the project folder.

```sh
npm start
```

Open [localhost:2026](http://localhost:2026). The included scenarios run offline. Press **Control+C** to stop the server. [Mac launch guide](docs/launch.md)

## Try the water scenario

1. Choose **Avon produced water** and click **Run the demo**. The gold line shows the forecast without a response. The green line shows what happens with the selected response.
2. Just above the forecast chart, find **Drive contact check**. Click **Contact latched** to replay one reading. Click **Contact clear** to replay the other. The recommended response changes.
3. Choose a response and click **Stage response**, then **Apply in simulation**. The chart replays the response and Relay saves a dispatch receipt. Click **Generate handoff** to see the reading, response, and action times. [Demo walkthrough](docs/demo.md)

| Field reading | Shutdown window without a response | Cheapest response below the limit | Modeled cost |
| --- | ---: | --- | ---: |
| No additional reading | 12 to 19 min | Throttle North Pad and send a truck | $978 |
| Contact latched | 12 to 16 min | Throttle North Pad and send a truck | $981 |
| Contact clear | 16 to 19 min | Open the auxiliary tank | $662 |
| Portable meter reads low | 12 to 19 min | Open the West Yard bypass | $1,748 |

The contact check takes one minute. The portable meter takes four minutes and leaves both faults possible. The costs include the check and its effect on the response. When the contact is clear, the auxiliary tank keeps the modeled peak at 864 barrels, 11 below shutdown.

## Try the disturbance test

Open **Disturbance test**. Set **Gauge** to **Fine gauge** and **Pulse size** to **+0.016 r**. Click **Run simulated pulse**. All three readings differ by three seconds. Switch to **Panel gauge** and run the same pulse. Two readings still match at the deadline. Select **+0.08 r** to see a faster pulse that crosses the limit. Relay blocks it and shows how far it goes over in the **Absurdity Gap**.

Click **Phase test** at the top of the disturbance section. Eight states share the same entropy and memory readings. Click **Read phase 1**, then **Read phase 2** and **Read phase 3** to narrow them down to one. [Method and sources](docs/method.md#disturbance-test)

## How the forecast works

Each field reading updates which fault cases are still possible. The simulator advances the tank volume or temperature minute by minute and delays each action by the time spent checking and mobilizing. It compares response costs among plans that stay below the protective limit in every remaining modeled case. The animated replay shows the readings, action times, and downstream effects.

The included cases use simulated readings, costs, and equipment. Applying a response writes a simulated dispatch receipt to `.relay/dispatches/`. [Method and sources](docs/method.md)

## Other scenarios

- **Avon data center** follows a cooling fault through a shift change and compares responses before the rack row reaches its temperature limit.
- **Avon Exchange property** connects a cooling fault to tenant commitments. The recommended response reduces modeled tenant exposure from $2,391 to $0 over 30 minutes.
- **EOG practice data** loads a network, operations settings, and telemetry. Relay flags pump failures, possible wear, and possible leaks, then compares response options and shared truck allocations. [EOG practice files](https://github.com/nihaal419/HackUTD-ZeroDay)

Put `network.json`, `ops.json`, and `telemetry.csv` in the same folder. Pass that folder’s path when you start Relay.

```sh
npm start -- --eog "/path/to/eog-data"
```

Run `npm test` for the engine, importer, and server tests.
