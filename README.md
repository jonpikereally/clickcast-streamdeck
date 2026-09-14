# ClickCast Deck

Stream Deck plugin for [ClickCast](https://github.com/jonpikereally/Clickcast), the macOS menu bar app that makes the mouse and keyboard shortcuts visible in screen recordings. Adds a **ClickCast** category with nine actions; keys mirror the app's live state and show "no app" when it isn't running (press to launch it).

| Action | Key | Dial |
|---|---|---|
| Pause / Resume | Lit while the overlay is showing. Toggle, or force pause / resume. | |
| Cursor Highlight, Click Ripples, Keystrokes | Lit while that layer is on. Toggle, or force on / off. | |
| Keystroke Mode | Shortcuts only ↔ everything you type. | |
| Size | Cycle or jump to a cursor ring size, or the keystroke text size. | Rotate to step, press to reset to Medium. |
| Highlight Colour | Cycle or jump to a colour. The key shows the colour. | |
| Keystroke Position | Cycle or jump to one of the six positions. | |
| Show Message | Flash your own text in the on-screen pill for N seconds. | |

## Install

Quit Stream Deck, copy the plugin into its plugins folder, and reopen it:

```bash
osascript -e 'quit app "Stream Deck"'; D="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins"; rm -rf "$D/com.jonpike.clickcastdeck.sdPlugin" && cp -R com.jonpike.clickcastdeck.sdPlugin "$D/" && open -a "Stream Deck"
```

If this folder is checked out as `streamdeck/` inside the ClickCast app folder, the app's `install.sh` does this for you.

Requires Stream Deck 6.9+ on macOS 13+, and ClickCast running (it exposes a loopback-only HTTP API on `127.0.0.1:8766`; the plugin never touches the network).

## How it works

`bin/plugin.js` is plain Node (the Stream Deck app supplies Node 20; the `ws` client is vendored in `bin/node_modules`, no build step). It polls `GET /state` once a second and sends `POST /pause`, `/toggle`, `/choose`, `/message` on key presses. Property inspectors in `ui/` are static HTML bound to settings by `ui/pi.js`.

Icons are drawn as SVG in `imgs/`; `render-icons.sh` rasterises them to the PNG + @2x pairs Stream Deck wants.

## Test

With ClickCast running (or its headless test harness from the app repo):

```bash
node tools/test-plugin.js
```

hosts a fake Stream Deck websocket, launches the plugin against it, presses keys and turns the dial, and checks the states and titles the plugin sends back.
