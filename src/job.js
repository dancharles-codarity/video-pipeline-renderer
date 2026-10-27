// A job file names the format, the client's design system, the footage to
// preview over and the items: graphics (scene code rendered by the player) and
// B-roll (clips placed as they are). Paths resolve against the job file's
// folder; URLs are fetched; data: URIs are decoded.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { format } from './formats.js';
import { buildDesign } from './design.js';

const isUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
const isData = (s) => typeof s === 'string' && /^data:[^,]*;base64,/i.test(s);

function check(cond, msg) { if (!cond) throw new Error(msg); }

// Optional allowlist for remote jobs, e.g. VPR_MEDIA_HOSTS=codaritymedia.b-cdn.net
function hostAllowed(src) {
  const list = (process.env.VPR_MEDIA_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(new URL(src).hostname.toLowerCase());
}

function sourceReader(baseDir, remote) {
  return async (src) => {
    if (isData(src)) return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
    if (isUrl(src)) {
      if (remote) check(hostAllowed(src), `host not allowed: ${new URL(src).hostname}`);
      const r = await fetch(src);
      if (!r.ok) throw new Error(`fetch ${src}: HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    }
    check(!remote, `${String(src).slice(0, 80)}: remote jobs take http(s) URLs or data: URIs only`);
    return readFileSync(isAbsolute(src) ? src : join(baseDir, src));
  };
}

// A media source ffmpeg reads directly: a URL stays a URL (ffmpeg seeks over
// HTTP ranges, so only the window is downloaded), a path becomes absolute.
function mediaPath(src, baseDir, remote, what) {
  if (isUrl(src)) {
    if (remote) check(hostAllowed(src), `${what}: host not allowed: ${new URL(src).hostname}`);
    return src;
  }
  check(!remote, `${what} must be an http(s) URL (host it on Bunny first)`);
  const p = isAbsolute(src) ? src : resolve(baseDir, src);
  check(existsSync(p), `${what}: not found: ${p}`);
  return p;
}

// remote: true when the job came over HTTP. Then every source must be a URL or
// a data: URI and scenes must be inline code, so a request can never read files
// off the server.
export async function prepareJob(job, baseDir, { remote = false } = {}) {
  check(job && typeof job === 'object', 'job must be an object');
  const fmtName = job.format ?? 'landscape';
  const fmt = format(fmtName);
  check(Array.isArray(job.items) && job.items.length, 'job.items must list at least one item');
  const read = sourceReader(baseDir, remote);
  if (job.design?.cssFile !== undefined) check(typeof job.design.cssFile === 'string', 'design.cssFile must be a source');

  const names = new Set();
  const items = await Promise.all(job.items.map(async (it, i) => {
    const where = `items[${i}]`;
    check(typeof it.name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(it.name), `${where}.name must be a plain file-safe name`);
    check(!names.has(it.name), `${where}.name "${it.name}" is used twice`);
    names.add(it.name);
    check(typeof it.at === 'number' && it.at >= 0, `${where}.at must be the placement in composition seconds`);
    const type = it.type ?? (it.src ? 'broll' : 'graphic');
    if (type === 'broll') {
      check(typeof it.src === 'string', `${where}.src must name the clip`);
      check(typeof it.dur === 'number' && it.dur > 0, `${where}.dur must be the clip's length on the timeline`);
      return { ...it, type, in: it.in ?? 0, src: mediaPath(it.src, baseDir, remote, `${where}.src`) };
    }
    check(type === 'graphic', `${where}.type must be graphic or broll`);
    check(typeof it.dur === 'number' && it.dur > 0 && it.dur <= 300, `${where}.dur must be 0 to 300 seconds`);
    const scene = it.scene ?? {};
    check(typeof scene.code === 'string' || typeof scene.file === 'string', `${where}.scene must give code or a file`);
    check(!(remote && scene.file), `${where}.scene.file is not accepted remotely: send the code inline`);
    let code = scene.code ?? (await read(scene.file)).toString('utf8');
    if (scene.params) code = `const P = ${JSON.stringify(scene.params)};\n` + code;
    return { ...it, type, transparent: !!it.transparent, code };
  }));

  const design = await buildDesign(job.design ?? {}, read);
  // A var() that nothing defines draws as nothing or black, silently: name them.
  for (const it of items.filter((i) => i.type === 'graphic')) {
    const own = new Set([...it.code.matchAll(/--([A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
    const missing = [...new Set([...it.code.matchAll(/var\(\s*--([A-Za-z0-9_-]+)/g)].map((m) => m[1]))]
      .filter((v) => !design.variables.has(v) && !own.has(v));
    if (missing.length) design.warnings.push(`${it.name} uses ${missing.map((v) => `var(--${v})`).join(', ')}, which no token defines; check the names and the shape of design.tokens`);
  }
  const extra = [];
  for (const [name, src] of Object.entries(job.assets ?? {})) extra.push({ name, bytes: await read(src) });

  return {
    fmt, fmtName, design, items,
    warnings: design.warnings,
    assets: [...design.assets, ...extra],
    base: job.base ? mediaPath(job.base, baseDir, remote, 'base') : null,
  };
}

export async function readJobFile(path) {
  const abs = resolve(path);
  return prepareJob(JSON.parse(readFileSync(abs, 'utf8')), dirname(abs));
}
