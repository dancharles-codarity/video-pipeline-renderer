// The HTTP face of the renderer: the same three operations, taking a job as
// JSON and giving back the files. Framework-free so it runs on Vercel or
// behind any Node server. Both api/render.js and the MCP endpoint use it.
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { prepareJob } from './job.js';
import { stills, preview, master } from './ops.js';

const OPS = { stills, preview, master };
const INLINE_LIMIT = 3.5 * 1024 * 1024; // under Vercel's 4.5 MB response cap once base64'd
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png' };
// How long a link to a file in a private Blob store stays valid.
const LINK_DAYS = Number(process.env.VPR_LINK_DAYS ?? 7);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// The caller's token: an Authorization header (CLI, Claude Code) or a `token`
// query parameter (custom connectors, which cannot send headers).
export function tokenFrom(req) {
  const header = String(req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (header) return header;
  const q = req.query?.token ?? new URL(req.url ?? '/', 'http://x').searchParams.get('token');
  return typeof q === 'string' ? q : '';
}

export function authorised(given, token = process.env.VPR_TOKEN) {
  if (!token) return false; // no token configured: refuse everything rather than run open
  const got = Buffer.from(String(given ?? '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

// The files a result points at, in the order a reviewer wants them.
function outputs(op, result) {
  if (op === 'preview') return [...result.previews.map((p) => p.file), ...(result.reel ? [result.reel] : [])];
  if (op === 'stills') return result.flatMap((r) => [r.sheet, ...r.reviews]);
  return result.map((r) => r.file);
}

// Uploads to the project's Blob store. A public store gives plain URLs; a
// private store gives presigned links that expire after LINK_DAYS.
async function toBlob(files) {
  const blob = await import('@vercel/blob');
  const run = randomUUID();
  let access = process.env.VPR_BLOB_ACCESS;
  const upload = async (f, how) => blob.put(`vpr/${run}/${basename(f)}`, readFileSync(f), {
    access: how, contentType: MIME[f.slice(f.lastIndexOf('.'))], addRandomSuffix: false,
  });
  const out = [];
  for (const f of files) {
    let put;
    if (!access) {
      try {
        put = await upload(f, 'public');
        access = 'public';
      } catch (e) {
        if (!/private/i.test(e.message)) throw e;
        access = 'private';
      }
    }
    put ??= await upload(f, access);
    let url = put.url;
    let expires;
    if (access === 'private') {
      const validUntil = Date.now() + LINK_DAYS * 86400000;
      const signed = await blob.issueSignedToken({ pathname: put.pathname, operations: ['get'], validUntil });
      url = (await blob.presignUrl(signed, { operation: 'get', pathname: put.pathname, access: 'private' })).presignedUrl;
      expires = new Date(signed.validUntil).toISOString();
    }
    out.push({ file: basename(f), url, bytes: statSync(f).size, ...(expires ? { expires } : {}) });
  }
  return out;
}

async function deliver(files, op, { links }) {
  if (blobConfigured()) return toBlob(files);
  if (links) throw new HttpError(503, 'this endpoint returns links, but no Blob store is connected to the project');
  const total = files.reduce((n, f) => n + statSync(f).size, 0);
  if (total > INLINE_LIMIT) throw new HttpError(413, `${op} output is ${(total / 1048576).toFixed(1)} MB; connect a Blob store or ask for fewer items`);
  return files.map((f) => ({ file: basename(f), mime: MIME[f.slice(f.lastIndexOf('.'))], base64: readFileSync(f).toString('base64') }));
}

// body: {op, job, names?, options?: {fps, scale, pad, reel, timecode}}
// links: require URLs rather than inline files. inspect(op, result): extra data
// computed from the output files before they are removed.
export async function handle(body, { links = false, inspect } = {}) {
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
    const files = await deliver(outputs(op, result), op, { links });
    const extra = inspect ? await inspect(op, result) : undefined;
    const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (['file', 'sheet', 'reviews', 'reel'].includes(k) ? undefined : v)));
    return { op, ms: Date.now() - t0, result: strip(result), files, ...(extra ? { extra } : {}) };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}
