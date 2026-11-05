// The platformer motor: input + profile in, velocity out.
//
// It knows nothing about rendering, collision or engines. Each fixed tick:
//
//   const move = motor.step(dt, input);       // velocity to move the body with
//   ... move the body by move * dt, resolve collisions ...
//   motor.afterMove({ onFloor, hitX, hitY }); // tell the motor what happened
//
// Coordinates are plane space: x to the right, y UP, in cells per second.
//
// The motor returns the AVERAGE velocity over the tick, not the end velocity. With
// constant gravity that makes the arc exact instead of drifting by half a tick per
// frame: a jump designed as 4.0 cells high peaks at 4.0, not 4.15. Its own state
// keeps the end-of-tick velocity.
//
// SPEC.md describes this file step by step, for porting to other engines.

import { derive } from "./profile.js";

export class Motor {
  constructor(params) {
    this.setParams(params);
    this.reset(true);
  }

  setParams(params) {
    this.p = params;
    this.d = derive(params);
  }

  reset(onFloor = true) {
    this.vel = { x: 0, y: 0 };
    this.onFloor = onFloor;
    this.coyote = 0;
    this.buffer = 0;
    this.airJumpsLeft = this.p.air_jumps;
    this.airDashesLeft = this.p.air_dashes;
    this.cooldown = 0;
    this.dash = null; // { dir, left, speed, preVy } while dashing
    this.riseGravity = this.d.rise_gravity;
    this.cuttable = false;
    this.facing = 1;
    this.jumpHeldPrev = false;
    this.events = []; // { type } - drained by whoever is interested
  }

  get dashing() {
    return this.dash !== null;
  }

  // input: { move: -1..1, jumpPressed, jumpHeld, dashPressed }
  // "pressed" means "went down since the last tick" - latch it, or short taps
  // between ticks get lost.
  step(dt, input) {
    const p = this.p;
    const d = this.d;
    const move = clamp(input.move ?? 0, -1, 1);
    const jumpPressed = !!input.jumpPressed;
    const jumpHeld = !!input.jumpHeld || jumpPressed;
    const released = this.jumpHeldPrev && !jumpHeld;
    this.jumpHeldPrev = jumpHeld;

    if (move !== 0) this.facing = Math.sign(move);
    this.cooldown = Math.max(this.cooldown - dt, 0);

    // 1. ground contact: refill everything
    if (this.onFloor && this.vel.y <= 0) {
      this.vel.y = 0;
      this.coyote = p.coyote_time;
      this.airJumpsLeft = p.air_jumps;
      this.airDashesLeft = p.air_dashes;
    } else {
      this.coyote = Math.max(this.coyote - dt, 0);
    }

    // 2. jump buffer
    if (jumpPressed) this.buffer = p.jump_buffer_time;
    const wantsJump = jumpPressed || this.buffer > 0;
    const canGroundJump = this.onFloor || this.coyote > 0;
    const canAirJump = jumpPressed && !canGroundJump && this.airJumpsLeft > 0;

    // 3. dash start
    if (input.dashPressed && p.dash_enabled && !this.dash && this.cooldown <= 0 &&
        (this.onFloor || this.airDashesLeft > 0)) {
      if (!this.onFloor) this.airDashesLeft -= 1;
      this.dash = {
        dir: move !== 0 ? Math.sign(move) : this.facing,
        left: p.dash_distance,
        speed: d.dash_speed,
        preVy: this.vel.y,
      };
      this.cooldown = p.dash_cooldown;
      this.cuttable = false;
      this.events.push({ type: "dash" });
    }

    // 4. dash in progress - it owns the velocity, unless a jump cancels it
    if (this.dash) {
      const cancel = p.dash_jump_cancel && wantsJump && (canGroundJump || canAirJump);
      if (cancel) {
        this.endDash(p.dash_jump_carry);
      } else {
        return this.dashTick(dt);
      }
    }

    // 5. jumps
    if (wantsJump && canGroundJump) {
      this.vel.y = d.jump_speed;
      this.riseGravity = d.rise_gravity;
      this.coyote = 0;
      this.buffer = 0;
      this.cuttable = true;
      this.onFloor = false;
      this.events.push({ type: "jump" });
    } else if (canAirJump) {
      this.vel.y = d.air_jump_speed;
      this.riseGravity = d.air_rise_gravity;
      this.airJumpsLeft -= 1;
      this.buffer = 0;
      this.cuttable = true;
      if (p.air_jump_redirect) {
        const keepCarry = Math.sign(move) === Math.sign(this.vel.x) &&
          Math.abs(this.vel.x) > d.walk_speed;
        if (!keepCarry) this.vel.x = move * d.walk_speed;
      }
      this.events.push({ type: "air_jump" });
    }
    this.buffer = Math.max(this.buffer - dt, 0);

    // 6. variable jump height
    if (released && this.cuttable && this.vel.y > 0) {
      this.vel.y *= 1 - p.jump_cut;
      this.cuttable = false;
    }

    // 7. horizontal
    const vx0 = this.vel.x;
    const vx1 = this.horizontal(vx0, move, dt);
    this.vel.x = vx1;

    // 8. vertical
    let my = 0;
    if (!this.onFloor) {
      const [vy1, dy] = this.vertical(this.vel.y, jumpHeld, dt);
      this.vel.y = vy1;
      my = dy / dt;
    }

    return { x: (vx0 + vx1) / 2, y: my };
  }

  // Collision results for the tick that just moved.
  afterMove({ onFloor, hitX = false, hitY = false }) {
    if (hitX && !this.dash) this.vel.x = 0;
    if (hitY) {
      // Ceiling bonk or landing. Either way the vertical speed is gone.
      if (this.vel.y > 0) this.cuttable = false;
      this.vel.y = 0;
    }
    if (onFloor && !this.onFloor) this.events.push({ type: "land" });
    this.onFloor = onFloor;
  }

  dashTick(dt) {
    const dash = this.dash;
    // Cover the distance EXACTLY: the last tick only moves what is left, so a dash
    // is the same length at 30, 60 or 144 Hz.
    const step = Math.min(dash.speed * dt, dash.left);
    dash.left -= step;
    const p = this.p;
    this.vel.x = dash.dir * dash.speed;
    this.vel.y = p.dash_lift;
    const result = { x: (dash.dir * step) / dt, y: p.dash_lift };
    if (dash.left <= 1e-9) this.endDash(p.dash_exit_speed);
    if (p.dash_lift > 0) this.onFloor = false;
    return result;
  }

  endDash(carry) {
    const dash = this.dash;
    if (!dash) return;
    this.vel.x = dash.dir * dash.speed * carry;
    this.vel.y = dash.preVy * this.p.dash_vertical_resume;
    if (this.p.dash_refills_air_jumps) this.airJumpsLeft = this.p.air_jumps;
    this.dash = null;
    this.events.push({ type: "dash_end" });
  }

  horizontal(v, move, dt) {
    const p = this.p;
    const walk = this.d.walk_speed;
    const target = move * walk;
    const ground = this.onFloor;

    // Faster than walking, in the direction the stick points: bleed off the carry.
    if (Math.abs(v) > walk && move !== 0 && Math.sign(move) === Math.sign(v)) {
      const over = Math.max(this.d.dash_speed - walk, walk);
      const rate = p.carry_decay_time > 0 ? over / p.carry_decay_time : Infinity;
      return moveToward(v, target, rate * dt);
    }

    const accelerating = move !== 0 && (v === 0 || Math.sign(v) === Math.sign(move));
    const time = accelerating
      ? (ground ? p.ground_accel_time : p.air_accel_time)
      : (ground ? p.ground_decel_time : p.air_decel_time);
    const rate = time > 0 ? walk / time : Infinity;
    return moveToward(v, target, rate * dt);
  }

  // Exact integration of one tick of gravity. Returns [end velocity, displacement].
  // Handles crossing the apex (rise gravity -> fall gravity) and hitting terminal
  // velocity inside the tick, so neither costs accuracy.
  vertical(vy, jumpHeld, dt) {
    const p = this.p;
    const fall = this.d.fall_gravity;
    const hang = (g, v) =>
      jumpHeld && p.apex_threshold > 0 && Math.abs(v) < p.apex_threshold ? g * p.apex_gravity_scale : g;

    if (vy > 0) {
      const g = hang(this.riseGravity, vy);
      const t0 = vy / g; // time to the apex
      if (t0 >= dt) return [vy - g * dt, vy * dt - 0.5 * g * dt * dt];
      const up = 0.5 * vy * t0;
      const [v1, down] = this.falling(0, hang(fall, 0), dt - t0);
      return [v1, up + down];
    }
    return this.falling(vy, hang(fall, vy), dt);
  }

  falling(vy, g, dt) {
    const max = this.p.max_fall_speed;
    if (vy <= -max) return [-max, -max * dt];
    const t1 = (vy + max) / g; // time until terminal velocity
    if (t1 >= dt) return [vy - g * dt, vy * dt - 0.5 * g * dt * dt];
    return [-max, vy * t1 - 0.5 * g * t1 * t1 - max * (dt - t1)];
  }
}

function moveToward(v, target, delta) {
  if (Math.abs(target - v) <= delta) return target;
  return v + Math.sign(target - v) * delta;
}

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
