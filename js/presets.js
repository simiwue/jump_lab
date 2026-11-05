// Starting points. Each one only lists what differs from the schema defaults.
import { defaults } from "./profile.js";

const RAW = [
  {
    name: "2D3D (old prototype)",
    note: "The movement of the 2D3D prototype: instant control, a short blink dash. Designed as a 4.0 jump, but the old integration overshot to ~4.22 - 4.2 is what the old levels were actually played with.",
    params: { jump_height: 4.2, dash_enabled: true },
  },
  {
    name: "2D3D + double jump",
    note: "The old physics with a double jump and a small jump buffer added - a starting point for tuning.",
    params: { jump_height: 4.2, dash_enabled: true, air_jumps: 1, jump_buffer_time: 0.1 },
  },
  {
    name: "Snappy",
    note: "Short rise, fast fall, a little momentum, generous assists.",
    params: {
      jump_height: 3.5, jump_rise_time: 0.28, jump_fall_time: 0.2, jump_distance: 4.5, jump_cut: 0.6,
      ground_accel_time: 0.05, ground_decel_time: 0.04, air_accel_time: 0.1, air_decel_time: 0.12,
      coyote_time: 0.1, jump_buffer_time: 0.12, max_fall_speed: 35,
      air_jumps: 1, air_jump_height: 2.0, air_jump_rise_time: 0.22,
      dash_enabled: true, dash_distance: 3.5, dash_time: 0.14, dash_cooldown: 0.3, dash_lift: 0,
      dash_vertical_resume: 0, dash_exit_speed: 0.4, dash_jump_cancel: true, dash_jump_carry: 0.6,
      carry_decay_time: 0.25,
    },
  },
  {
    name: "Floaty",
    note: "Long hang time and soft air control.",
    params: {
      jump_height: 3.0, jump_rise_time: 0.45, jump_fall_time: 0.4, jump_distance: 6, jump_cut: 0.5,
      ground_accel_time: 0.12, ground_decel_time: 0.1, air_accel_time: 0.3, air_decel_time: 0.4,
      coyote_time: 0.12, jump_buffer_time: 0.12, max_fall_speed: 18,
      apex_threshold: 2.5, apex_gravity_scale: 0.5,
    },
  },
];

export const PRESETS = RAW.map((p) => ({ ...p, params: { ...defaults(), ...p.params } }));
