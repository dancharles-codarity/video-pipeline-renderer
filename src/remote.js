// Sends a local job file to the deployed service and saves what comes back.
// Scene files are inlined; base footage and B-roll must already be URLs
// (Bunny, a Descript publish), because the service cannot read local paths.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export async function runRemote(service, op, jobPath, { names, outDir, fps, scale, pad, reel, timecode, log = () => {} }) {
  const token = process.env.VPR_TOKEN;
  if (!token) throw new Error('set VPR_TOKEN to call the service');
  const abs = resolve(jobPath);
  const job = JSON.parse(readFileSync(abs, 'utf8'));
  for (const it of job.items ?? []) {
    if (it.scene?.file) {
      const { file, ...rest } = it.scene;
      it.scene = { ...rest, code: readFileSync(join(dirname(abs), file), 'utf8') };
    }
  }
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
