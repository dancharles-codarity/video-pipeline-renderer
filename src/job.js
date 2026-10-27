// A job file names the format, the brand, the footage to preview over and the
// items: graphics (scene code rendered by the player) and B-roll (clips placed
// as they are). Paths resolve against the job file's folder; URLs are fetched.
import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from './formats.js';
import { sceneCode } from './film.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const isUrl = (s) => /^https?:\/\//i.test(s);

export async function fetchBytes(src, baseDir) {
  if (isUrl(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`fetch ${src}: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return readFileSync(isAbsolute(src) ? src : join(baseDir, src));
}

// A media source ffmpeg reads directly: a URL stays a URL (ffmpeg seeks over
// HTTP ranges, so only the window is downloaded), a path becomes absolute.
export function mediaPath(src, baseDir) {
  if (isUrl(src)) return src;
  const p = isAbsolute(src) ? src : resolve(baseDir, src);
  if (!existsSync(p)) throw new Error(`media not found: ${p}`);
  return p;
}

export function loadBrand(ref, fmtName, baseDir) {
  const dir = [baseDir && resolve(baseDir, ref), join(ROOT, 'brands', ref)].filter(Boolean).find((d) => existsSync(join(d, 'brand.json')));
  if (!dir) throw new Error(`brand "${ref}" not found (no brand.json in ${ref} or brands/${ref})`);
  const b = JSON.parse(readFileSync(join(dir, 'brand.json'), 'utf8'));
  const cssFile = b.css?.[fmtName];
  if (!cssFile) throw new Error(`brand "${ref}" has no stylesheet for ${fmtName}`);
  return {
    name: b.name, ground: b.ground ?? '#000000', look: b.look ?? b.name,
    css: readFileSync(join(dir, cssFile), 'utf8'),
    fonts: (b.fonts ?? []).map((f) => ({ name: basename(f), bytes: readFileSync(join(dir, f)) })),
  };
}

function check(cond, msg) { if (!cond) throw new Error(msg); }

// Accepts a parsed job and the folder its relative paths resolve against.
// remote: true when the job came over HTTP. Then every media source must be a
// URL, scenes must be a template or inline code, and the brand a bundled name,
// so a request can never read files off the server.
export async function prepareJob(job, baseDir, { remote = false } = {}) {
  check(job && typeof job === 'object', 'job must be an object');
  if (remote) {
    const url = (s, what) => check(typeof s === 'string' && isUrl(s), `${what} must be an http(s) URL`);
    if (job.base) url(job.base, 'base');
    if (job.brand) check(/^[a-z0-9][a-z0-9-]{0,63}$/.test(job.brand), 'brand must be a bundled brand name');
    for (const [name, src] of Object.entries(job.assets ?? {})) url(src, `assets.${name}`);
    for (const [i, it] of (job.items ?? []).entries()) {
      if (it.src !== undefined) url(it.src, `items[${i}].src`);
      check(!it.scene?.file, `items[${i}].scene.file is not accepted remotely: send the code inline`);
    }
  }
  const fmt = format(job.format ?? 'landscape');
  const fmtName = job.format ?? 'landscape';
  check(Array.isArray(job.items) && job.items.length, 'job.items must list at least one item');
  const brand = job.brand ? loadBrand(job.brand, fmtName, baseDir) : null;

  const names = new Set();
  const items = job.items.map((it, i) => {
    const where = `items[${i}]`;
    check(typeof it.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(it.name), `${where}.name must be a plain file-safe name`);
    check(!names.has(it.name), `${where}.name "${it.name}" is used twice`);
    names.add(it.name);
    check(typeof it.at === 'number' && it.at >= 0, `${where}.at must be the placement in composition seconds`);
    const type = it.type ?? (it.src ? 'broll' : 'graphic');
    if (type === 'broll') {
      check(typeof it.src === 'string', `${where}.src must name the clip`);
      check(typeof it.dur === 'number' && it.dur > 0, `${where}.dur must be the clip's length on the timeline`);
      return { ...it, type, in: it.in ?? 0, src: mediaPath(it.src, baseDir) };
    }
    check(type === 'graphic', `${where}.type must be graphic or broll`);
    check(brand, 'graphics need job.brand');
    check(typeof it.dur === 'number' && it.dur > 0 && it.dur <= 300, `${where}.dur must be 0 to 300 seconds`);
    check(it.scene && typeof it.scene === 'object', `${where}.scene must give a template, file or code`);
    return { ...it, type, transparent: !!it.transparent, code: sceneCode(it.scene, baseDir) };
  });

  const extra = [];
  for (const [name, src] of Object.entries(job.assets ?? {})) extra.push({ name, bytes: await fetchBytes(src, baseDir) });

  return {
    fmt, fmtName, brand, items,
    assets: [...(brand?.fonts ?? []), ...extra],
    base: job.base ? mediaPath(job.base, baseDir) : null,
  };
}

export async function readJobFile(path) {
  const abs = resolve(path);
  return prepareJob(JSON.parse(readFileSync(abs, 'utf8')), dirname(abs));
}
