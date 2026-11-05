import { SCHEMA, derive, toFile, fromFile, normalize, slug } from "./profile.js";
import { PRESETS } from "./presets.js";
import { loadConfigs, fileFor, saveConfig } from "./configs.js";
import { Motor } from "./motor.js";
import { Body } from "./body.js";
import { Course } from "./course.js";
import { Input } from "./input.js";
import { Renderer } from "./render.js";
import { Panel } from "./panel.js";
import { predictAll } from "./predict.js";
import DEFAULT_COURSE from "./course_default.js";

const STORE = { profile: "jumplab.profile", lab: "jumplab.lab", course: "jumplab.course" };
const LAB_DEFAULTS = {
  tick_rate: 60, time_scale: 1, body_width: 0.56, body_height: 1.2,
  show_predictions: true, paint: false, lock_walk: false,
};
const START_PRESET = 1; // "2D3D + double jump"
const FALL_LIMIT = 8; // cells below the course

// --- state ---------------------------------------------------------------------

const lab = { ...LAB_DEFAULTS, ...load(STORE.lab) };
let profile = loadProfile();
let course = new Course(localStorage.getItem(STORE.course) ?? DEFAULT_COURSE);
let menu = PRESETS; // replaced by the files in configs/ once they have loaded

const motor = new Motor(profile.params);
const body = new Body(lab.body_width, lab.body_height);
const input = new Input();
const renderer = new Renderer(document.getElementById("view"));
const readout = document.getElementById("readout");
const hint = document.getElementById("hint");
const toast = document.getElementById("toast");

let station = 0;
let predictions = [];
let anchor = null; // where the predicted arcs start (feet at take-off)
let anchorFacing = 1;
let prevPos = { x: 0, y: 0 };

// The jump being flown right now, measured rather than predicted.
let flight = null;
let trace = null;
let lastTrace = null;
let pinned = null;
const history = [];

// --- panel ---------------------------------------------------------------------

const panel = new Panel(document.getElementById("panel"), {
  onParam(key, value) {
    const before = profile.params;
    const next = { ...before, [key]: value };
    if (lab.lock_walk && (key === "jump_rise_time" || key === "jump_fall_time")) {
      const walk = derive(before).walk_speed;
      next.jump_distance = walk * (next.jump_rise_time + next.jump_fall_time);
    }
    setParams(next);
  },
  onName(name) { profile.name = name; save(); },
  onConfig(i) {
    const config = menu[i];
    profile = { name: config.name, params: { ...config.params } };
    applyLab(config.lab);
    setParams(profile.params);
    panel.setName(profile.name);
    note(`loaded config: ${config.name}`);
  },
  async onImport(file) {
    try {
      const data = fromFile(JSON.parse(await file.text()));
      profile = { name: data.name, params: data.params };
      applyLab(data.lab);
      setParams(profile.params);
      panel.setName(profile.name);
      note(`imported ${file.name}`);
    } catch (e) {
      note(`could not read ${file.name}: ${e.message}`);
    }
  },
  async onSave() {
    const file = fileFor(profile.name, menu);
    try {
      const old = menu.find((c) => c.file === file);
      const created = await saveConfig(file, { ...fileData(), note: old?.note });
      await refreshConfigs();
      note(`${created ? "created" : "updated"} configs/${file}`);
    } catch (e) {
      note(e.message);
    }
  },
  onExport() {
    download(`${slug(profile.name)}.json`, JSON.stringify(fileData(), null, 2) + "\n", "application/json");
  },
  async onCopy() {
    await copy(JSON.stringify(fileData(), null, 2));
    note("JSON copied to the clipboard");
  },
  async onShare() {
    const url = `${location.origin}${location.pathname}#p=${encode(fileData())}`;
    await copy(url);
    note("link copied - it opens the lab with these values");
  },
  onLab(key, value) { applyLab({ [key]: value }); },
  onStation(i) { goTo(i); },
  onPin() { pin(); },
  onExportCourse() { download("course.txt", course.toText(), "text/plain"); },
  onResetCourse() {
    localStorage.removeItem(STORE.course);
    course = new Course(DEFAULT_COURSE);
    panel.setStations(course.stations);
    goTo(Math.min(station, course.stations.length - 1));
    note("course reset");
  },
});

panel.setConfigs(menu);
refreshConfigs();
panel.setStations(course.stations);
panel.setName(profile.name);
panel.setLab(lab);
setParams(profile.params);
goTo(0);

function setParams(params) {
  profile.params = params;
  motor.setParams(params);
  panel.setParams(params);
  predictions = predictAll(params, 1 / lab.tick_rate);
  save();
}

async function refreshConfigs() {
  const { configs, failed } = await loadConfigs();
  if (configs.length) {
    menu = configs;
    panel.setConfigs(menu);
  }
  if (failed.length) note(`could not read configs/${failed.join(", configs/")}`);
}

function applyLab(changes = {}) {
  for (const [k, v] of Object.entries(changes)) if (k in LAB_DEFAULTS) lab[k] = v;
  body.w = lab.body_width;
  body.h = lab.body_height;
  predictions = predictAll(profile.params, 1 / lab.tick_rate);
  panel.setLab(lab);
  localStorage.setItem(STORE.lab, JSON.stringify(lab));
}

function fileData() {
  return toFile(profile.name, profile.params, {
    tick_rate: lab.tick_rate, body_width: lab.body_width, body_height: lab.body_height,
  });
}

// --- stations ------------------------------------------------------------------

function goTo(i) {
  if (!course.stations.length) return;
  station = (i + course.stations.length) % course.stations.length;
  const st = course.stations[station];
  body.x = st.x;
  body.y = st.y + 1e-6;
  motor.reset(true);
  motor.facing = 1;
  prevPos = { x: body.x, y: body.y };
  renderer.cam = { x: body.x, y: body.y + 3 };
  flight = null;
  trace = null;
  hint.innerHTML = `<b>${st.key} · ${escapeHtml(st.name)}</b> — ${escapeHtml(st.hint)}`;
}

function pin() {
  pinned = lastTrace ? lastTrace.slice() : null;
  note(pinned ? "trace pinned" : "jump first, then pin");
}

// --- shortcuts -----------------------------------------------------------------

input.onKey = (code) => {
  const m = code.match(/^Digit([1-9])$/);
  if (m) { goTo(Number(m[1]) - 1); return true; }
  if (code === "KeyR") { goTo(station); return true; }
  if (code === "KeyP") { pin(); return true; }
  if (code === "KeyH") { document.body.classList.toggle("hide-panel"); return true; }
  if (code === "Equal" || code === "NumpadAdd") { zoom(1.15); return true; }
  if (code === "Minus" || code === "NumpadSubtract") { zoom(1 / 1.15); return true; }
  return false;
};

function zoom(f) {
  renderer.cell = Math.min(Math.max(renderer.cell * f, 8), 80);
}

const canvas = renderer.canvas;
canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });

// --- painting ------------------------------------------------------------------

let paintCursor = null;
let painting = 0; // 0 none, 1 solid, -1 erase

canvas.addEventListener("contextmenu", (e) => { if (lab.paint) e.preventDefault(); });
canvas.addEventListener("mousedown", (e) => {
  if (!lab.paint) return;
  painting = e.button === 2 ? -1 : 1;
  paintAt(e);
});
canvas.addEventListener("mousemove", (e) => {
  if (!lab.paint) { paintCursor = null; return; }
  const cx = Math.floor(renderer.cx(e.offsetX));
  const cy = Math.floor(renderer.cy(e.offsetY));
  paintCursor = { cx, cy, erase: painting === -1 };
  if (painting) paintAt(e);
});
window.addEventListener("mouseup", () => {
  if (painting) localStorage.setItem(STORE.course, course.toText());
  painting = 0;
});

function paintAt(e) {
  course.setSolid(Math.floor(renderer.cx(e.offsetX)), Math.floor(renderer.cy(e.offsetY)), painting > 0);
}

// --- the loop ------------------------------------------------------------------

let acc = 0;
let last = performance.now();

function frame(now) {
  const real = Math.min((now - last) / 1000, 0.1);
  last = now;
  const dt = 1 / lab.tick_rate;
  acc += real * lab.time_scale;
  let ticks = 0;
  while (acc >= dt && ticks < 16) {
    tick(dt);
    acc -= dt;
    ticks++;
  }
  if (ticks === 16) acc = 0;

  const a = Math.min(acc / dt, 1);
  const pos = { x: prevPos.x + (body.x - prevPos.x) * a, y: prevPos.y + (body.y - prevPos.y) * a };
  renderer.viewOffset = document.body.classList.contains("hide-panel") ? 0 : 400;
  renderer.follow({ x: pos.x, y: pos.y + 2 }, real);
  renderer.draw({
    course, body, motor, bodyPos: pos,
    predictions, anchor, anchorFacing, showPredictions: lab.show_predictions,
    trace, lastTrace, pinned,
    paint: lab.paint ? paintCursor : null,
  });
  updateReadout();
  requestAnimationFrame(frame);
}

function tick(dt) {
  prevPos = { x: body.x, y: body.y };
  const wasOnFloor = motor.onFloor;
  const move = motor.step(dt, input.sample());
  const result = body.moveAndSlide(course, move, dt);
  motor.afterMove(result);

  const moves = motor.events.splice(0).map((e) => e.type);

  if (motor.onFloor) {
    anchor = { x: body.x, y: body.y };
    anchorFacing = motor.facing;
  }

  // Measure every air time, from leaving the ground to landing.
  // From where the feet were BEFORE this tick: by the end of the take-off tick the
  // player is already ~half a cell up, and that would come off every height.
  if (wasOnFloor && !motor.onFloor) {
    flight = { x: prevPos.x, y: prevPos.y, top: body.y, time: 0, moves: [] };
    trace = [{ ...prevPos }];
  }
  if (flight) {
    flight.moves.push(...moves.filter((m) => m !== "land" && m !== "dash_end"));
    flight.time += dt;
    flight.top = Math.max(flight.top, body.y);
    trace.push({ x: body.x, y: body.y });
    if (motor.onFloor) {
      history.unshift({
        rise: flight.top - flight.y,
        travel: Math.abs(body.x - flight.x),
        drop: body.y - flight.y,
        time: flight.time,
        moves: flight.moves.length ? flight.moves.join(" · ").replace(/_/g, " ") : "fall",
      });
      history.length = Math.min(history.length, 5);
      lastTrace = trace;
      trace = null;
      flight = null;
    }
  }

  if (body.y < -FALL_LIMIT) goTo(station);
}

requestAnimationFrame(frame);

// --- readout -------------------------------------------------------------------

function note(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(note.timer);
  note.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

let lastReadout = "";
function updateReadout() {
  const p = profile.params;
  const d = derive(p);
  const f = (v, n = 2) => v.toFixed(n).padStart(6);
  const lines = [];
  lines.push("DERIVED");
  lines.push(`  walk speed   ${f(d.walk_speed)} cells/s`);
  lines.push(`  jump speed   ${f(d.jump_speed)} cells/s`);
  lines.push(`  gravity      ${f(d.rise_gravity, 1)} rising  ${f(d.fall_gravity, 1)} falling`);
  if (p.air_jumps > 0) lines.push(`  air jump     ${f(d.air_jump_speed)} cells/s  gravity ${f(d.air_rise_gravity, 1)}`);
  if (p.dash_enabled) lines.push(`  dash speed   ${f(d.dash_speed)} cells/s`);
  lines.push("");
  lines.push(`PREDICTED  running start, flat ground, ${lab.tick_rate} Hz`);
  for (const pr of predictions) {
    const gap = Math.floor(pr.distance + lab.body_width - 1e-6);
    lines.push(`  ${pr.name.padEnd(30)} height ${f(pr.apex)}  reach ${f(pr.distance)}  gap ${String(gap).padStart(2)}  ${f(pr.time)} s`);
  }
  lines.push("");
  lines.push("MEASURED  last jumps");
  if (!history.length) lines.push("  jump to measure one");
  for (const h of history) {
    const drop = Math.abs(h.drop) > 0.01 ? `  landed ${h.drop > 0 ? "+" : ""}${h.drop.toFixed(2)}` : "";
    lines.push(`  ${h.moves.padEnd(30)} rose   ${f(h.rise)}  flew  ${f(h.travel)}  ${f(h.time)} s${drop}`);
  }
  const text = lines.join("\n");
  if (text !== lastReadout) {
    readout.textContent = text;
    lastReadout = text;
  }
}

// --- persistence ---------------------------------------------------------------

function loadProfile() {
  const hash = location.hash.match(/[#&]p=([^&]+)/);
  if (hash) {
    try {
      const data = fromFile(decode(hash[1]));
      history_replace();
      applyLabSilently(data.lab);
      return { name: data.name, params: data.params };
    } catch (e) {
      console.warn("bad share link", e);
    }
  }
  const stored = load(STORE.profile);
  if (stored?.params) return { name: stored.name ?? "untitled", params: normalize(stored.params) };
  const pr = PRESETS[START_PRESET];
  return { name: pr.name, params: { ...pr.params } };
}

function applyLabSilently(l = {}) {
  for (const k of ["tick_rate", "body_width", "body_height"]) if (k in l) lab[k] = l[k];
}

function history_replace() {
  window.history.replaceState(null, "", location.pathname + location.search);
}

function save() {
  localStorage.setItem(STORE.profile, JSON.stringify(profile));
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify({ name: obj.name, params: obj.params, lab: obj.lab }));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(s, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API needs https or localhost; fall back to a prompt.
    window.prompt("Copy this:", text);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// For the console and the tests.
window.jumpLab = { motor, body, profile: () => profile, SCHEMA, predictions: () => predictions };
