// Predicted arcs: run the real motor offline, on flat endless ground, with a
// scripted input. Same code as the player, so the prediction cannot lie.
//
// Every scenario starts at walk speed, holding forward, and returns the path of the
// feet relative to the take-off point.

import { Motor } from "./motor.js";
import { derive } from "./profile.js";

export function simulate(params, script, dt, maxTime = 5) {
  const motor = new Motor(params);
  motor.reset(true);
  motor.vel.x = derive(params).walk_speed;
  const pos = { x: 0, y: 0 };
  const points = [{ x: 0, y: 0 }];
  const ctx = { tick: 0, motor, state: {} };
  let apex = 0;
  let left = false;

  for (; ctx.tick * dt < maxTime; ctx.tick++) {
    const input = { move: 1, jumpHeld: true, ...script(ctx) };
    const move = motor.step(dt, input);
    pos.x += move.x * dt;
    pos.y += move.y * dt;
    if (pos.y > 1e-9) left = true;

    let landed = false;
    if (pos.y <= 0 && (left || move.y < 0)) {
      pos.y = 0;
      landed = left;
    }
    motor.afterMove({ onFloor: pos.y <= 0, hitY: pos.y <= 0 && move.y < 0 });
    apex = Math.max(apex, pos.y);
    points.push({ x: pos.x, y: pos.y });
    if (landed) break;
  }
  return { points, apex, distance: pos.x, time: (ctx.tick + 1) * dt };
}

// Press a button exactly once, on the first tick `when(ctx)` is true.
function once(ctx, key, when) {
  if (ctx.state[key] || !when(ctx)) return false;
  ctx.state[key] = true;
  return true;
}

const atApex = (ctx) => ctx.tick > 0 && ctx.motor.vel.y <= 0 && !ctx.motor.onFloor;

export function scenarios(p) {
  const list = [{
    name: "jump",
    color: "#e0703a",
    script: (ctx) => ({ jumpPressed: ctx.tick === 0 }),
  }];

  if (p.air_jumps > 0) {
    list.push({
      name: "jump · air jump at apex",
      color: "#3a8fe0",
      script: (ctx) => ({ jumpPressed: ctx.tick === 0 || once(ctx, "aj", atApex) }),
    });
  }

  if (p.dash_enabled && p.air_dashes > 0) {
    const withJump = p.air_jumps > 0 || p.dash_refills_air_jumps;
    list.push({
      name: withJump ? "jump · dash at apex · air jump" : "jump · dash at apex",
      color: "#2fa36b",
      script: (ctx) => {
        const dash = once(ctx, "d", atApex);
        if (dash) ctx.state.dashTick = ctx.tick;
        const after = ctx.state.d && ctx.tick > ctx.state.dashTick && !ctx.motor.dashing;
        const jump = withJump && once(ctx, "aj", () => after);
        return { jumpPressed: ctx.tick === 0 || jump, dashPressed: dash };
      },
    });
  }

  if (p.dash_enabled && p.dash_jump_cancel) {
    list.push({
      name: "dash · jump (cancel)",
      color: "#a35cc9",
      script: (ctx) => ({ dashPressed: ctx.tick === 0, jumpPressed: ctx.tick === 1 }),
    });
  }
  return list;
}

export function predictAll(params, dt) {
  return scenarios(params).map((s) => ({ ...s, ...simulate(params, s.script, dt) }));
}
