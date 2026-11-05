// Motor tests. Open tests/index.html (served over http) and read the result.
// window.testResults holds the same data for automated runs.

import { Motor } from "../js/motor.js";
import { Body } from "../js/body.js";
import { Course } from "../js/course.js";
import { defaults, derive, toFile, fromFile } from "../js/profile.js";
import { PRESETS } from "../js/presets.js";
import { simulate, scenarios } from "../js/predict.js";
import { jsonLinks, fileFor } from "../js/configs.js";
import DEFAULT_COURSE from "../js/course_default.js";

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}
function near(actual, expected, tol, what = "") {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${what} expected ${expected} ± ${tol}, got ${actual}`);
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const RATES = [30, 60, 144];
const base = (over = {}) => ({ ...defaults(), ...over });

// Flat ground at y = 0, no walls. Returns per-tick feet positions.
function run(params, inputs, dt, { start = { x: 0, y: 0 }, vx = 0, onFloor = true, floorAt = 0 } = {}) {
  const m = new Motor(params);
  m.reset(onFloor);
  m.vel.x = vx;
  const pos = { ...start };
  const out = [];
  for (let i = 0; i < inputs.length; i++) {
    const mv = m.step(dt, inputs[i]);
    pos.x += mv.x * dt;
    pos.y += mv.y * dt;
    let hitY = false;
    if (pos.y <= floorAt && mv.y <= 0) {
      hitY = pos.y < floorAt || mv.y < 0;
      pos.y = floorAt;
    }
    m.afterMove({ onFloor: pos.y <= floorAt, hitY });
    out.push({ x: pos.x, y: pos.y, vx: m.vel.x, vy: m.vel.y, events: m.events.splice(0).map((e) => e.type) });
  }
  return { m, out };
}
// The apex usually falls BETWEEN two ticks, so the highest sampled position is a
// little low. Reconstruct it from the last tick that was still rising.
function trueApex(out, gravity) {
  let best = Math.max(...out.map((o) => o.y));
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1];
    if (a.vy > 0 && out[i].vy <= 0) best = Math.max(best, a.y + (a.vy * a.vy) / (2 * gravity));
  }
  return best;
}
const hold = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ move: 0, jumpHeld: true, ...extra, jumpPressed: i === 0 }));

// --- jump ----------------------------------------------------------------------

for (const hz of RATES) {
  test(`apex is exactly jump_height at ${hz} Hz`, () => {
    const p = base({ jump_height: 4 });
    const { out } = run(p, hold(hz * 2), 1 / hz);
    near(trueApex(out, derive(p).rise_gravity), 4, 1e-9, "apex");
    ok(Math.max(...out.map((o) => o.y)) <= 4 + 1e-9, "a sampled position went above the apex");
  });

  test(`air time is rise + fall at ${hz} Hz`, () => {
    const p = base({ jump_rise_time: 0.3, jump_fall_time: 0.25 });
    const { out } = run(p, hold(hz * 2), 1 / hz);
    const landTick = out.findIndex((o, i) => i > 0 && o.events.includes("land"));
    near((landTick + 1) / hz, 0.55, 1 / hz + 1e-9, "air time");
  });

  test(`jump distance is jump_distance at ${hz} Hz`, () => {
    const p = base({ jump_distance: 5 });
    const d = derive(p);
    const r = simulate(p, (ctx) => ({ jumpPressed: ctx.tick === 0 }), 1 / hz);
    near(r.distance, 5, d.walk_speed / hz + 1e-9, "distance");
  });

  test(`dash covers exactly dash_distance at ${hz} Hz`, () => {
    const p = base({ dash_enabled: true, dash_distance: 3, dash_time: 0.045, dash_lift: 0 });
    const inputs = Array.from({ length: hz }, (_, i) => ({ move: 0, dashPressed: i === 0 }));
    const { out } = run(p, inputs, 1 / hz);
    near(out[out.length - 1].x, 3, 1e-9, "dash end x");
  });

  test(`air jump adds exactly air_jump_height at ${hz} Hz`, () => {
    const p = base({ air_jumps: 1, air_jump_height: 2.5 });
    const dt = 1 / hz;
    const inputs = [];
    let fired = false;
    const m = new Motor(p);
    m.reset(true);
    const pos = { x: 0, y: 0 };
    let ajStart = null;
    let top = 0;
    for (let i = 0; i < hz * 3; i++) {
      const press = i === 0 || (!fired && i > 0 && m.vel.y <= 0 && !m.onFloor);
      if (press && i > 0) fired = true;
      const mv = m.step(dt, { move: 0, jumpHeld: true, jumpPressed: press });
      if (press && i > 0) ajStart = pos.y;
      pos.y += mv.y * dt;
      if (pos.y <= 0 && i > 0) { pos.y = 0; m.afterMove({ onFloor: true, hitY: true }); break; }
      m.afterMove({ onFloor: false });
      if (ajStart !== null) top = Math.max(top, pos.y);
      inputs.push(press);
      if (ajStart !== null && m.vel.y > 0) top = Math.max(top, pos.y + (m.vel.y * m.vel.y) / (2 * derive(p).air_rise_gravity));
    }
    ok(ajStart !== null, "air jump never fired");
    near(top - ajStart, 2.5, 1e-9, "air jump rise");
  });
}

test("releasing jump with cut 1 stops the rise at once", () => {
  const p = base({ jump_cut: 1 });
  const inputs = [{ jumpPressed: true, jumpHeld: true }, { jumpHeld: true }, { jumpHeld: false }, { jumpHeld: false }];
  const { out } = run(p, inputs, 1 / 60);
  ok(out[2].vy <= 0, `still rising after release: vy=${out[2].vy}`);
});

test("jump cut 0 ignores the release", () => {
  const p = base({ jump_cut: 0 });
  const tall = run(p, hold(120), 1 / 60).out;
  const tap = run(p, [{ jumpPressed: true, jumpHeld: true }, ...Array(119).fill({ jumpHeld: false })], 1 / 60).out;
  near(Math.max(...tap.map((o) => o.y)), Math.max(...tall.map((o) => o.y)), 1e-9, "apex");
});

test("terminal velocity is never exceeded", () => {
  const p = base({ max_fall_speed: 20 });
  const { out } = run(p, Array(300).fill({}), 1 / 60, { start: { x: 0, y: 1000 }, onFloor: false, floorAt: -1e9 });
  ok(out.every((o) => o.vy >= -20 - 1e-9), "fell faster than max_fall_speed");
  near(out[out.length - 1].vy, -20, 1e-9, "final fall speed");
});

// --- assists -------------------------------------------------------------------

test("coyote time allows a late jump, and only within the window", () => {
  const p = base({ coyote_time: 0.1 });
  const dt = 1 / 60;
  const tryAt = (tick) => {
    const m = new Motor(p);
    m.reset(true);
    m.step(dt, {}); // one tick standing, so the coyote timer is armed
    m.afterMove({ onFloor: false }); // then walk off the ledge
    let jumped = false;
    for (let i = 0; i <= tick; i++) {
      m.step(dt, { jumpPressed: i === tick, jumpHeld: i === tick });
      m.afterMove({ onFloor: false });
      jumped ||= m.events.some((e) => e.type === "jump");
    }
    return jumped;
  };
  ok(tryAt(3), "jump 3 ticks after leaving the ledge should work");
  ok(!tryAt(9), "jump 9 ticks (0.15 s) after leaving the ledge should not");
});

test("jump buffer jumps on landing, and only within the window", () => {
  const p = base({ jump_buffer_time: 0.1 });
  const dt = 1 / 60;
  const landsAfter = (pressTicksBefore) => {
    const m = new Motor(p);
    m.reset(false);
    let jumped = false;
    const L = 15; // the tick on which the player lands
    for (let i = 0; i < 25; i++) {
      m.step(dt, { jumpPressed: i === L - pressTicksBefore, jumpHeld: true });
      m.afterMove({ onFloor: i >= L });
      if (i > L) jumped ||= m.events.some((e) => e.type === "jump");
      else m.events.length = 0;
    }
    return jumped;
  };
  ok(landsAfter(3), "press 3 ticks before landing should jump");
  ok(!landsAfter(12), "press 12 ticks (0.2 s) before landing should not");
});

test("no buffer: a press before landing is lost", () => {
  const p = base({ jump_buffer_time: 0 });
  const m = new Motor(p);
  m.reset(false);
  m.step(1 / 60, { jumpPressed: true, jumpHeld: true });
  m.afterMove({ onFloor: true });
  m.events.length = 0;
  m.step(1 / 60, { jumpHeld: true });
  ok(!m.events.some((e) => e.type === "jump"), "jumped without a fresh press");
});

// --- dash ----------------------------------------------------------------------

test("dash cooldown blocks a second dash", () => {
  const p = base({ dash_enabled: true, dash_cooldown: 0.5, dash_lift: 0 });
  const inputs = Array.from({ length: 60 }, (_, i) => ({ dashPressed: i === 0 || i === 20 || i === 40 }));
  const { out } = run(p, inputs, 1 / 60);
  const dashes = out.filter((o) => o.events.includes("dash")).length;
  ok(dashes === 2, `expected 2 dashes (t=0 and t=0.67s), got ${dashes}`);
});

test("air dashes are limited and refill on landing", () => {
  const p = base({ dash_enabled: true, air_dashes: 1, dash_cooldown: 0 });
  const m = new Motor(p);
  m.reset(false);
  let dashes = 0;
  for (let i = 0; i < 40; i++) {
    m.step(1 / 60, { dashPressed: i % 5 === 0 });
    m.afterMove({ onFloor: false });
    dashes += m.events.splice(0).filter((e) => e.type === "dash").length;
  }
  ok(dashes === 1, `expected 1 air dash, got ${dashes}`);
});

test("dash jump cancel jumps out of the dash", () => {
  const p = base({ dash_enabled: true, dash_time: 0.1, dash_jump_cancel: true, dash_jump_carry: 1, dash_lift: 0 });
  const inputs = [{ move: 1, dashPressed: true }, { move: 1, jumpPressed: true, jumpHeld: true }, { move: 1, jumpHeld: true }];
  const { m, out } = run(p, inputs, 1 / 60);
  ok(out[1].events.includes("jump"), "no jump on the cancel tick");
  ok(!m.dashing, "still dashing after the cancel");
  ok(out[1].vx > derive(p).walk_speed * 1.5, `dash speed not carried: vx=${out[1].vx}`);
});

// --- body ----------------------------------------------------------------------

// A jump EXACTLY as high as a ledge only touches it at the apex, so give it margin:
// this is why the 2D3D preset uses 4.2 (what the old engine actually produced).
test("a 4.2 jump lands on a 4-cell ledge but not a 5-cell one", () => {
  const p = base({ jump_height: 4.2, jump_distance: 5 });
  const tryLedge = (h) => {
    const rows = [];
    for (let y = 9; y >= 0; y--) {
      let r = "";
      for (let x = 0; x < 20; x++) r += y === 0 || (x >= 8 && y <= h) ? "#" : ".";
      rows.push(r);
    }
    const course = new Course(rows.join("\n"));
    const body = new Body(0.56, 1.2);
    body.x = 5;
    body.y = 1 + 1e-6;
    const m = new Motor(p);
    m.reset(true);
    for (let i = 0; i < 120; i++) {
      const mv = m.step(1 / 60, { move: 1, jumpPressed: i === 0, jumpHeld: true });
      m.afterMove(body.moveAndSlide(course, mv, 1 / 60));
    }
    return body.y > h + 0.5;
  };
  ok(tryLedge(4), "did not land on 4");
  ok(!tryLedge(5), "landed on 5");
});

test("standing still stays put for 10 seconds", () => {
  const course = new Course("....\n....\n####");
  const body = new Body(0.56, 1.2);
  body.x = 2;
  body.y = 1 + 1e-6;
  const m = new Motor(defaults());
  m.reset(true);
  for (let i = 0; i < 600; i++) m.afterMove(body.moveAndSlide(course, m.step(1 / 60, {}), 1 / 60));
  near(body.y, 1 + 1e-6, 1e-9, "y");
  near(body.x, 2, 1e-12, "x");
  ok(m.onFloor, "lost the floor");
});

test("a fast dash does not tunnel through a 1-cell wall", () => {
  const course = new Course(["..........", "....#.....", "....#.....", "##########"].join("\n"));
  const body = new Body(0.56, 1.2);
  body.x = 2;
  body.y = 1 + 1e-6;
  const m = new Motor(base({ dash_enabled: true, dash_distance: 6, dash_time: 0.02, dash_lift: 0 }));
  m.reset(true);
  for (let i = 0; i < 10; i++) m.afterMove(body.moveAndSlide(course, m.step(1 / 60, { dashPressed: i === 0 }), 1 / 60));
  ok(body.x < 4, `went through the wall: x=${body.x}`);
});

// --- the default course --------------------------------------------------------

const FLOOR_ROWS = 3; // cy 0..2

test("default course: nothing rises from the floor, everything floats", () => {
  const c = new Course(DEFAULT_COURSE);
  for (let x = 0; x < c.width; x++) {
    for (let y = 0; y < FLOOR_ROWS; y++) ok(c.isSolid(x, y), `hole in the floor at x=${x}`);
    ok(!c.isSolid(x, FLOOR_ROWS) && !c.isSolid(x, FLOOR_ROWS + 1), `less than 2 cells of headroom at x=${x}`);
    let run = 0;
    for (let y = FLOOR_ROWS; y < c.height; y++) {
      run = c.isSolid(x, y) ? run + 1 : 0;
      ok(run <= 2, `a pillar at x=${x}, y=${y}`);
    }
  }
});

test("default course: the floor can be walked end to end, both ways", () => {
  const c = new Course(DEFAULT_COURSE);
  const body = new Body(0.56, 1.2);
  body.x = 1;
  body.y = FLOOR_ROWS + 1e-6;
  const m = new Motor(defaults());
  m.reset(true);
  const walk = (move, done) => {
    for (let i = 0; i < 20000 && !done(); i++) m.afterMove(body.moveAndSlide(c, m.step(1 / 60, { move }), 1 / 60));
    ok(done(), `stuck at x=${body.x}`);
  };
  walk(1, () => body.x > c.width - 1);
  walk(-1, () => body.x < 1);
});

test("default course: every station stands on something", () => {
  const c = new Course(DEFAULT_COURSE);
  ok(c.stations.length === 7, `${c.stations.length} stations`);
  for (const s of c.stations) {
    ok(c.isSolid(Math.floor(s.x), s.y - 1), `${s.key} floats`);
    ok(!c.isSolid(Math.floor(s.x), s.y) && !c.isSolid(Math.floor(s.x), s.y + 1), `${s.key} is inside a solid`);
  }
});

// --- file format ---------------------------------------------------------------

test("JSON round trip keeps every parameter", () => {
  const p = PRESETS[2].params;
  const back = fromFile(JSON.parse(JSON.stringify(toFile("x", p)))).params;
  for (const k of Object.keys(p)) near(Number(back[k]), Number(p[k]), 1e-6, k);
});

test("unknown keys are dropped, missing keys get defaults", () => {
  const back = fromFile({ format: "jump-lab/1", params: { jump_height: 7, bogus: 1 } }).params;
  ok(back.jump_height === 7, "jump_height lost");
  ok(!("bogus" in back), "unknown key kept");
  ok(back.coyote_time === defaults().coyote_time, "missing key not defaulted");
});

// --- golden vectors for ports ----------------------------------------------------
// Every scenario of every preset, recorded tick by tick with its exact inputs. A port
// to another engine replays the inputs on flat ground and must match the positions.

function vectors() {
  const dt = 1 / 60;
  const out = [];
  for (const preset of PRESETS) {
    const p = preset.params;
    for (const sc of scenarios(p)) {
      const m = new Motor(p);
      m.reset(true);
      m.vel.x = derive(p).walk_speed;
      const pos = { x: 0, y: 0 };
      const ctx = { tick: 0, motor: m, state: {} };
      const ticks = [];
      let left = false;
      for (; ctx.tick < 300; ctx.tick++) {
        const input = { move: 1, jumpHeld: true, jumpPressed: false, dashPressed: false, ...sc.script(ctx) };
        const mv = m.step(dt, input);
        pos.x += mv.x * dt;
        pos.y += mv.y * dt;
        if (pos.y > 1e-9) left = true;
        let landed = false;
        if (pos.y <= 0 && (left || mv.y < 0)) { pos.y = 0; landed = left; }
        m.afterMove({ onFloor: pos.y <= 0, hitY: pos.y <= 0 && mv.y < 0 });
        ticks.push({
          in: [input.move, +!!input.jumpPressed, +!!input.jumpHeld, +!!input.dashPressed],
          pos: [round(pos.x), round(pos.y)],
        });
        if (landed) break;
      }
      out.push({ preset: preset.name, scenario: sc.name, start_vx: round(derive(p).walk_speed), ticks });
    }
  }
  return { format: "jump-lab-vectors/1", dt, params: Object.fromEntries(PRESETS.map((p) => [p.name, toFile(p.name, p.params).params])), cases: out };
}
test("config folder listing: finds the JSON files and nothing else", () => {
  const html = `<a href="../">up</a><a href="zoom.json">z</a><a href="my%20jump.json">m</a>
    <a href="/configs/abs.json">a</a><a href="index.json">i</a><a href="notes.txt">n</a>
    <a href="old/deep.json">d</a><a href="/other/x.json">x</a><a href="zoom.json">again</a>`;
  const names = jsonLinks(html, "http://localhost:8000/configs/");
  ok(names.join() === "abs.json,my jump.json,zoom.json", names.join());
});

test("saving: a known name finds its file, a new name gets a new file", () => {
  const configs = [
    { file: "snappy.json", label: "snappy", name: "Snappy" },
    { file: "my jump.json", label: "my jump", name: "Mine" },
    { name: "built-in, not a file" },
  ];
  ok(fileFor("snappy", configs) === "snappy.json", "by name, any case");
  ok(fileFor("Mine", configs) === "my jump.json", "by the name inside the file");
  ok(fileFor(" My Jump ", configs) === "my jump.json", "by the file name");
  ok(fileFor("Brand New + 2", configs) === "brand-new-2.json", "new file");
  ok(fileFor("built-in, not a file", configs) === "built-in-not-a-file.json", "built-ins have no file");
});

const round = (v) => Math.round(v * 1e9) / 1e9;

// --- report --------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
window.testResults = { passed: results.length - failed.length, failed: failed.length, results };
window.testVectors = vectors();

const list = document.getElementById("results");
document.getElementById("summary").textContent =
  failed.length ? `${failed.length} of ${results.length} FAILED` : `all ${results.length} passed`;
document.getElementById("summary").className = failed.length ? "fail" : "pass";
for (const r of results) {
  const li = document.createElement("li");
  li.className = r.ok ? "pass" : "fail";
  li.textContent = r.ok ? `✓ ${r.name}` : `✗ ${r.name} — ${r.error}`;
  list.append(li);
}

// Download the golden vectors (save them as spec/vectors.json after changing the motor).
const dl = document.createElement("button");
dl.textContent = "download spec/vectors.json";
dl.onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(window.testVectors)], { type: "application/json" }));
  a.download = "vectors.json";
  a.click();
};
document.body.append(dl);
