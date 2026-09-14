// Minimal Property Inspector plumbing — no CDN, no build step.
// Any <input>/<select>/<textarea> with a name attribute is bound to the setting of that name.
let socket, uuid, settings = {};

window.connectElgatoStreamDeckSocket = (port, inUUID, registerEvent, info, actionInfo) => {
  uuid = inUUID;
  try { settings = JSON.parse(actionInfo).payload.settings || {}; } catch { settings = {}; }
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.onopen = () => { socket.send(JSON.stringify({ event: registerEvent, uuid })); hydrate(); };
  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === "didReceiveSettings") { settings = msg.payload.settings || {}; hydrate(); }
  };
};

function save() {
  socket?.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
}

function coerce(el) {
  return el.type === "number" || el.type === "range" ? Number(el.value) : el.value;
}

function hydrate() {
  for (const el of document.querySelectorAll("[name]")) {
    const v = settings[el.name];
    if (v !== undefined && v !== null) {
      if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    } else if (el.dataset.default !== undefined) {
      if (el.type === "checkbox") el.checked = el.dataset.default === "true"; else el.value = el.dataset.default;
      settings[el.name] = el.type === "checkbox" ? el.checked : coerce(el);
    }
  }
  reveal();
  save();
}

/// Rows tagged data-show-when="mode=set" only appear when that setting has that value.
function reveal() {
  for (const row of document.querySelectorAll("[data-show-when]")) {
    const [k, v] = row.dataset.showWhen.split("=");
    row.style.display = String(settings[k]) === v ? "" : "none";
  }
}

document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.name) return;
  settings[el.name] = el.type === "checkbox" ? el.checked : coerce(el);
  reveal();
  save();
});
