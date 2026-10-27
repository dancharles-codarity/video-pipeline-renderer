// The HTTP face of the renderer: the same three operations, taking a job as
// JSON and giving back the files. Framework-free so it runs on Vercel or
// behind any Node server. Both api/render.js and the MCP endpoint use it.
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { prepareJob } from './job.js';
import { stills, preview, master } from './ops.js';
import { closeAll } from './browser.js';
import { freeMB, sweep, tmpReport, totalMB } from './serverless.js';

const OPS = { stills, preview, master };
const INLINE_LIMIT = 3.5 * 1024 * 1024; // under Vercel's 4.5 MB response cap once base64'd
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.png': 'image/png' };
// Stop a job before Vercel's 300 s limit kills it, so its cleanup always runs.
const BUDGET_S = Number(process.env.VPR_BUDGET_S ?? 270);
// Below this, Chromium cannot allocate its shared memory and crashes.
const MIN_FREE_MB = 120;

// One job at a time per instance: the serverless Chromium is single-process and
// /tmp is shared, so two at once compete for both.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

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

// The store's access, found on first use: a public store gives plain URLs, a
// private one presigned links that expire after LINK_DAYS.
let blobAccess = process.env.VPR_BLOB_ACCESS;

async function blobPut(pathname, body, contentType) {
  const blob = await import('@vercel/blob');
  const put = (access) => blob.put(pathname, body, { access, contentType, addRandomSuffix: false, allowOverwrite: true });
  if (!blobAccess) {
    try {
      const done = await put('public');
      blobAccess = 'public';
      return done;
    } catch (e) {
      if (!/private/i.test(e.message)) throw e;
      blobAccess = 'private';
    }
  }
  return put(blobAccess);
}

async function blobLink(put) {
  if (blobAccess !== 'private') return { url: put.url };
  const blob = await import('@vercel/blob');
  const signed = await blob.issueSignedToken({ pathname: put.pathname, operations: ['get'], validUntil: Date.now() + LINK_DAYS * 86400000 });
  const { presignedUrl } = await blob.presignUrl(signed, { operation: 'get', pathname: put.pathname, access: 'private' });
  return { url: presignedUrl, expires: new Date(signed.validUntil).toISOString() };
}

async function toBlob(files) {
  const run = randomUUID();
  const out = [];
  for (const f of files) {
    const put = await blobPut(`vpr/${run}/${basename(f)}`, readFileSync(f), MIME[f.slice(f.lastIndexOf('.'))]);
    out.push({ file: basename(f), bytes: statSync(f).size, ...(await blobLink(put)) });
  }
  return out;
}

// Background jobs: a full-res render can take longer than a client waits for
// one tool call, so it runs after the reply and its record is polled. Records
// live in the Blob store (any instance can read them) or, without one, in memory.
const memoryJobs = new Map();

async function saveJob(id, record) {
  if (!blobConfigured()) return void memoryJobs.set(id, record);
  await blobPut(`vpr/jobs/${id}.json`, JSON.stringify(record), 'application/json');
}

export async function loadJob(id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new HttpError(400, 'job_id is the id a background render returned');
  if (!blobConfigured()) return memoryJobs.get(id) ?? null;
  const blob = await import('@vercel/blob');
  for (const access of blobAccess ? [blobAccess] : ['private', 'public']) {
    try {
      const got = await blob.get(`vpr/jobs/${id}.json`, { access, useCache: false });
      if (got) { blobAccess ??= access; return JSON.parse(await new Response(got.stream).text()); }
    } catch (e) {
      if (!/private|public|access/i.test(e.message)) throw e;
    }
  }
  return null;
}

// Starts `body` in the background and returns its id at once. The job is
// checked first, so a bad job is refused now rather than found later.
export async function startJob(body, opts = {}) {
  try {
    await prepareJob(body?.job, null, { remote: true });
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  await saveJob(id, { status: 'running', op: body.op, startedAt });
  const work = handle(body, opts)
    .then((out) => saveJob(id, { status: 'done', op: body.op, startedAt, finishedAt: new Date().toISOString(), ...out }))
    .catch((e) => saveJob(id, { status: 'error', op: body.op, startedAt, error: e.message }));
  if (process.env.VERCEL) {
    const { waitUntil } = await import('@vercel/functions');
    waitUntil(work); // keeps the function alive after the reply, up to its duration limit
  }
  return { job_id: id, status: 'running', startedAt };
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
export function handle(body, opts = {}) {
  return exclusive(() => run(body, opts));
}

// `times` may arrive as an array, a JSON string or a comma list, depending on
// how current the caller's copy of the tool schema is.
function asTimes(v) {
  if (v == null || v === '') return undefined;
  let list = v;
  if (typeof v === 'string') {
    try { list = JSON.parse(v); } catch { list = v.split(','); }
  }
  if (!Array.isArray(list)) list = [list];
  const nums = list.map(Number);
  if (nums.some((n) => !Number.isFinite(n))) throw new HttpError(400, 'times must be a list of seconds, e.g. [0.2, 0.4]');
  return nums;
}

async function run(body, { links = false, inspect } = {}) {
  const { op, job, names = [], options = {} } = body ?? {};
  if (!OPS[op]) throw new HttpError(400, 'op must be stills, preview or master');
  let prepared;
  try {
    prepared = await prepareJob(job, null, { remote: true });
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  sweep();
  const free = freeMB();
  if (free !== null && free < MIN_FREE_MB) {
    const report = tmpReport();
    console.error('vpr: low /tmp', free, 'MB;', report);
    // Exiting does not help: the platform restarts the process on the same /tmp.
    throw new HttpError(503, `only ${free} MB free in /tmp after cleanup (needs ${MIN_FREE_MB}); this is a fault in the service, report this message. Diagnostics: ${report}`);
  }
  const outDir = mkdtempSync(join(tmpdir(), 'vpr-out-'));
  let timer;
  try {
    const { fps, scale, pad, reel, timecode } = options;
    const times = asTimes(options.times);
    const t0 = Date.now();
    // One film at a time: the serverless Chromium runs --single-process, so a
    // second film gains nothing and doubles peak memory (two full-res films
    // at once crashed it on Vercel).
    const work = OPS[op](prepared, { names, outDir, fps, scale, pad, reel, timecode, times, concurrency: 1 });
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, `stopped after ${BUDGET_S} s; render fewer items per call`)), BUDGET_S * 1000);
    });
    work.catch(() => {}); // once timed out, its own rejection is expected
    let result;
    try {
      result = await Promise.race([work, late]);
    } catch (e) {
      await closeAll(); // never leave a browser running on the instance
      if (/Target page, context or browser has been closed/.test(e.message)) {
        throw new HttpError(500, `the browser crashed (${freeMB()} MB free in /tmp); try again, and if it repeats, report this message`);
      }
      throw e;
    }
    const files = await deliver(outputs(op, result), op, { links });
    const extra = inspect ? await inspect(op, result) : undefined;
    const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (['file', 'sheet', 'reviews', 'reel'].includes(k) ? undefined : v)));
    return { op, ms: Date.now() - t0, tmpFreeMB: freeMB(), warnings: prepared.warnings ?? [], result: strip(result), files, ...(extra ? { extra } : {}) };
  } finally {
    clearTimeout(timer);
    rmSync(outDir, { recursive: true, force: true });
    // Clear up after the job too, so the next caller starts from a clean /tmp.
    await closeAll();
    sweep();
    if (process.env.VERCEL) console.log(`vpr: /tmp ${freeMB()} of ${totalMB()} MB free after ${op}; ${tmpReport()}`);
  }
}
