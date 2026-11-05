// The side panel. Built from SCHEMA, so adding a parameter to profile.js adds its
// slider here with no other change.

import { SCHEMA, GROUPS } from "./profile.js";

export class Panel {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.inputs = {}; // key -> { range, number } | { check }
    this.build();
  }

  build() {
    const r = this.root;
    r.innerHTML = "";

    // --- profile header
    const head = el("section", "head");
    head.append(el("h1", "", "Jump Lab"));

    const configRow = el("div", "row");
    this.config = el("select");
    this.config.title = "Load a JSON file from the configs folder";
    configRow.append(label("config"), this.config);
    head.append(configRow);

    const nameRow = el("div", "row");
    this.name = el("input");
    this.name.type = "text";
    this.name.addEventListener("input", () => this.h.onName(this.name.value));
    nameRow.append(label("name"), this.name);
    head.append(nameRow);

    const fileRow = el("div", "buttons");
    this.importInput = el("input");
    this.importInput.type = "file";
    this.importInput.accept = ".json,application/json";
    this.importInput.hidden = true;
    this.importInput.addEventListener("change", () => {
      const f = this.importInput.files[0];
      if (f) this.h.onImport(f);
      this.importInput.value = "";
    });
    fileRow.append(
      this.importInput,
      button("save", () => this.h.onSave(), "Save to the configs folder: replaces the config with this name, or creates a new one"),
      button("import", () => this.importInput.click(), "Load a jump-lab JSON file"),
      button("export", () => this.h.onExport(), "Download the profile as JSON"),
      button("copy", () => this.h.onCopy(), "Copy the JSON to the clipboard"),
      button("share link", () => this.h.onShare(), "Copy a link that opens the lab with these values"),
    );
    head.append(fileRow);
    r.append(head);

    // --- parameter groups
    for (const group of GROUPS) {
      const det = el("details", "group");
      det.open = true;
      det.append(el("summary", "", group));
      for (const p of SCHEMA.filter((s) => s.group === group)) det.append(this.paramRow(p));
      if (group === "Run") {
        this.lockWalk = checkbox("hold walk speed while retiming the jump", (v) => this.h.onLab("lock_walk", v));
        this.lockWalk.row.title = "Walk speed = distance / (rise + fall). With this on, changing the rise or fall time adjusts the distance instead of the walk speed.";
        det.append(this.lockWalk.row);
      }
      r.append(det);
    }

    // --- lab settings (not part of the profile's physics)
    const lab = el("details", "group");
    lab.open = true;
    lab.append(el("summary", "", "Lab"));

    const tickRow = el("div", "param");
    this.tick = el("select");
    for (const hz of [30, 50, 60, 120, 144, 240]) this.tick.append(new Option(`${hz} Hz`, hz));
    this.tick.addEventListener("change", () => this.h.onLab("tick_rate", Number(this.tick.value)));
    tickRow.append(label("tick rate", "Physics ticks per second. Use your game's physics rate (Godot: 60)."), this.tick);
    lab.append(tickRow);

    this.slow = rangeRow("slow motion", 0.1, 1, 0.05, "x", (v) => this.h.onLab("time_scale", v));
    this.bodyW = rangeRow("body width", 0.2, 2, 0.02, "cells", (v) => this.h.onLab("body_width", v));
    this.bodyH = rangeRow("body height", 0.3, 3, 0.02, "cells", (v) => this.h.onLab("body_height", v));
    lab.append(this.slow.row, this.bodyW.row, this.bodyH.row);

    this.predict = checkbox("show predicted arcs", (v) => this.h.onLab("show_predictions", v));
    this.paint = checkbox("paint the course (left: solid, right: erase)", (v) => this.h.onLab("paint", v));
    lab.append(this.predict.row, this.paint.row);

    const labButtons = el("div", "buttons");
    labButtons.append(
      button("pin trace", () => this.h.onPin(), "Keep the last jump on screen for comparison (P)"),
      button("export course", () => this.h.onExportCourse(), "Download the course as text"),
      button("reset course", () => this.h.onResetCourse(), "Throw away painted changes"),
    );
    lab.append(labButtons);
    r.append(lab);

    // --- stations
    const st = el("section", "stations");
    st.append(el("h2", "", "Stations"));
    this.stations = el("div", "buttons");
    st.append(this.stations);
    r.append(st);
  }

  paramRow(p) {
    const row = el("div", "param");
    row.title = p.help;
    if (p.type === "bool") {
      const c = el("input");
      c.type = "checkbox";
      c.addEventListener("change", () => this.h.onParam(p.key, c.checked));
      const l = label(pretty(p.key), p.help);
      l.prepend(c);
      l.classList.add("check");
      row.classList.add("bool");
      row.append(l);
      this.inputs[p.key] = { check: c };
      return row;
    }
    const range = el("input");
    range.type = "range";
    range.min = p.min;
    range.max = p.max;
    range.step = p.step;
    const num = el("input");
    num.type = "number";
    num.step = p.step;
    const unit = el("span", "unit", p.unit);
    const set = (v) => {
      if (!Number.isFinite(v)) return;
      if (p.type === "int") v = Math.round(v);
      this.h.onParam(p.key, v);
    };
    range.addEventListener("input", () => set(Number(range.value)));
    // Sliders must not keep keyboard focus, or the arrow keys stop moving the player.
    range.addEventListener("change", () => range.blur());
    num.addEventListener("change", () => set(Number(num.value)));
    row.append(label(pretty(p.key), p.help), range, num, unit);
    this.inputs[p.key] = { range, num };
    return row;
  }

  setConfigs(configs, selected = -1) {
    this.config.innerHTML = "";
    this.config.append(new Option("— choose —", -1));
    configs.forEach((c, i) => {
      const o = new Option(c.label ?? c.name, i);
      o.title = c.note ?? "";
      this.config.append(o);
    });
    this.config.value = selected;
    this.config.onchange = () => {
      const i = Number(this.config.value);
      if (i >= 0) this.h.onConfig(i);
      this.config.value = -1;
      this.config.blur();
    };
  }

  setParams(params) {
    for (const p of SCHEMA) {
      const ui = this.inputs[p.key];
      const v = params[p.key];
      if (ui.check) ui.check.checked = !!v;
      else {
        ui.range.value = v;
        if (document.activeElement !== ui.num) ui.num.value = fmt(v, p.step);
      }
    }
  }

  setName(name) {
    if (document.activeElement !== this.name) this.name.value = name;
  }

  setLab(lab) {
    this.tick.value = lab.tick_rate;
    this.slow.set(lab.time_scale);
    this.bodyW.set(lab.body_width);
    this.bodyH.set(lab.body_height);
    this.predict.input.checked = lab.show_predictions;
    this.paint.input.checked = lab.paint;
    this.lockWalk.input.checked = lab.lock_walk;
  }

  setStations(stations) {
    this.stations.innerHTML = "";
    stations.forEach((s, i) => {
      this.stations.append(button(`${i + 1} ${s.name}`, () => this.h.onStation(i), s.hint));
    });
  }
}

// --- tiny DOM helpers ---------------------------------------------------------

function el(tag, cls = "", text = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function label(text, title = "") {
  const l = el("label", "", text);
  if (title) l.title = title;
  return l;
}

function button(text, onClick, title = "") {
  const b = el("button", "", text);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", () => { onClick(); b.blur(); });
  return b;
}

function checkbox(text, onChange) {
  const row = el("div", "param bool");
  const l = label(text);
  l.classList.add("check");
  const input = el("input");
  input.type = "checkbox";
  input.addEventListener("change", () => { onChange(input.checked); input.blur(); });
  l.prepend(input);
  row.append(l);
  return { row, input };
}

function rangeRow(text, min, max, step, unit, onChange) {
  const row = el("div", "param");
  const range = el("input");
  range.type = "range";
  Object.assign(range, { min, max, step });
  const value = el("span", "value");
  const set = (v) => { range.value = v; value.textContent = `${fmt(v, step)} ${unit}`; };
  range.addEventListener("input", () => { set(Number(range.value)); onChange(Number(range.value)); });
  range.addEventListener("change", () => range.blur());
  row.append(label(text), range, value);
  return { row, set };
}

function pretty(key) {
  return key.replace(/_/g, " ");
}

function fmt(v, step) {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(v).toFixed(decimals);
}
