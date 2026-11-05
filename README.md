# Jump Lab

Tune the jump, double jump and dash of a platformer character in the browser, and
take the numbers home as JSON.

- **Design in what you can see.** You set "jumps 4 cells high, rises in 0.3 s, crosses
  5 cells". Gravity and speeds are derived from that, and the readout shows them.
- **The numbers are exact.** The motor integrates gravity exactly, so a 4.0 jump peaks
  at 4.0 at 30, 60 or 144 Hz, and a 3-cell dash is 3 cells long at any tick rate.
- **See before you jump.** Dotted arcs show where a jump, a jump + air jump, and a
  jump → dash → air jump will land from where you stand, live while you drag a slider.
- **Measure what you did.** Every jump is traced and measured: height, distance, air
  time, which moves you used.
- **A course measured in cells:** floating ledges 3-10 high, gaps 2-10 wide, low
  ceilings, high ledges for the air jump, dash gaps, combo gaps. One unbroken floor and
  no pillars, so you cannot get boxed in. Paint your own with the mouse.
- **Keep your configs.** **Save** writes the current values to `configs/`, and the
  config menu lists everything in that folder.
- **Engine-agnostic.** Export JSON with the parameters *and* the derived physics.
  `SPEC.md` describes the motor step by step; `spec/vectors.json` lets you check a port.

No build step, no dependencies: plain HTML, CSS and JavaScript modules.

## Run it

It has to be served over http (browsers do not load JS modules from `file://`):

```
python3 server.py
```

then open <http://localhost:8000>. `server.py` is a small file server that also lets
the save button write to `configs/`; it needs only Python and answers on this machine
only. Any static host runs the lab too, GitHub Pages included, but cannot save.

## Controls

| | |
|---|---|
| move | A D / ← → / stick / d-pad |
| jump | Space W ↑ K / pad A |
| dash | Shift J L / pad X |
| stations | 1-9, or the buttons in the panel |
| restart at the station | R |
| pin the last trace | P |
| zoom | mouse wheel, + − |
| hide the panel | H |

## The profile file

```json
{
  "format": "jump-lab/1",
  "name": "2D3D + double jump",
  "units": { "length": "cells", "time": "seconds" },
  "params":  { "jump_distance": 5, "jump_height": 4.2, "...": "..." },
  "derived": { "walk_speed": 8.3333, "jump_speed": 28, "rise_gravity": 93.3333, "...": "..." },
  "lab":     { "tick_rate": 60, "body_width": 0.56, "body_height": 1.2 }
}
```

- `params` is the input. Every parameter, its range and what it does is listed in
  `js/profile.js` (`SCHEMA`); hover a slider in the lab for the same text.
- `derived` is written for convenience and ignored on import.
- `lab` holds lab settings (tick rate, body size). Your game does not need them.
- Lengths are in cells: multiply by your tile size.

Import accepts a full file or a bare `params` object. Unknown keys are dropped and
missing keys get their defaults, so old files keep loading as parameters are added.

## Keeping configs

`configs/` holds the JSON files listed in the config menu, starting with four ready-made
ones. **Save** looks at the `name` box: if a config already goes by that name (inside
the file or as its file name) it is replaced, with no undo; otherwise a new file is
created. To branch off a config, change the name first, then save.

You can also manage the folder by hand: drop in, rename or delete files and reload. The
menu shows the file name. A file may hold only the keys that differ from the defaults,
and an optional `note` becomes the menu tooltip (saving keeps it).

The folder is read from the server's file listing, which `server.py` and
`python3 -m http.server` both provide. Hosts without listings, such as GitHub Pages,
need a `configs/index.json` naming the files
(`["snappy.json", "floaty.json"]`); without one the menu falls back to the built-in
copies in `js/presets.js`, which also supply the first-run default and the test vectors.

## Using the numbers in your game

1. Port the motor (`js/motor.js`, ~250 lines, no dependencies) or follow `SPEC.md`.
2. Load the JSON, feed the motor input every fixed tick, move your body by what it
   returns, report collisions back with `afterMove`.
3. Replay `spec/vectors.json` in a test to prove the port matches.

The lab's own collision (`js/body.js`) is a box against a grid. Your engine's
collision will differ slightly at corners; the motor, and so the arcs, will not.

## Tests

Open <http://localhost:8000/tests/>. They check the promises above: exact apex,
air time, distance and dash length at several tick rates, jump cut, coyote time,
buffer, cooldowns, collision. The page also regenerates `spec/vectors.json`.

## Layout

```
index.html, css/lab.css    the page
js/profile.js              parameter schema, derived values, file format
js/motor.js                the motor - the part to port
js/body.js                 box-vs-grid collision for the lab
js/course.js               course text format
js/course_default.js       the default test course
js/predict.js              offline simulation for the predicted arcs
js/presets.js              built-in configs: first-run default, tests, fallback
js/configs.js              loads and saves the configs/ folder
server.py                  file server that can also save to configs/
configs/                   the JSON files shown in the config menu
js/panel.js, render.js, input.js, main.js   the lab itself
tests/                     tests in the browser
spec/vectors.json          golden trajectories for ports
SPEC.md                    the motor, step by step
```
