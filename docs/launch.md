# Launch Avon Relay on a Mac

## 1. Download the project

Sign in to GitHub and [download the current project ZIP](https://github.com/ezernackchristopher97-cloud/hack-utd-day-zero-2026/archive/refs/heads/main.zip). Keep the ZIP in **Downloads**. Its filename should be `hack-utd-day-zero-2026-main.zip`. If the browser renamed a duplicate, move the older ZIP aside and rename the new one to that filename.

Relay runs on Node 18 or newer. If you need Node, install [Node.js LTS](https://nodejs.org/en/download), then open a new Terminal window. The project has no install step, keys, or cloud services.

## 2. Start the demo

Open **Terminal** and paste the entire block. It opens a clean copy of the download, runs the tests, and starts the console. Keep Terminal open while you use it.

```bash
/bin/bash <<'AVON'
set -e
command -v npm >/dev/null || { echo 'Install Node.js LTS, then open Terminal again.'; exit 1; }
zip="$HOME/Downloads/hack-utd-day-zero-2026-main.zip"
[ -f "$zip" ] || { echo "Download the GitHub ZIP to $zip first."; exit 1; }
demo="$(mktemp -d "$HOME/Downloads/avon-relay-demo.XXXXXX")"
/usr/bin/unzip -q "$zip" -d "$demo"
cd "$demo/hack-utd-day-zero-2026-main"
npm test
npm start
AVON
```

Open [http://localhost:2026](http://localhost:2026). Click **Run the demo** to watch both forecasts. Select either drive contact reading to start that replay. Choose a response, stage it, and apply it to replay the response and save a dispatch in `.relay/dispatches/`.

## 3. Use another device or stop

Press **Control+C** to stop. To open the demo on another device, change the last `npm start` line in the block to `npm start -- --host 0.0.0.0` and run it again. Open the Wi-Fi URL printed by the server on the second device. Both devices should be on the same trusted network. If the port is busy, use `npm start -- --port 2027` and open [http://localhost:2027](http://localhost:2027).

To reuse the same copy, open Terminal, type `cd `, drag the extracted `hack-utd-day-zero-2026-main` folder into Terminal, and press Enter. Then run `npm start`.
