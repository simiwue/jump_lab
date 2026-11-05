// Keyboard + gamepad, sampled once per physics tick.
//
// Presses are LATCHED: a key that goes down and up again between two ticks still
// counts as one press. Without that, short taps get lost at low tick rates.

const KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  jump: ["Space", "KeyW", "ArrowUp", "KeyK"],
  dash: ["ShiftLeft", "ShiftRight", "KeyJ", "KeyL"],
};

// Standard gamepad mapping (https://w3c.github.io/gamepad/#remapping)
const PAD = { jump: [0], dash: [2, 1, 5, 7], left: [14], right: [15] };
const STICK_DEADZONE = 0.3;

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.latched = { jump: false, dash: false };
    this.padPrev = { jump: false, dash: false };
    this.onKey = null; // optional hook for lab shortcuts: (code, event) => handled?

    target.addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      if (this.onKey && this.onKey(e.code, e)) { e.preventDefault(); return; }
      if (!this.isGameKey(e.code)) return;
      e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      if (KEYS.jump.includes(e.code)) this.latched.jump = true;
      if (KEYS.dash.includes(e.code)) this.latched.dash = true;
    });
    target.addEventListener("keyup", (e) => this.down.delete(e.code));
    target.addEventListener("blur", () => this.down.clear());
  }

  isGameKey(code) {
    return Object.values(KEYS).some((list) => list.includes(code));
  }

  held(action) {
    return KEYS[action].some((k) => this.down.has(k));
  }

  // One tick's worth of input, in the shape the motor wants.
  sample() {
    const pad = readPad();
    let move = (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0);
    if (move === 0 && pad) move = pad.move;

    const padJump = pad?.jump ?? false;
    const padDash = pad?.dash ?? false;
    const input = {
      move,
      jumpHeld: this.held("jump") || padJump,
      jumpPressed: this.latched.jump || (padJump && !this.padPrev.jump),
      dashPressed: this.latched.dash || (padDash && !this.padPrev.dash),
    };
    this.padPrev = { jump: padJump, dash: padDash };
    this.latched = { jump: false, dash: false };
    return input;
  }
}

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const pressed = (list) => list.some((i) => pad.buttons[i]?.pressed);
    let move = 0;
    const ax = pad.axes[0] ?? 0;
    if (Math.abs(ax) > STICK_DEADZONE) move = Math.sign(ax);
    if (pressed(PAD.left)) move = -1;
    if (pressed(PAD.right)) move = 1;
    return { move, jump: pressed(PAD.jump), dash: pressed(PAD.dash) };
  }
  return null;
}

function isTyping(e) {
  const t = e.target;
  if (!t || !t.tagName) return false;
  if (t.tagName === "TEXTAREA") return true;
  if (t.tagName === "INPUT") return !["range", "checkbox", "button"].includes(t.type);
  return t.isContentEditable;
}
