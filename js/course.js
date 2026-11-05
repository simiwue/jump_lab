// The test course: a grid of solid cells, parsed from plain text.
//
// Cell (cx, cy) covers x in [cx, cx+1) and y in [cy, cy+1), with y pointing UP.
// The text is written top row first, so row r of the text is cy = height-1-r.
// Outside the course on the left and right is solid (walls); below and above is
// empty, so you can fall out.

export class Course {
  constructor(text) {
    this.parse(text);
  }

  parse(text) {
    const rows = [];
    this.stations = [];
    const names = {};

    for (const raw of text.split("\n")) {
      const line = raw.replace(/\s+$/, "");
      if (line.startsWith("//")) continue;
      if (line.startsWith("@")) {
        const m = line.match(/^@([A-Z])\s+([^|]*)\|?(.*)$/);
        if (m) names[m[1]] = { name: m[2].trim(), hint: m[3].trim() };
        continue;
      }
      if (line.length === 0) continue;
      rows.push(line);
    }

    this.height = rows.length;
    this.width = Math.max(1, ...rows.map((r) => r.length));
    this.cells = new Uint8Array(this.width * this.height);
    this.labels = [];

    for (let r = 0; r < rows.length; r++) {
      const cy = this.height - 1 - r;
      const row = rows[r];
      let digits = "";
      let digitsStart = 0;
      for (let cx = 0; cx <= row.length; cx++) {
        const ch = row[cx] ?? "";
        if (/[0-9]/.test(ch)) {
          if (!digits) digitsStart = cx;
          digits += ch;
          continue;
        }
        if (digits) {
          this.labels.push({ x: digitsStart + digits.length / 2, y: cy + 0.5, text: digits });
          digits = "";
        }
        if (ch === "#") this.cells[cy * this.width + cx] = 1;
        else if (/[A-Z]/.test(ch)) {
          const meta = names[ch] ?? { name: ch, hint: "" };
          this.stations.push({ key: ch, x: cx + 0.5, y: cy, ...meta });
        }
      }
    }
    this.stations.sort((a, b) => a.key.localeCompare(b.key));
  }

  isSolid(cx, cy) {
    if (cx < 0 || cx >= this.width) return true;
    if (cy < 0 || cy >= this.height) return false;
    return this.cells[cy * this.width + cx] === 1;
  }

  setSolid(cx, cy, solid) {
    if (cx < 0 || cx >= this.width || cy < 0 || cy >= this.height) return;
    this.cells[cy * this.width + cx] = solid ? 1 : 0;
  }

  // Back to text, keeping stations and labels, for saving a painted course.
  toText() {
    const grid = [];
    for (let cy = this.height - 1; cy >= 0; cy--) {
      const row = [];
      for (let cx = 0; cx < this.width; cx++) row.push(this.cells[cy * this.width + cx] ? "#" : ".");
      grid.push(row);
    }
    const put = (x, y, text) => {
      const r = this.height - 1 - y;
      for (let i = 0; i < text.length; i++) if (grid[r] && x + i < this.width) grid[r][x + i] = text[i];
    };
    for (const l of this.labels) put(Math.round(l.x - l.text.length / 2), Math.floor(l.y), l.text);
    for (const s of this.stations) put(Math.floor(s.x), s.y, s.key);
    const header = this.stations.map((s) => `@${s.key} ${s.name} | ${s.hint}`);
    return [...header, "", ...grid.map((r) => r.join(""))].join("\n") + "\n";
  }
}
