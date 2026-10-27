// Sends a local job file to the deployed service and saves what comes back.
// Local design files (tokens, fonts, stylesheet, assets) and scene files are
// inlined; base footage and B-roll must already be URLs (host them on Bunny),
// because the service cannot read local paths.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { mimeOf } from './film.js';

const isRemote = (s) => /^(https?:\/\/|data:)/i.test(s);

function inlineJob(job, dir) {
  const path = (p) => (isAbsolute(p) ? p : join(dir, p));
  const dataUri = (p) => `data:${mimeOf(p)};base64,${readFileSync(path(p)).toString('base64')}`;
  const d = job.design ? { ...job.design } : null;
  if (d) {
    if (typeof d.tokens === 'string' && !isRemote(d.tokens)) d.tokens = JSON.parse(readFileSync(path(d.tokens), 'utf8'));
    if (d.fontBase && !isRemote(d.fontBase) && d.tokens && typeof d.tokens === 'object') {
      d.files = { ...d.files };
      for (const f of d.tokens.type?.fonts ?? []) {
        const p = join(path(d.fontBase), f.file);
        if (!d.files[f.file] && existsSync(p)) d.files[f.file] = dataUri(p);
      }
      delete d.fontBase;
    }
    for (const [k, v] of Object.entries(d.files ?? {})) if (!isRemote(v)) d.files[k] = dataUri(v);
    d.fonts = (d.fonts ?? []).map((f) => (isRemote(f.src) ? f : { ...f, name: f.name ?? f.src, src: dataUri(f.src) }));
    if (d.cssFile && !isRemote(d.cssFile)) { d.css = readFileSync(path(d.cssFile), 'utf8') + '\n' + (d.css ?? ''); delete d.cssFile; }
    d.assets = Object.fromEntries(Object.entries(d.assets ?? {}).map(([k, v]) => [k, isRemote(v) ? v : dataUri(v)]));
  }
  const assets = Object.fromEntries(Object.entries(job.assets ?? {}).map(([k, v]) => [k, isRemote(v) ? v : dataUri(v)]));
  const items = (job.items ?? []).map((it) => {
    if (!it.scene?.file) return it;
    const { file, ...rest } = it.scene;
    return { ...it, scene: { ...rest, code: readFileSync(path(file), 'utf8') } };
  });
  return { ...job, ...(d ? { design: d } : {}), assets, items };
}

export async function runRemote(service, op, jobPath, { names, outDir, fps, scale, pad, reel, timecode, log = () => {} }) {
  const token = process.env.VPR_TOKEN;
  if (!token) throw new Error('set VPR_TOKEN to call the service');
  const abs = resolve(jobPath);
  const job = inlineJob(JSON.parse(readFileSync(abs, 'utf8')), dirname(abs));
  const url = service.replace(/\/+$/, '') + '/api/render';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ op, job, names, options: { fps, scale, pad, reel, timecode } }),
  });
  const body = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(`service: ${body.error ?? r.status}`);
  mkdirSync(outDir, { recursive: true });
  for (const f of body.files) {
    const dest = join(outDir, f.file);
    if (f.base64) writeFileSync(dest, Buffer.from(f.base64, 'base64'));
    else writeFileSync(dest, Buffer.from(await (await fetch(f.url)).arrayBuffer()));
    log(`${f.file}${f.url ? ' ' + f.url : ''} -> ${dest}`);
  }
  return body;
}

