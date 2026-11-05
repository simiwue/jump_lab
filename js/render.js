// Canvas drawing. Knows the course, the body, the traces and the predictions, and
// nothing about physics.

const C = {
  bg: "#f3efe6",
  grid: "rgba(40, 60, 80, 0.07)",
  grid5: "rgba(40, 60, 80, 0.16)",
  solid: "#2d3c4f",
  solidTop: "#4a6079",
  label: "#b0662e",
  station: "#6c7a89",
  player: "#1d6fb8",
  playerDash: "#e0703a",
  trace: "#e0703a",
  lastTrace: "rgba(45, 60, 79, 0.35)",
  pinned: "#7b4fc9",
  text: "#2d3c4f",
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cell = 28; // pixels per cell (zoom)
    this.cam = { x: 0, y: 0 };
    this.viewOffset = 0; // pixels to shift the view left, to clear the side panel
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // cells -> screen pixels (y flips: cells go up, pixels go down)
  sx(x) { return (x - this.cam.x) * this.cell + (this.w - this.viewOffset) / 2; }
  sy(y) { return this.h * 0.62 - (y - this.cam.y) * this.cell; }
  // screen pixels -> cells
  cx(px) { return (px - (this.w - this.viewOffset) / 2) / this.cell + this.cam.x; }
  cy(py) { return (this.h * 0.62 - py) / this.cell + this.cam.y; }

  follow(target, dt) {
    const k = 1 - Math.exp(-dt * 8);
    this.cam.x += (target.x - this.cam.x) * k;
    this.cam.y += (target.y - this.cam.y) * k * 0.6;
  }

  draw(scene) {
    const { ctx } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid();
    this.drawCourse(scene.course);
    if (scene.showPredictions) this.drawPredictions(scene.predictions, scene.anchor, scene.anchorFacing);
    if (scene.pinned) this.drawPath(scene.pinned, C.pinned, 2, [6, 4]);
    if (scene.lastTrace) this.drawPath(scene.lastTrace, C.lastTrace, 2);
    if (scene.trace) this.drawPath(scene.trace, C.trace, 2.5);
    this.drawBody(scene.body, scene.bodyPos, scene.motor);
    if (scene.paint) this.drawPaintCursor(scene.paint);
  }

  visibleCells() {
    return {
      x0: Math.floor(this.cx(0)) - 1,
      x1: Math.ceil(this.cx(this.w)) + 1,
      y0: Math.floor(this.cy(this.h)) - 1,
      y1: Math.ceil(this.cy(0)) + 1,
    };
  }

  drawGrid() {
    const { ctx } = this;
    const v = this.visibleCells();
    ctx.lineWidth = 1;
    for (let x = v.x0; x <= v.x1; x++) {
      ctx.strokeStyle = x % 5 === 0 ? C.grid5 : C.grid;
      const px = Math.round(this.sx(x)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.h); ctx.stroke();
    }
    for (let y = v.y0; y <= v.y1; y++) {
      ctx.strokeStyle = y % 5 === 0 ? C.grid5 : C.grid;
      const py = Math.round(this.sy(y)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.w, py); ctx.stroke();
    }
  }

  drawCourse(course) {
    const { ctx } = this;
    const v = this.visibleCells();
    const s = this.cell;
    // Left and right of the course are solid walls; draw them, or the player bumps
    // into nothing.
    ctx.fillStyle = C.solid;
    if (v.x0 < 0) ctx.fillRect(0, 0, this.sx(0), this.h);
    if (v.x1 >= course.width) ctx.fillRect(this.sx(course.width), 0, this.w, this.h);
    for (let y = Math.max(v.y0, 0); y <= Math.min(v.y1, course.height - 1); y++) {
      // Merge horizontal runs: fewer rects, no hairline seams between cells.
      let x = Math.max(v.x0, 0);
      const xEnd = Math.min(v.x1, course.width - 1);
      while (x <= xEnd) {
        if (!course.isSolid(x, y)) { x++; continue; }
        const start = x;
        while (x <= xEnd && course.isSolid(x, y)) x++;
        const px = this.sx(start);
        const py = this.sy(y + 1);
        ctx.fillStyle = C.solid;
        ctx.fillRect(px, py, (x - start) * s + 0.5, s + 0.5);
        // A lighter top edge wherever the cell above is open: shows what is a floor.
        ctx.fillStyle = C.solidTop;
        for (let i = start; i < x; i++) {
          if (!course.isSolid(i, y + 1)) ctx.fillRect(this.sx(i), py, s + 0.5, Math.max(2, s * 0.12));
        }
      }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${Math.max(10, s * 0.55)}px system-ui, sans-serif`;
    ctx.fillStyle = C.label;
    for (const l of course.labels) {
      if (l.x < v.x0 - 2 || l.x > v.x1 + 2) continue;
      ctx.fillText(l.text, this.sx(l.x), this.sy(l.y));
    }

    ctx.font = `600 ${Math.max(11, s * 0.5)}px system-ui, sans-serif`;
    ctx.fillStyle = C.station;
    ctx.textAlign = "left";
    for (const st of course.stations) {
      if (st.x < v.x0 - 30 || st.x > v.x1 + 2) continue;
      ctx.fillText(`${st.key}  ${st.name}`, this.sx(st.x - 0.5), this.sy(st.y + 2.4));
    }
  }

  drawPath(points, color, width, dash = []) {
    if (!points || points.length < 2) return;
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(this.sx(points[0].x), this.sy(points[0].y));
    for (const p of points) ctx.lineTo(this.sx(p.x), this.sy(p.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawPredictions(predictions, anchor, facing) {
    if (!predictions || !anchor) return;
    const { ctx } = this;
    for (const pr of predictions) {
      const pts = pr.points.map((p) => ({ x: anchor.x + p.x * facing, y: anchor.y + p.y }));
      this.drawPath(pts, pr.color + "aa", 1.5, [3, 4]);
      // Apex marker with its height
      let top = pts[0];
      for (const p of pts) if (p.y > top.y) top = p;
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.arc(this.sx(top.x), this.sy(top.y), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(pr.apex.toFixed(2), this.sx(top.x), this.sy(top.y) - 5);
      const end = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(this.sx(end.x), this.sy(end.y), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBody(body, pos, motor) {
    const { ctx } = this;
    const s = this.cell;
    const x = this.sx(pos.x - body.w / 2);
    const y = this.sy(pos.y + body.h);
    const w = body.w * s;
    const h = body.h * s;
    ctx.fillStyle = motor.dashing ? C.playerDash : C.player;
    ctx.fillRect(x, y, w, h);

    // Eye: shows facing.
    ctx.fillStyle = "#fff";
    const ex = this.sx(pos.x + motor.facing * body.w * 0.22);
    ctx.fillRect(ex - s * 0.07, this.sy(pos.y + body.h * 0.78), s * 0.14, s * 0.18);

    // Remaining air jumps as dots, dash readiness as a bar.
    const p = motor.p;
    for (let i = 0; i < p.air_jumps; i++) {
      ctx.fillStyle = i < motor.airJumpsLeft ? C.player : "rgba(29,111,184,0.2)";
      ctx.beginPath();
      ctx.arc(this.sx(pos.x) + (i - (p.air_jumps - 1) / 2) * s * 0.3, y - s * 0.25, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    if (p.dash_enabled) {
      const ready = p.dash_cooldown > 0 ? 1 - motor.cooldown / p.dash_cooldown : 1;
      const canAir = motor.onFloor || motor.airDashesLeft > 0;
      ctx.fillStyle = "rgba(224,112,58,0.25)";
      ctx.fillRect(x, y + h + 3, w, 3);
      ctx.fillStyle = canAir ? C.playerDash : "rgba(224,112,58,0.5)";
      ctx.fillRect(x, y + h + 3, w * ready, 3);
    }
  }

  drawPaintCursor(paint) {
    const { ctx } = this;
    ctx.strokeStyle = paint.erase ? "#c0392b" : C.solid;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.sx(paint.cx), this.sy(paint.cy + 1), this.cell, this.cell);
  }
}
