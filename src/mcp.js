// MCP over Streamable HTTP, stateless: every POST carries one JSON-RPC message
// (or a batch) and gets a JSON reply. Enough for claude.ai and Cowork custom
// connectors, with no session store to keep on a serverless function.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, HttpError, loadJob, startJob } from './service.js';
import { ffmpeg } from './ffmpeg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// The job format, from the README so there is one source of truth.
export function jobReference() {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const from = readme.indexOf('## Client-neutral by design');
  const to = readme.indexOf('## CLI');
  return readme.slice(from, to).trim();
}

const INSTRUCTIONS = `Cheap previews of motion graphics and B-roll over a client's real footage, before anything is placed in Descript. Descript renders the finished video; this never does.

Order of use, cheapest first: render_stills (layout, type, text over the face, caption clearance), then render_preview (does the reveal land on the right word, does the B-roll sit right), then render_master only once a graphic is approved, for the file that gets placed. render_master runs in the background: it returns a job_id, and get_render returns the links when it is done.

Each call takes a job: the format, the client's design system (tokens.json from their Design System artifact, fonts, motion CSS, logos), the footage URL on Bunny, and the items with their composition-time placements. Call get_job_reference once before writing a first job. Nothing about any client is stored here: every job brings its own design system. Footage and assets must be URLs (Bunny) or data: URIs; scene code goes inline.

A scene builds its DOM once in init(kit) with kit.stage.append(...) and only changes styles from t in render(t, kit); what render returns is ignored, so returning HTML gives blank frames. get_job_reference has a working example.`;

const JOB = {
  type: 'object',
  description: 'The job: format, design system, footage and items. get_job_reference has the full format.',
  properties: {
    format: { type: 'string', enum: ['landscape', 'vertical'], description: 'landscape 1920x1080 or vertical 1080x1920, both 30 fps.' },
    design: {
      type: 'object',
      description: "The client's design system. tokens: tokens.json from their Design System artifact (object or URL). theme: which theme to resolve (default the first). files: {'fonts/x.otf': 'data:font/otf;base64,...' or URL} for the font files tokens.type.fonts names, or fontBase: a URL folder they resolve against. css: inline motion CSS from the client's design file. assets: {'logo-white.png': 'https://...b-cdn.net/...'}. ground: stage colour behind full-frame cards (default the bg-page token).",
      properties: {
        tokens: { type: ['object', 'string'] },
        theme: { type: 'string' },
        files: { type: 'object', additionalProperties: { type: 'string' } },
        fontBase: { type: 'string' },
        fonts: { type: 'array', items: { type: 'object' } },
        css: { type: 'string' },
        cssFile: { type: 'string' },
        assets: { type: 'object', additionalProperties: { type: 'string' } },
        ground: { type: 'string' },
      },
    },
    base: { type: 'string', description: 'URL of the footage to preview over: the latest published render or raw footage, on Bunny. Item placements are seconds into this file.' },
    assets: { type: 'object', additionalProperties: { type: 'string' }, description: 'Per-video images or fonts by name, as URLs or data: URIs.' },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['name', 'at', 'dur'],
        properties: {
          name: { type: 'string', description: 'File-safe name, unique in the job.' },
          type: { type: 'string', enum: ['graphic', 'broll'], description: 'Default graphic.' },
          at: { type: 'number', description: 'Placement in composition seconds.' },
          dur: { type: 'number', description: 'Length on the timeline in seconds.' },
          transparent: { type: 'boolean', description: 'Graphic: overlay with alpha rather than a full-frame card.' },
          scene: { type: 'object', description: "Graphic: {code, params?}. One Motion scene with id 'g', a pure function of t; params readable as P.", properties: { code: { type: 'string' }, params: { type: 'object' } } },
          src: { type: 'string', description: 'B-roll: clip URL.' },
          in: { type: 'number', description: 'B-roll: offset into the clip in seconds.' },
          z: { type: 'number', description: 'Paint order in previews, higher on top.' },
          helpers: { type: 'boolean', description: 'Graphic: false leaves out the prepended helpers (rise, slide, fade, bar, Q, seg, eo, ei, eob, lerp).' },
        },
      },
    },
  },
  required: ['items'],
};

const NAMES = { type: 'array', items: { type: 'string' }, description: 'Items to render; all when omitted.' };

const TOOLS = [
  {
    name: 'get_job_reference',
    description: 'The job format in full: the design block, every field, scene conventions, and where each client source lives. Read once before writing a first job.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'render_stills',
    description: "Full-resolution stills of each graphic at fixed fractions of its duration, composited over the real frame at its placement when base is given, with the caption zone outlined on vertical. Returns links and the contact sheets as images to look at. About a second per graphic.",
    inputSchema: {
      type: 'object',
      properties: {
        job: JOB, names: NAMES,
        times: { type: 'array', items: { type: 'number' }, description: 'Seconds into each item to take stills at, instead of the fixed fractions; e.g. [0.2, 0.4] to check an entrance.' },
      },
      required: ['job'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'render_preview',
    description: "Low-res, low-fps clip of the window around each named item over the real footage with its audio and the composition timecode, neighbouring items included. Returns links to the MP4s and a strip of frames from each to look at. Seconds per item.",
    inputSchema: {
      type: 'object',
      properties: {
        job: JOB, names: NAMES,
        fps: { type: 'number', description: 'Default 12.' },
        scale: { type: 'number', description: 'Default 0.5 (960x540 or 540x960).' },
        pad: { type: 'number', description: 'Seconds of footage either side, default 1.' },
        reel: { type: 'boolean', description: 'Also join the clips into one reel.' },
        timecode: { type: 'boolean', description: 'Burn in the composition timecode, default true.' },
      },
      required: ['job'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'render_master',
    description: 'Starts the full-resolution, full-fps render of each named graphic, for placing in Descript: qtrle/argb .mov for transparent overlays, libx264 .mp4 for full-frame cards. Only once the graphic is approved. It runs in the background (about 10 s per second of graphic) and returns a job_id at once; call get_render with it for the links.',
    inputSchema: { type: 'object', properties: { job: JOB, names: NAMES }, required: ['job'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'get_render',
    description: 'The state of a background render started by render_master: running (with how long it has run), done (with the links), or failed (with the reason). Call it again while it is running.',
    inputSchema: { type: 'object', properties: { job_id: { type: 'string', description: 'The job_id render_master returned.' } }, required: ['job_id'] },
    annotations: { readOnlyHint: true },
  },
];

// Full-res frames take about a third of a second each on the service.
const SECONDS_PER_FRAME = 0.35;

function estimateSeconds(job, names) {
  const items = (job?.items ?? []).filter((i) => (i.type ?? (i.src ? 'broll' : 'graphic')) === 'graphic' && (!names?.length || names.includes(i.name)));
  return Math.round(10 + items.reduce((n, i) => n + (Number(i.dur) || 0) * 30 * SECONDS_PER_FRAME, 0));
}

// The text and images an agent gets for a finished render.
function resultContent(out) {
  const summary = { op: out.op, seconds: Math.round(out.ms / 100) / 10, tmpFreeMB: out.tmpFreeMB, result: out.result, files: out.files };
  const items = Array.isArray(out.result) ? out.result : [];
  const notes = [...(out.warnings ?? []).map((w) => `design: ${w}`),
    ...items.flatMap((r) => [...(r.warnings ?? []), ...(r.problems ?? [])].map((w) => `${r.name}: ${w}`))];
  const content = [];
  if (notes.length) content.push({ type: 'text', text: 'Check before going on:\n' + notes.map((n) => '- ' + n).join('\n') });
  content.push({ type: 'text', text: JSON.stringify(summary, null, 2) });
  for (const img of out.extra ?? []) {
    content.push({ type: 'text', text: out.op === 'stills' ? `Contact sheet: ${img.name}` : `Frames early, midway and late in the item: ${img.name}` });
    content.push({ type: 'image', data: img.png, mimeType: 'image/png' });
  }
  return content;
}

async function getRender(jobId) {
  const rec = await loadJob(jobId);
  if (!rec) return { isError: true, content: [{ type: 'text', text: `no render with job_id ${jobId}` }] };
  const ran = Math.round((Date.now() - Date.parse(rec.startedAt)) / 1000);
  if (rec.status === 'running') {
    // The function's duration limit is 300 s; past that the render cannot still be going.
    if (ran > 320) return { isError: true, content: [{ type: 'text', text: `render ${jobId} stopped without finishing (${ran} s since it started); start it again with fewer items` }] };
    return { content: [{ type: 'text', text: `still rendering, ${ran} s so far; call get_render again shortly` }] };
  }
  if (rec.status === 'error') return { isError: true, content: [{ type: 'text', text: `render failed: ${rec.error}` }] };
  return { content: resultContent(rec) };
}

const png64 = (f) => readFileSync(f).toString('base64');

// Images the agent can look at before reading any link.
export async function inspect(op, result) {
  if (op === 'stills') return result.map((r) => ({ name: r.name, png: png64(r.sheet) }));
  if (op === 'preview') {
    return Promise.all(result.previews.map(async (p) => {
      const strip = p.file.replace(/\.mp4$/, '-strip.png');
      // Sample the item itself, not the padded window: early (inside a typical entrance), middle, late.
      const off = p.at - p.start, edge = Math.min(0.3, p.dur * 0.1);
      const at = [off + edge, off + p.dur / 2, off + p.dur - edge].map((t) => t.toFixed(3));
      const ins = at.flatMap((t) => ['-ss', t, '-i', p.file]);
      await ffmpeg([...ins, '-filter_complex', at.map((_, i) => `[${i}:v]scale=480:-2[s${i}]`).join(';') + ';' + at.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${at.length}[o]`, '-map', '[o]', '-frames:v', '1', strip]);
      return { name: p.name, png: png64(strip) };
    }));
  }
  return undefined;
}

async function callTool(name, args = {}) {
  if (name === 'get_job_reference') return { content: [{ type: 'text', text: jobReference() }] };
  if (name === 'get_render') return getRender(args.job_id);
  const op = { render_stills: 'stills', render_preview: 'preview', render_master: 'master' }[name];
  if (!op) throw Object.assign(new Error(`unknown tool ${name}`), { rpc: -32602 });
  const { job, names, fps, scale, pad, reel, timecode, times } = args;
  const body = { op, job, names, options: { fps, scale, pad, reel, timecode, times } };
  try {
    if (op === 'master') {
      const started = await startJob(body, { links: true });
      const eta = estimateSeconds(job, names);
      return { content: [{ type: 'text', text: JSON.stringify({ ...started, estimatedSeconds: eta, next: `call get_render with this job_id in about ${eta} s` }, null, 2) }] };
    }
    const out = await handle(body, { links: true, inspect });
    return { content: resultContent({ op, ...out }) };
  } catch (e) {
    // A failed render is a result the model should read, not a protocol error.
    return { isError: true, content: [{ type: 'text', text: e instanceof HttpError ? e.message : `render failed: ${e.message}` }] };
  }
}

async function dispatch(msg) {
  const { id, method, params } = msg ?? {};
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof method !== 'string') return fail(-32600, 'invalid request');
  const notification = id === undefined;
  try {
    switch (method) {
      case 'initialize': {
        const asked = params?.protocolVersion;
        return reply({
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'video-pipeline-renderer', version: VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS });
      case 'tools/call': return reply(await callTool(params?.name, params?.arguments));
      default:
        if (notification || method.startsWith('notifications/')) return null;
        return fail(-32601, `method not found: ${method}`);
    }
  } catch (e) {
    return fail(e.rpc ?? -32603, e.message);
  }
}

// body: a parsed JSON-RPC message or batch. Returns {status, json}.
export async function mcp(body) {
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map(dispatch))).filter(Boolean);
    return replies.length ? { status: 200, json: replies } : { status: 202 };
  }
  const r = await dispatch(body);
  return r ? { status: 200, json: r } : { status: 202 };
}
