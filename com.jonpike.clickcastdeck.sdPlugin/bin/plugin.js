// ClickCast Deck — Stream Deck plugin for the ClickCast menu bar app.
// Drives the app's loopback control server (127.0.0.1:8766) and mirrors its state onto the keys.

const WebSocket = require("ws");
const { execFile } = require("child_process");

const BASE = "http://127.0.0.1:8766";
const BUNDLE_ID = "com.jonpike.clickcast";
const POLL_MS = 1000;

// --- Stream Deck registration -------------------------------------------------

const argv = {};
for (let i = 2; i < process.argv.length; i += 2) {
  argv[process.argv[i].replace(/^-+/, "")] = process.argv[i + 1];
}
const ws = new WebSocket(`ws://127.0.0.1:${argv.port}`);
const send = (obj) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj));
ws.on("open", () => send({ event: argv.registerEvent, uuid: argv.pluginUUID }));
const log = (msg) => send({ event: "logMessage", payload: { message: `[clickcastdeck] ${msg}` } });

// --- App control surface ------------------------------------------------------

let app = null;                 // last state from the app, or null when unreachable
let launching = false;
const contexts = new Map();

async function call(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(BASE + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    app = await res.json();
    launching = false;
    return app;
  } catch {
    app = null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function launchApp() {
  if (launching) return;
  launching = true;
  execFile("open", ["-b", BUNDLE_ID], (err) => {
    if (err) { log(`launch failed: ${err.message}`); launching = false; }
  });
  setTimeout(() => { launching = false; }, 8000);
}

setInterval(() => { if (contexts.size) call("/state").then(renderAll); }, POLL_MS);

// --- Rendering ----------------------------------------------------------------

const LABELS = {
  small: "Small", medium: "Medium", large: "Large", huge: "Huge",
  yellow: "Yellow", orange: "Orange", green: "Green", blue: "Blue", pink: "Pink", white: "White",
  bottomLeft: "Bottom\nLeft", bottomCenter: "Bottom\nCenter", bottomRight: "Bottom\nRight",
  topLeft: "Top\nLeft", topCenter: "Top\nCenter", topRight: "Top\nRight",
};
const COLOR_HEX = {
  yellow: "#FFD61A", orange: "#FF8C26", green: "#4DE666", blue: "#4DA6FF", pink: "#FF66B3", white: "#FFFFFF",
};
const label = (v) => LABELS[v] ?? String(v ?? "");

/// Ring swatch for the colour key.
function ringImage(hex) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
    `<rect width="144" height="144" rx="24" fill="#1c1c22"/>` +
    `<circle cx="72" cy="66" r="34" fill="${hex}" fill-opacity="0.3" stroke="${hex}" stroke-width="7"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

const offline = () => (launching ? "starting…" : "no app");

function renderAll() {
  for (const [context, entry] of contexts) render(context, entry);
}

function render(context, entry) {
  const { action, settings, controller } = entry;
  const short = action.split(".").pop();
  const setState = (on) => send({ event: "setState", context, payload: { state: on ? 1 : 0 } });
  const setTitle = (title) => send({ event: "setTitle", context, payload: { title } });

  if (controller === "Encoder") {
    const key = settings.target === "hudSize" ? "hudSize" : "cursorSize";
    const opts = app?.options?.[key] ?? [];
    const idx = app ? opts.indexOf(app[key]) : -1;
    send({
      event: "setFeedback",
      context,
      payload: {
        title: !app ? offline() : key === "hudSize" ? "Text Size" : "Cursor Size",
        value: app ? label(app[key]) : "—",
        indicator: { value: idx < 0 ? 0 : Math.round((idx / Math.max(1, opts.length - 1)) * 100) },
      },
    });
    return;
  }

  switch (short) {
    case "pause":
      setState(!!app && !app.paused);
      setTitle(app ? "" : offline());
      break;
    case "cursor":
      setState(!!app && app.cursorHighlight);
      setTitle(app ? "" : offline());
      break;
    case "ripples":
      setState(!!app && app.clickRipples);
      setTitle(app ? "" : offline());
      break;
    case "keystrokes":
      setState(!!app && app.keystrokes);
      setTitle(app ? "" : offline());
      break;
    case "mode":
      setState(!!app && app.shortcutsOnly);
      setTitle(!app ? offline() : app.shortcutsOnly ? "Shortcuts" : "All Keys");
      break;
    case "size": {
      const key = settings.target === "hudSize" ? "hudSize" : "cursorSize";
      if (settings.mode === "set") setTitle(label(settings.value ?? "medium"));
      else setTitle(app ? label(app[key]) : offline());
      break;
    }
    case "color": {
      const name = settings.mode === "set" ? (settings.value ?? "yellow") : app?.highlightColor;
      const hex = settings.mode === "set" ? COLOR_HEX[name] : app?.highlightHex;
      send({ event: "setImage", context, payload: { image: hex ? ringImage(hex) : "" } });
      setTitle(app ? "" : offline());
      break;
    }
    case "position":
      if (settings.mode === "set") setTitle(label(settings.value ?? "bottomCenter"));
      else setTitle(app ? label(app.hudPosition) : offline());
      break;
    case "message":
      setTitle(app ? "" : offline());
      break;
  }
}

// --- Input --------------------------------------------------------------------

async function act(context, path, body) {
  const result = await call(path, body);
  if (!result) {
    // App isn't running: launch it and let the poll pick it up.
    launchApp();
    send({ event: "showAlert", context });
  }
  renderAll();
}

const onOff = (mode) => (mode === "on" ? { on: true } : mode === "off" ? { on: false } : {});

ws.on("message", async (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  const { event, context, action, payload = {} } = msg;
  const settings = payload.settings || {};
  const short = (action || "").split(".").pop();

  switch (event) {
    case "willAppear":
      contexts.set(context, { action, settings, controller: payload.controller || "Keypad" });
      await call("/state");
      renderAll();
      break;

    case "willDisappear":
      contexts.delete(context);
      break;

    case "didReceiveSettings": {
      const entry = contexts.get(context);
      if (entry) entry.settings = settings;
      renderAll();
      break;
    }

    case "keyDown": {
      const mode = settings.mode || "toggle";
      switch (short) {
        case "pause":
          if (!app) { launchApp(); renderAll(); break; }
          await act(context, "/pause", mode === "toggle" ? { toggle: true } : { paused: mode === "pause" });
          break;
        case "cursor":
          await act(context, "/toggle", { key: "cursorHighlight", ...onOff(mode) });
          break;
        case "ripples":
          await act(context, "/toggle", { key: "clickRipples", ...onOff(mode) });
          break;
        case "keystrokes":
          await act(context, "/toggle", { key: "keystrokes", ...onOff(mode) });
          break;
        case "mode":
          await act(context, "/toggle", {
            key: "shortcutsOnly",
            ...(mode === "shortcuts" ? { on: true } : mode === "all" ? { on: false } : {}),
          });
          break;
        case "size": {
          const key = settings.target === "hudSize" ? "hudSize" : "cursorSize";
          await act(context, "/choose", mode === "set" ? { key, value: settings.value ?? "medium" } : { key, step: 1 });
          break;
        }
        case "color":
          await act(context, "/choose", mode === "set"
            ? { key: "highlightColor", value: settings.value ?? "yellow" }
            : { key: "highlightColor", step: 1 });
          break;
        case "position":
          await act(context, "/choose", mode === "set"
            ? { key: "hudPosition", value: settings.value ?? "bottomCenter" }
            : { key: "hudPosition", step: 1 });
          break;
        case "message":
          await act(context, "/message", {
            text: settings.text || "👀",
            seconds: Number(settings.seconds ?? 2.5),
          });
          break;
      }
      break;
    }

    case "dialRotate": {
      const key = settings.target === "hudSize" ? "hudSize" : "cursorSize";
      const ticks = payload.ticks || 0;
      if (ticks) await act(context, "/choose", { key, step: ticks > 0 ? 1 : -1 });
      break;
    }

    case "dialDown":
    case "touchTap": {
      const key = settings.target === "hudSize" ? "hudSize" : "cursorSize";
      await act(context, "/choose", { key, value: "medium" });
      break;
    }
  }
});

ws.on("error", (e) => log(`socket error: ${e.message}`));
