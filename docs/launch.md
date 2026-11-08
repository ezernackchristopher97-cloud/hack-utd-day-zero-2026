# Launch Absurdity Gate on a Mac

## 1. Download the project

Save `absurdity-gate-demo.zip` in **Downloads**. If Safari extracts it, keep the `absurdity-gate` folder there. If you already have the project folder open in Terminal, skip to the command in [Run it](../README.md#run-it).

Absurdity Gate runs on Node 18 or newer. If needed, install [Node.js LTS](https://nodejs.org/en/download) and open a new Terminal window.

## 2. Start the demo

Open **Terminal** and paste the whole block. It extracts the ZIP into a fresh folder and opens Absurdity Gate at a fresh browser address.

```bash
/bin/bash <<'ABSURDITY_GATE'
set -e
downloads="$HOME/Downloads"
demo="$(mktemp -d "$downloads/absurdity-gate.XXXXXX")"
if [ -f "$downloads/absurdity-gate-demo.zip" ]; then
  /usr/bin/unzip -q "$downloads/absurdity-gate-demo.zip" -d "$demo"
elif [ -d "$downloads/absurdity-gate" ]; then
  cp -R "$downloads/absurdity-gate" "$demo/absurdity-gate"
else
  echo 'Save absurdity-gate-demo.zip in Downloads first.'
  exit 1
fi
cd "$demo/absurdity-gate"
grep -Fq '<title>Absurdity Gate</title>' public/index.html || { echo 'This download is not Absurdity Gate.'; exit 1; }
npm start -- --port 0 --open
ABSURDITY_GATE
```

Keep Terminal open while using the app. Click **Run the demo**, then use **Contact latched** and **Contact clear** just above the forecast chart. [Demo walkthrough](demo.md)

## 3. Use another device or stop

Press **Control+C** to stop. To open the demo on another device on the same trusted network, start it with `npm start -- --port 0 --host 0.0.0.0` and open the Wi-Fi address printed in Terminal.

If you downloaded the [GitHub source ZIP](https://github.com/ezernackchristopher97-cloud/hack-utd-day-zero-2026/archive/refs/heads/main.zip), extract it and open its project folder in Terminal. Run `npm start -- --port 0 --open`.
