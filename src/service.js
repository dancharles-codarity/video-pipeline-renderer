// The HTTP face of the renderer: the same three operations, taking a job as
// JSON and giving back the files. Framework-free so it runs on Vercel or
// behind any Node server.
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { prepareJob } from './job.js';
import { stills, preview, master } from './ops.js';

const OPS = { stills, preview, master };
const INLINE_LIMIT = 3.5 * 1024 * 1024; // under Vercel's 4.5 MB response cap once base64'd
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png' };

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function authorised(header, token = process.env.VPR_TOKEN) {
  if (!token) return false; // no token configured: refuse everything rather than run open
  const got = Buffer.from(String(header ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

// The files a result points at, in the order a reviewer wants them.
function outputs(op, result) {
  if (op === 'preview') return [...result.previews.map((p) => p.file), ...(result.reel ? [result.reel] : [])];
  if (op === 'stills') return result.flatMap((r) => [r.sheet, ...r.reviews]);
  return result.map((r) => r.file);
}

async function deliver(files, op) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const run = randomUUID();
    return Promise.all(files.map(async (f) => {
      const ext = f.slice(f.lastIndexOf('.'));
      const blob = await put(`vpr/${run}/${basename(f)}`, readFileSync(f), { access: 'public', contentType: MIME[ext], addRandomSuffix: false });
      return { file: basename(f), url: blob.url, bytes: statSync(f).size };
    }));
  }
  const total = files.reduce((n, f) => n + statSync(f).size, 0);
  if (total > INLINE_LIMIT) throw new HttpError(413, `${op} output is ${(total / 1048576).toFixed(1)} MB; configure Blob storage (BLOB_READ_WRITE_TOKEN) or ask for fewer items`);
  return files.map((f) => ({ file: basename(f), mime: MIME[f.slice(f.lastIndexOf('.'))], base64: readFileSync(f).toString('base64') }));
}

// body: {op, job, names?, options?: {fps, scale, pad, reel, timecode}}
export async function handle(body) {
  const { op, job, names = [], options = {} } = body ?? {};
  if (!OPS[op]) throw new HttpError(400, 'op must be stills, preview or master');
  let prepared;
  try {
    prepared = await prepareJob(job, null, { remote: true });
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const outDir = mkdtempSync(join(tmpdir(), 'vpr-out-'));
  try {
    const { fps, scale, pad, reel, timecode } = options;
    const t0 = Date.now();
    const result = await OPS[op](prepared, { names, outDir, fps, scale, pad, reel, timecode, concurrency: 2 });
    const files = await deliver(outputs(op, result), op);
    const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (['file', 'sheet', 'reviews', 'reel'].includes(k) ? undefined : v)));
    return { op, ms: Date.now() - t0, result: strip(result), files };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}
