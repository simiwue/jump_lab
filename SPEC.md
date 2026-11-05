# Motor specification

How a jump-lab profile turns into movement, step by step, so the same numbers behave
the same in any engine. The reference implementation is `js/motor.js`; this document
describes it. If the two disagree, the code wins and this file has a bug.

A port is correct when it reproduces `spec/vectors.json` (see the end).

## Conventions

- Plane space: **x to the right, y up**. Lengths in **cells** (your tile size), time in
  **seconds**. Convert at the edge: `pixels = cells * tile_size`, and flip y if your
  engine's y points down.
- Fixed timestep `dt`. The motor never reads the clock.
- The motor does no collision. Each tick:
  1. `move = step(dt, input)` returns the velocity to move the body with this tick;
  2. the engine moves the body by `move * dt` and resolves collisions;
  3. `afterMove(onFloor, hitX, hitY)` reports what happened.

## Derived values

```
walk_speed       = jump_distance / (jump_rise_time + jump_fall_time)
rise_gravity     = 2 * jump_height / jump_rise_time²
fall_gravity     = 2 * jump_height / jump_fall_time²
jump_speed       = rise_gravity * jump_rise_time
air_rise_gravity = 2 * air_jump_height / air_jump_rise_time²
air_jump_speed   = air_rise_gravity * air_jump_rise_time
dash_speed       = dash_distance / dash_time
```

The air jump falls with `fall_gravity`.

## State

```
vel            end-of-tick velocity (x, y)
onFloor        from the last afterMove
coyote         seconds of coyote time left
buffer         seconds of jump buffer left
airJumpsLeft, airDashesLeft
cooldown       seconds until the next dash is allowed
dash           null, or { dir, left (cells still to cover), speed, preVy }
riseGravity    gravity of the jump currently rising (ground or air)
cuttable       the current rise may still be cut by releasing jump
facing         -1 or +1
jumpHeldPrev   jump held on the previous tick
```

`reset(onFloor)`: velocity 0, timers 0, refills full, no dash, facing +1,
`riseGravity = rise_gravity`.

## Input

```
move         -1..1
jumpPressed  jump went down since the last tick (LATCH it - see below)
jumpHeld     jump is down now
dashPressed  dash went down since the last tick
```

Presses must be latched between ticks: a tap that goes down and up between two ticks
still counts as `jumpPressed` on the next tick. `jumpPressed` implies held for that tick.

## step(dt, input)

```
released     = jumpHeldPrev and not jumpHeld        (jumpHeld := jumpHeld or jumpPressed)
jumpHeldPrev = jumpHeld
if move != 0: facing = sign(move)
cooldown = max(cooldown - dt, 0)
```

**1. Ground contact.** If `onFloor and vel.y <= 0`: `vel.y = 0`, `coyote = coyote_time`,
refill `airJumpsLeft = air_jumps`, `airDashesLeft = air_dashes`.
Otherwise `coyote = max(coyote - dt, 0)`.

**2. Jump buffer.** If `jumpPressed`: `buffer = jump_buffer_time`.
```
wantsJump     = jumpPressed or buffer > 0
canGroundJump = onFloor or coyote > 0
canAirJump    = jumpPressed and not canGroundJump and airJumpsLeft > 0
```
An air jump needs a *fresh* press; a buffered press waits for the ground.

**3. Dash start.** If `dashPressed and dash_enabled and no dash and cooldown <= 0 and
(onFloor or airDashesLeft > 0)`: if not on the floor, `airDashesLeft -= 1`; start
`dash = { dir: sign(move) or facing, left: dash_distance, speed: dash_speed, preVy: vel.y }`;
`cooldown = dash_cooldown`; `cuttable = false`.

**4. Dashing.** If a dash is active:
- if `dash_jump_cancel and wantsJump and (canGroundJump or canAirJump)`:
  `endDash(dash_jump_carry)` and continue with step 5;
- otherwise return `dashTick(dt)` - the dash owns the velocity this tick.

**5. Jumps.**
- if `wantsJump and canGroundJump`: `vel.y = jump_speed`, `riseGravity = rise_gravity`,
  `coyote = 0`, `buffer = 0`, `cuttable = true`, `onFloor = false`.
- else if `canAirJump`: `vel.y = air_jump_speed`, `riseGravity = air_rise_gravity`,
  `airJumpsLeft -= 1`, `buffer = 0`, `cuttable = true`; if `air_jump_redirect`: unless
  already faster than walk speed in the stick's direction, `vel.x = move * walk_speed`.

Then `buffer = max(buffer - dt, 0)`.

**6. Jump cut.** If `released and cuttable and vel.y > 0`:
`vel.y *= 1 - jump_cut`, `cuttable = false`.

**7. Horizontal.** `vx0 = vel.x`, `target = move * walk_speed`.
- If `|vx0| > walk_speed` and `move` points the same way as `vx0` (carried dash speed):
  move toward `target` at `max(dash_speed - walk_speed, walk_speed) / carry_decay_time`
  per second (instantly if the time is 0).
- Otherwise: accelerating if `move != 0` and (`vx0 == 0` or same sign as `move`).
  Time = `ground_accel_time` / `air_accel_time` when accelerating, `ground_decel_time` /
  `air_decel_time` otherwise (ground = `onFloor`). Move toward `target` at
  `walk_speed / time` per second (instantly if the time is 0).

`vel.x = vx1`; the tick moves with the **average** `(vx0 + vx1) / 2`.

**8. Vertical.** If on the floor, the tick moves 0 vertically. Otherwise integrate
gravity **exactly** over the tick and return the average velocity `dy / dt`:

```
hang(g, v) = g * apex_gravity_scale   if jumpHeld and apex_threshold > 0 and |v| < apex_threshold
             g                        otherwise

vertical(vy):
  if vy > 0:
    g  = hang(riseGravity, vy)
    t0 = vy / g                                   # time to the apex
    if t0 >= dt: return (vy - g*dt,  vy*dt - g*dt²/2)
    (v1, down) = falling(0, hang(fall_gravity, 0), dt - t0)
    return (v1, vy*t0/2 + down)
  return falling(vy, hang(fall_gravity, vy), dt)

falling(vy, g, t):                                # with terminal velocity max = max_fall_speed
  if vy <= -max: return (-max, -max*t)
  t1 = (vy + max) / g                             # time to terminal velocity
  if t1 >= t: return (vy - g*t,  vy*t - g*t²/2)
  return (-max, vy*t1 - g*t1²/2 - max*(t - t1))
```

Return `(vx0 + vx1) / 2, dy / dt`.

This is why a 4-cell jump peaks at exactly 4.0 at any tick rate. Plain Euler
integration (`v -= g*dt; y += v*dt`) misses the apex by up to half a tick of motion,
and by a different amount at 30, 60 or 144 Hz.

### dashTick(dt)

```
step     = min(dash.speed * dt, dash.left)            # the last tick covers only what is left
dash.left -= step
vel      = (dash.dir * dash.speed, dash_lift)
result   = (dash.dir * step / dt, dash_lift)
if dash.left <= 1e-9: endDash(dash_exit_speed)
if dash_lift > 0: onFloor = false
return result
```

Distance, not time, ends the dash, so its length is exact at any tick rate.

### endDash(carry)

`vel.x = dir * speed * carry`, `vel.y = preVy * dash_vertical_resume`; if
`dash_refills_air_jumps`, `airJumpsLeft = air_jumps`; `dash = null`.

## afterMove(onFloor, hitX, hitY)

```
if hitX and not dashing: vel.x = 0
if hitY: (if vel.y > 0: cuttable = false); vel.y = 0      # ceiling or landing
this.onFloor = onFloor
```

## Events

The reference motor emits `jump`, `air_jump`, `dash`, `dash_end`, `land` for sound,
effects and measurement. They do not affect the physics.

## Checking a port: `spec/vectors.json`

Recorded at `dt = 1/60` for every preset in `params` and every predicted scenario.
Each case starts on flat ground at (0, 0), on the floor, with `vel.x = start_vx`, and
lists per tick the input `[move, jumpPressed, jumpHeld, dashPressed]` and the feet
position after the tick.

Replay it with this ground model (no walls):

```
move = step(dt, input)
pos += move * dt
if pos.y > 1e-9: left = true
if pos.y <= 0 and (left or move.y < 0): pos.y = 0
afterMove(onFloor = pos.y <= 0, hitY = pos.y <= 0 and move.y < 0)
```

and compare positions; they should agree to about 1e-6 cells. Regenerate the file
from `tests/index.html` after any change to the motor.
