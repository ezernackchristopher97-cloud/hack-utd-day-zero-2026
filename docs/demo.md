# Absurdity Gate demo

## Water scenario

1. Choose **Avon produced water**. Click **Run the demo** at the top of the page. The chart starts moving and shows the tank forecast with and without a response.
2. Just above the forecast chart, find **Drive contact check**. Click **Contact latched**. The replay recommends throttling North Pad and sending a truck.
3. Click **Contact clear**. The replay recommends opening the auxiliary tank. In the simulation, that keeps the tank below its shutdown limit for $662.
4. To save this response, select it and click **Stage response**, then **Apply in simulation**. Click **Generate handoff** to see what the next shift needs.

## Disturbance test

1. Click **Disturbance test** next to **Contact clear**. Set **Gauge** to **Fine gauge** and **Pulse size** to **+0.016 r**.
2. Click **Run simulated pulse**. All three gauge readings differ by three seconds. Change **Gauge** to **Panel gauge**, keep the same pulse size, and run it again. Two readings still match at the deadline.
3. Select **+0.08 r** in **Pulse size**. The larger pulse would separate the readings sooner, but it crosses the exercise limit. The app blocks it and shows the violation in the **Absurdity Gap**.

## Phase test

Click **Phase test** at the top right of the disturbance section. Click **Read phase 1**, then **Read phase 2** and **Read phase 3**. The list goes from eight possible states to four, then two, then one.

The demo video limit is two minutes. [Devpost rules](https://hackutd-zeroday.devpost.com/rules)
