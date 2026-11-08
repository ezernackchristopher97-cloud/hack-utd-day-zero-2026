# Avon Relay

HackUTD 2026 · Zero Day

The Avon tank is at 799 barrels and rising. The gauge and flow readings fit two faults, and without a response the tank could hit its 875-barrel shutdown limit in as little as 12 minutes. One minute at the pump can change whether the crew sends a truck or opens the auxiliary tank.

Avon Relay lets a crew compare those choices before dispatch. It replays the incident with and without a response, shows how long the crew has, and records the decision for the next shift.

## Run it

Use Node.js 18 or newer. Start the console from the project folder.

```sh
npm start
```

Open [localhost:2026](http://localhost:2026). The built-in scenarios run offline. Press **Control+C** to stop the server. [Mac launch guide](docs/launch.md)

## Try the water scenario

1. Choose **Avon produced water** and click **Run the demo**. The gold line shows the forecast without a response. The green line shows the selected response.
2. Click **Try another field reading**. Replay **Drive trip contact latched** and **Drive trip contact clear** to see how the shutdown window and the response change.
3. Choose a response and click **Stage response → Apply in simulation**. The chart starts moving again and Relay saves a dispatch receipt. Click **Generate handoff** to see the reading, response, and action times.

| Field reading | Shutdown window without a response | Lowest-cost response below the limit | Modeled cost |
| --- | ---: | --- | ---: |
| No additional reading | 12–19 min | Throttle North Pad and send a truck | $978 |
| Drive contact latched | 12–16 min | Throttle North Pad and send a truck | $981 |
| Drive contact clear | 16–19 min | Open the auxiliary tank | $662 |
| Portable meter reads low | 12–19 min | Open the West Yard bypass | $1,748 |

The contact check takes one minute. The portable meter takes four minutes and leaves both faults possible. The costs include the check and its effect on the response. In the clear-contact case, the auxiliary tank keeps the modeled peak at 864 barrels, 11 below shutdown.

## Try the disturbance test

Open **Disturbance test**. The same gauge reading fits three models. Apply a simulated pulse and watch one trace recover, one hold steady, and one grow. Relay finds the smallest available pulse that separates all three gauge readings by the exercise deadline and stays inside the exercise limit. Try **0.016** with the panel gauge and then the fine gauge. Select **0.080** to see a faster test blocked by the limit.

The recovery equation comes from Christopher Ezernack’s [Toroidal Manifolds and Recursive Neural Dynamics](https://github.com/ezernackchristopher97-cloud/ENTPTCCONPAPER26/blob/main/paper/main.tex). The **Absurdity Gap** measures how far the pulse goes beyond the limit. Open **EntPTC phase test** to see eight states with the same entropy and memory readings, then narrow them down one phase at a time. These are separate simulation exercises. [Research methods](docs/method.md#disturbance-test)

## How the forecast works

Each field reading updates which fault cases are still possible. The simulator advances the tank volume or temperature minute by minute and delays each action by the time spent checking and mobilizing. It compares response costs among plans that stay below the protective limit in every remaining modeled case. The animated replay shows the readings, action times, and downstream effects.

The built-in cases use simulated readings, costs, and equipment. Applying a response writes a simulated dispatch receipt to `.relay/dispatches/`. [Method and sources](docs/method.md)

## Other scenarios

- **Avon data center** follows a cooling fault through a shift change and compares responses before the rack row reaches its temperature limit.
- **Avon Exchange property** connects a cooling fault to tenant commitments. In the built-in case, the recommended response reduces modeled tenant exposure from $2,391 to $0 over 30 minutes.
- **EOG practice data** loads a network, operations settings, and telemetry. Relay flags pump failures, possible wear, and possible leaks, then compares response options and shared truck allocations. [EOG practice files](https://github.com/nihaal419/HackUTD-ZeroDay)

Put `network.json`, `ops.json`, and `telemetry.csv` in the same folder. Pass that folder’s path when you start Relay.

```sh
npm start -- --eog "/path/to/eog-data"
```

Run `npm test` for the engine, importer, and server tests.
