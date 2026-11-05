// The jump profile: every number that shapes how a platformer character moves.
//
// Design rule: the parameters are things a level designer can SEE - "jumps 4 cells
// high", "rises in 0.3 s", "crosses 5 cells". Gravity and speeds are DERIVED from
// them, never typed in. That way a level can be held against the numbers.
//
// Units: lengths are in cells (one tile of your game), times in seconds. Multiply
// by your tile size to get pixels or metres.

export const FORMAT = "jump-lab/1";

// One entry per parameter. The panel, the JSON file and the docs are all generated
// from this list, so they cannot drift apart.
//   key      name in the JSON file
//   group    panel section
//   type     "float" | "int" | "bool"
//   min/max/step   slider range (a file may hold values outside it)
//   unit     shown next to the value
//   def      default value
//   help     tooltip
export const SCHEMA = [
  // --- run
  { key: "jump_distance", group: "Run", type: "float", min: 1, max: 20, step: 0.1, unit: "cells", def: 5.0,
    help: "Horizontal distance of a full jump at walk speed, on flat ground. This SETS the walk speed: walk = distance / (rise time + fall time)." },
  { key: "ground_accel_time", group: "Run", type: "float", min: 0, max: 1, step: 0.01, unit: "s", def: 0.0,
    help: "Time to go from standing to full walk speed on the ground. 0 = instant." },
  { key: "ground_decel_time", group: "Run", type: "float", min: 0, max: 1, step: 0.01, unit: "s", def: 0.0,
    help: "Time to stop from full walk speed on the ground (also used when turning around). 0 = instant." },
  { key: "air_accel_time", group: "Run", type: "float", min: 0, max: 1, step: 0.01, unit: "s", def: 0.0,
    help: "Like ground accel, but in the air. Higher = less air control." },
  { key: "air_decel_time", group: "Run", type: "float", min: 0, max: 1, step: 0.01, unit: "s", def: 0.0,
    help: "Like ground decel, but in the air." },

  // --- jump
  { key: "jump_height", group: "Jump", type: "float", min: 0.5, max: 12, step: 0.05, unit: "cells", def: 4.0,
    help: "Height of a full (held) jump. The motor integrates exactly, so this is the real apex - a 4.0 jump lands on a 4-cell ledge." },
  { key: "jump_rise_time", group: "Jump", type: "float", min: 0.05, max: 1.2, step: 0.01, unit: "s", def: 0.30,
    help: "Time from take-off to the apex." },
  { key: "jump_fall_time", group: "Jump", type: "float", min: 0.05, max: 1.2, step: 0.01, unit: "s", def: 0.30,
    help: "Time from the apex back down to take-off height. Shorter than the rise feels snappy, longer feels floaty." },
  { key: "jump_cut", group: "Jump", type: "float", min: 0, max: 1, step: 0.05, unit: "", def: 1.0,
    help: "Releasing jump early removes this fraction of the remaining upward speed. 1 = stop rising at once, 0 = no variable height." },
  { key: "max_fall_speed", group: "Jump", type: "float", min: 5, max: 120, step: 1, unit: "cells/s", def: 80,
    help: "Terminal velocity." },
  { key: "apex_threshold", group: "Jump", type: "float", min: 0, max: 10, step: 0.1, unit: "cells/s", def: 0,
    help: "Apex hang: while jump is held and the vertical speed is below this, gravity is scaled by 'apex gravity'. 0 = off." },
  { key: "apex_gravity_scale", group: "Jump", type: "float", min: 0.1, max: 1, step: 0.05, unit: "x", def: 1.0,
    help: "Gravity multiplier during apex hang." },

  // --- assists
  { key: "coyote_time", group: "Assists", type: "float", min: 0, max: 0.3, step: 0.005, unit: "s", def: 0.07,
    help: "Grace period after walking off a ledge in which a ground jump still works." },
  { key: "jump_buffer_time", group: "Assists", type: "float", min: 0, max: 0.3, step: 0.005, unit: "s", def: 0.0,
    help: "Pressing jump this long before landing still jumps on touchdown." },

  // --- air jump
  { key: "air_jumps", group: "Air jump", type: "int", min: 0, max: 5, step: 1, unit: "", def: 0,
    help: "Extra jumps in the air. 1 = double jump. Refilled on landing." },
  { key: "air_jump_height", group: "Air jump", type: "float", min: 0.5, max: 12, step: 0.05, unit: "cells", def: 2.5,
    help: "Height gained by an air jump, measured from where it starts." },
  { key: "air_jump_rise_time", group: "Air jump", type: "float", min: 0.05, max: 1.2, step: 0.01, unit: "s", def: 0.25,
    help: "Time from the air jump to its apex. The fall afterwards uses the normal fall gravity." },
  { key: "air_jump_redirect", group: "Air jump", type: "bool", def: true,
    help: "An air jump sets the horizontal speed straight to what the stick says, so you can change direction mid-air." },

  // --- dash
  { key: "dash_enabled", group: "Dash", type: "bool", def: false,
    help: "Turn the dash on." },
  { key: "dash_distance", group: "Dash", type: "float", min: 0.5, max: 15, step: 0.1, unit: "cells", def: 3.0,
    help: "Distance covered by one dash (if nothing blocks it)." },
  { key: "dash_time", group: "Dash", type: "float", min: 0.02, max: 0.8, step: 0.005, unit: "s", def: 0.045,
    help: "How long the dash takes. Speed = distance / time." },
  { key: "dash_cooldown", group: "Dash", type: "float", min: 0, max: 3, step: 0.05, unit: "s", def: 0.8,
    help: "Time from the start of one dash until the next one is allowed." },
  { key: "air_dashes", group: "Dash", type: "int", min: 0, max: 5, step: 1, unit: "", def: 1,
    help: "Dashes allowed per air time. 0 = ground only. Refilled on landing." },
  { key: "dash_lift", group: "Dash", type: "float", min: -10, max: 10, step: 0.1, unit: "cells/s", def: 2.0,
    help: "Vertical speed during the dash; gravity is off while dashing. Slightly positive helps dashing over pits." },
  { key: "dash_vertical_resume", group: "Dash", type: "float", min: 0, max: 1, step: 0.05, unit: "", def: 1.0,
    help: "After the dash, this fraction of the vertical speed from before the dash comes back. 1 = the fall continues where it was, 0 = start falling from rest." },
  { key: "dash_exit_speed", group: "Dash", type: "float", min: 0, max: 1, step: 0.05, unit: "", def: 0.0,
    help: "Fraction of the dash speed kept when the dash ends. The extra speed then bleeds off over 'carry decay'." },
  { key: "dash_jump_cancel", group: "Dash", type: "bool", def: false,
    help: "Pressing jump during a dash ends the dash and jumps at once (if a jump is available)." },
  { key: "dash_jump_carry", group: "Dash", type: "float", min: 0, max: 1, step: 0.05, unit: "", def: 0.5,
    help: "When a dash is cancelled into a jump: the fraction of the dash speed carried into the jump." },
  { key: "dash_refills_air_jumps", group: "Dash", type: "bool", def: false,
    help: "A dash gives back all air jumps." },
  { key: "carry_decay_time", group: "Dash", type: "float", min: 0, max: 2, step: 0.01, unit: "s", def: 0.2,
    help: "Speed above walk speed (from a dash) bleeds back down to walk speed over this long. 0 = instantly." },
];

export const GROUPS = [...new Set(SCHEMA.map((p) => p.group))];

export function defaults() {
  const params = {};
  for (const p of SCHEMA) params[p.key] = p.def;
  return params;
}

// Take whatever a file holds, keep what is known, fill the rest with defaults.
// Unknown keys are dropped; wrong types are coerced.
export function normalize(input) {
  const params = defaults();
  if (!input || typeof input !== "object") return params;
  for (const p of SCHEMA) {
    if (!(p.key in input)) continue;
    const v = input[p.key];
    if (p.type === "bool") params[p.key] = Boolean(v);
    else if (p.type === "int") params[p.key] = Math.round(Number(v)) || 0;
    else if (Number.isFinite(Number(v))) params[p.key] = Number(v);
  }
  return params;
}

// Everything the motor needs that is not a parameter itself.
// These are written into the JSON too, for anyone who wants raw physics numbers.
export function derive(p) {
  const rise = Math.max(p.jump_rise_time, 1e-4);
  const fall = Math.max(p.jump_fall_time, 1e-4);
  const airRise = Math.max(p.air_jump_rise_time, 1e-4);
  const riseGravity = (2 * p.jump_height) / (rise * rise);
  const fallGravity = (2 * p.jump_height) / (fall * fall);
  const airRiseGravity = (2 * p.air_jump_height) / (airRise * airRise);
  return {
    walk_speed: p.jump_distance / (rise + fall),
    jump_speed: riseGravity * rise,
    rise_gravity: riseGravity,
    fall_gravity: fallGravity,
    air_jump_speed: airRiseGravity * airRise,
    air_rise_gravity: airRiseGravity,
    dash_speed: p.dash_distance / Math.max(p.dash_time, 1e-4),
  };
}

// --- file format -------------------------------------------------------------------

export function toFile(name, params, lab = {}) {
  const ordered = {};
  for (const p of SCHEMA) ordered[p.key] = tidy(params[p.key], p);
  const derived = {};
  for (const [k, v] of Object.entries(derive(params))) derived[k] = round(v, 4);
  return {
    format: FORMAT,
    name,
    units: { length: "cells", time: "seconds" },
    params: ordered,
    derived,
    lab,
  };
}

// The file name a profile called `name` gets.
export function slug(name) {
  return (name || "jump").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jump";
}

export function fromFile(data) {
  if (!data || typeof data !== "object") throw new Error("not a JSON object");
  if (data.format && !String(data.format).startsWith("jump-lab/")) {
    throw new Error(`unknown format "${data.format}"`);
  }
  // Accept a bare params object as well, for hand-written files.
  const params = normalize(data.params ?? data);
  return { name: data.name ?? "imported", params, lab: data.lab ?? {} };
}

function tidy(v, p) {
  if (p.type === "bool") return Boolean(v);
  if (p.type === "int") return Math.round(v);
  // Snap to the slider step's precision so files do not fill with 0.30000000000000004.
  const decimals = Math.max(0, Math.ceil(-Math.log10(p.step)) + 1);
  return round(v, decimals);
}

function round(v, decimals) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
