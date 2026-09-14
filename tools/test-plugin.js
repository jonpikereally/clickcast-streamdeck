// Fake Stream Deck: hosts the websocket the plugin registers on, sends it willAppear/keyDown/dialRotate
// events, and checks what the plugin sends back. Needs the ClickCast control server (or test harness) running.
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require(path.join(__dirname, "../com.jonpike.clickcastdeck.sdPlugin/bin/node_modules/ws"));

const wss = new WebSocket.Server({ host: "127.0.0.1", port: 0 });
const port = () => wss.address().port;
let failures = 0;
const check = (label, cond) => { console.log((cond ? "PASS " : "FAIL ") + label); if (!cond) failures++; };
const A = (s) => `com.jonpike.clickcastdeck.${s}`;

wss.on("listening", () => {
  const plugin = spawn("node", [path.join(__dirname, "../com.jonpike.clickcastdeck.sdPlugin/bin/plugin.js"),
    "-port", String(port()), "-pluginUUID", "TESTUUID", "-registerEvent", "registerPlugin", "-info", "{}"], { stdio: "inherit" });

  wss.on("connection", async (ws) => {
    const inbox = [];
    ws.on("message", (raw) => inbox.push(JSON.parse(raw)));
    const send = (o) => ws.send(JSON.stringify(o));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const last = (event, context) => [...inbox].reverse().find((m) => m.event === event && (!context || m.context === context));
    const clear = () => inbox.splice(0);

    await wait(300);
    check("plugin registered", inbox.some((m) => m.event === "registerPlugin" && m.uuid === "TESTUUID"));

    // Pause key appears: app running & not paused → state 1
    send({ event: "willAppear", context: "c_pause", action: A("pause"), payload: { settings: {}, controller: "Keypad" } });
    await wait(400);
    check("pause key lit when app active", last("setState", "c_pause")?.payload.state === 1);

    send({ event: "keyDown", context: "c_pause", action: A("pause"), payload: { settings: {} } });
    await wait(400);
    check("pause toggles → key off", last("setState", "c_pause")?.payload.state === 0);
    send({ event: "keyDown", context: "c_pause", action: A("pause"), payload: { settings: { mode: "resume" } } });
    await wait(400);
    check("resume → key on", last("setState", "c_pause")?.payload.state === 1);

    // Ripples toggle with explicit off/on
    send({ event: "willAppear", context: "c_rip", action: A("ripples"), payload: { settings: { mode: "off" }, controller: "Keypad" } });
    send({ event: "keyDown", context: "c_rip", action: A("ripples"), payload: { settings: { mode: "off" } } });
    await wait(400);
    check("ripples off → state 0", last("setState", "c_rip")?.payload.state === 0);
    send({ event: "keyDown", context: "c_rip", action: A("ripples"), payload: { settings: { mode: "on" } } });
    await wait(400);
    check("ripples on → state 1", last("setState", "c_rip")?.payload.state === 1);

    // Size: jump to large, title shows it; then dial rotate up wraps? (large→huge)
    send({ event: "willAppear", context: "c_size", action: A("size"), payload: { settings: { mode: "set", value: "large" }, controller: "Keypad" } });
    send({ event: "keyDown", context: "c_size", action: A("size"), payload: { settings: { mode: "set", value: "large" } } });
    await wait(400);
    send({ event: "willAppear", context: "c_dial", action: A("size"), payload: { settings: {}, controller: "Encoder" } });
    await wait(400);
    check("dial feedback shows Large", last("setFeedback", "c_dial")?.payload.value === "Large");
    send({ event: "dialRotate", context: "c_dial", action: A("size"), payload: { settings: {}, ticks: 1 } });
    await wait(400);
    check("dial rotate → Huge", last("setFeedback", "c_dial")?.payload.value === "Huge");
    send({ event: "dialDown", context: "c_dial", action: A("size"), payload: { settings: {} } });
    await wait(400);
    check("dial press → Medium", last("setFeedback", "c_dial")?.payload.value === "Medium");

    // Colour: set pink → key image carries the pink hex
    send({ event: "willAppear", context: "c_col", action: A("color"), payload: { settings: { mode: "set", value: "pink" }, controller: "Keypad" } });
    await wait(400);
    check("colour key image is pink swatch", decodeURIComponent(last("setImage", "c_col")?.payload.image || "").includes("#FF66B3"));
    send({ event: "keyDown", context: "c_col", action: A("color"), payload: { settings: { mode: "cycle" } } });
    await wait(400);

    // Position cycle shows title
    send({ event: "willAppear", context: "c_pos", action: A("position"), payload: { settings: { mode: "cycle" }, controller: "Keypad" } });
    send({ event: "keyDown", context: "c_pos", action: A("position"), payload: { settings: { mode: "set", value: "topRight" } } });
    await wait(400);
    check("position title reflects app state", last("setTitle", "c_pos")?.payload.title === "Top\nRight");

    // Message
    clear();
    send({ event: "willAppear", context: "c_msg", action: A("message"), payload: { settings: { text: "Watch this", seconds: 1 }, controller: "Keypad" } });
    send({ event: "keyDown", context: "c_msg", action: A("message"), payload: { settings: { text: "Watch this", seconds: 1 } } });
    await wait(400);
    check("message key press caused no alert", !inbox.some((m) => m.event === "showAlert"));

    // restore defaults
    send({ event: "keyDown", context: "c_col", action: A("color"), payload: { settings: { mode: "set", value: "yellow" } } });
    send({ event: "keyDown", context: "c_pos", action: A("position"), payload: { settings: { mode: "set", value: "bottomCenter" } } });
    await wait(400);

    console.log(failures ? `${failures} FAILED` : "ALL PASS");
    plugin.kill();
    process.exit(failures ? 1 : 0);
  });
});
