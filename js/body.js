// A box-shaped body moving through a grid of solid cells.
//
// Deliberately simple and exact: axis-aligned box against axis-aligned cells, X
// first, then Y, in sub-steps short enough that a fast dash cannot tunnel through a
// one-cell wall. Position is the middle of the FEET (bottom centre of the box),
// which is the point a level designer measures heights from.

const EPS = 1e-6;
const MAX_SUBSTEP = 0.25; // cells

export class Body {
  constructor(width = 0.6, height = 1.2) {
    this.w = width;
    this.h = height;
    this.x = 0;
    this.y = 0;
  }

  // Move by velocity * dt through `grid` (anything with isSolid(cx, cy)).
  // Returns { onFloor, hitX, hitY }.
  moveAndSlide(grid, vel, dt) {
    let hitX = false;
    let hitY = false;
    let landed = false;

    const dx = vel.x * dt;
    const dy = vel.y * dt;

    const nx = Math.max(1, Math.ceil(Math.abs(dx) / MAX_SUBSTEP));
    for (let i = 0; i < nx && !hitX; i++) hitX = this.stepX(grid, dx / nx);

    const ny = Math.max(1, Math.ceil(Math.abs(dy) / MAX_SUBSTEP));
    for (let i = 0; i < ny && !hitY; i++) {
      hitY = this.stepY(grid, dy / ny);
      if (hitY && dy < 0) landed = true;
    }

    const onFloor = landed || (dy <= 0 && this.touching(grid, 0, -2 * EPS));
    return { onFloor, hitX, hitY };
  }

  stepX(grid, dx) {
    if (dx === 0) return false;
    this.x += dx;
    if (!this.overlaps(grid)) return false;
    // Push back out to the cell border we ran into.
    if (dx > 0) this.x = Math.floor(this.x + this.w / 2) - this.w / 2 - EPS;
    else this.x = Math.floor(this.x - this.w / 2) + 1 + this.w / 2 + EPS;
    return true;
  }

  stepY(grid, dy) {
    if (dy === 0) return false;
    this.y += dy;
    if (!this.overlaps(grid)) return false;
    if (dy > 0) this.y = Math.floor(this.y + this.h) - this.h - EPS;
    else this.y = Math.floor(this.y) + 1 + EPS;
    return true;
  }

  overlaps(grid) {
    return this.touching(grid, 0, 0);
  }

  touching(grid, ox, oy) {
    const x0 = Math.floor(this.x - this.w / 2 + ox + EPS);
    const x1 = Math.floor(this.x + this.w / 2 + ox - EPS);
    const y0 = Math.floor(this.y + oy + EPS * (oy === 0 ? 1 : 0));
    const y1 = Math.floor(this.y + this.h + oy - EPS);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (grid.isSolid(cx, cy)) return true;
      }
    }
    return false;
  }
}
