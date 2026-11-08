# Launch Absurdity Gate on a Mac

## 1. Download the project

Save `absurdity-gate-replay.zip` in **Downloads**. If Safari extracts it, keep the `absurdity-gate-replay` folder there. If you already have the project folder open in Terminal, skip to the command in [Run it](../README.md#run-it).

Absurdity Gate runs on Node 18 or newer. If needed, install [Node.js LTS](https://nodejs.org/en/download) and open a new Terminal window.

## 2. Start the demo

Open **Terminal** and paste the whole block. It extracts the ZIP into a fresh folder and opens Absurdity Gate at a fresh browser address.

```bash
/bin/bash <<'ABSURDITY_GATE'
set -e
downloads="$HOME/Downloads"
build=absurdity-gate-replay
demo="$(mktemp -d "$downloads/$build.XXXXXX")"
if [ -f "$downloads/$build.zip" ]; then
  /usr/bin/unzip -q "$downloads/$build.zip" -d "$demo"
elif [ -d "$downloads/$build" ]; then
  cp -R "$downloads/$build" "$demo/$build"
else
  echo "Save $build.zip in Downloads first."
  exit 1
fi
cd "$demo/$build"
grep -Fq 'Run suggested pulse' public/index.html || { echo "Download $build.zip again."; exit 1; }
npm start -- --port 0 --open
ABSURDITY_GATE
```

Keep Terminal open while using the app. Click **Run the demo**, then use **Contact latched** and **Contact clear** just above the forecast chart. [Demo walkthrough](demo.md)

## 3. Use another device or stop

Press **Control+C** to stop. To open the demo on another device on the same trusted network, start it with `npm start -- --port 0 --host 0.0.0.0` and open the Wi-Fi address printed in Terminal.

If you downloaded the [GitHub source ZIP](https://github.com/ezernackchristopher97-cloud/hack-utd-day-zero-2026/archive/refs/heads/main.zip), extract it and open its project folder in Terminal. Run `npm start -- --port 0 --open`.
