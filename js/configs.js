// Profiles in the configs/ folder, offered in the config menu.
//
// A page cannot list a folder by itself, so this reads the listing the web server
// produces (python3 -m http.server does). Hosts without listings, like GitHub Pages,
// need a configs/index.json: a JSON array of the file names.
//
// Saving needs server.py: a page cannot write to a folder by itself.

import { fromFile, slug } from "./profile.js";

const DIR = new URL("../configs/", import.meta.url);
const FRESH = { cache: "no-cache" }; // a reload picks up edited files

// The .json files directly inside `base`, from the HTML of its listing.
export function jsonLinks(html, base) {
  const dir = new URL(base);
  const names = new Set();
  for (const [, href] of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const { pathname } = new URL(href, dir);
    if (!pathname.startsWith(dir.pathname)) continue;
    const name = decodeURIComponent(pathname.slice(dir.pathname.length));
    if (/^[^/]+\.json$/i.test(name) && name.toLowerCase() !== "index.json") names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

async function fileNames() {
  const listing = await fetch(DIR, FRESH).catch(() => null);
  const found = listing?.ok ? jsonLinks(await listing.text(), DIR) : [];
  if (found.length) return found;
  const manifest = await fetch(new URL("index.json", DIR), FRESH).catch(() => null);
  return manifest?.ok ? manifest.json() : [];
}

async function loadOne(file) {
  const res = await fetch(new URL(encodeURIComponent(file), DIR), FRESH);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const label = file.replace(/\.json$/i, "");
  return { ...fromFile(json), file, label, name: json.name ?? label, note: json.note };
}

// The file a profile called `name` saves to: the config already going by that name,
// as its "name" or its file name, or else a new file.
export function fileFor(name, configs) {
  const wanted = String(name).trim().toLowerCase();
  const same = configs.find((c) => c.file &&
    [c.name, c.label].some((n) => String(n).trim().toLowerCase() === wanted));
  return same?.file ?? `${slug(name)}.json`;
}

// Writes the file. Returns true if it is new, false if it replaced one.
export async function saveConfig(file, data) {
  const res = await fetch(new URL(encodeURIComponent(file), DIR), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data, null, 2) + "\n",
  }).catch(() => null);
  if (res?.status === 201) return true;
  if (res?.ok) return false;
  if (!res || res.status === 405 || res.status === 501) {
    throw new Error("saving needs the lab's own server: python3 server.py");
  }
  throw new Error(`could not save ${file}: HTTP ${res.status}`);
}

// Returns { configs, failed }: a bad file is reported, not fatal.
export async function loadConfigs() {
  const configs = [];
  const failed = [];
  const names = await fileNames().catch(() => []);
  const loaded = await Promise.allSettled(names.map(loadOne));
  loaded.forEach((r, i) => {
    if (r.status === "fulfilled") configs.push(r.value);
    else failed.push(names[i]);
  });
  return { configs, failed };
}
