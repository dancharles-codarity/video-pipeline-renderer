#!/usr/bin/env node
// vpr: the video pipeline renderer CLI.
//
//   vpr stills  <job.json> [names...]   full-res frames at fixed fractions, over the real frame
//   vpr preview <job.json> [names...]   low-res, low-fps clips over the real footage, with audio
//   vpr master  <job.json> [names...]   the full-res file of a graphic, for placing in Descript
//
// Options: --out <dir> (default: out/ beside the job), --fps, --scale, --pad (preview),
// --reel (preview: also join the clips into one), --no-timecode, --concurrency <n>, --json (print the result),
// --remote <url> (run on the deployed service; needs VPR_TOKEN, and URLs for footage).
import { dirname, join, resolve } from 'node:path';
import { readJobFile } from '../src/job.js';
import { stills, preview, master } from '../src/ops.js';
import { runRemote } from '../src/remote.js';

const USAGE = `usage: vpr <stills|preview|master> <job.json> [names...] [--out dir] [--fps n] [--scale x] [--pad s] [--reel] [--no-timecode] [--concurrency n] [--json] [--remote https://service]`;

function parse(argv) {
  const opts = { names: [] };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--out') opts.outDir = resolve(val());
    else if (a === '--fps') opts.fps = Number(val());
    else if (a === '--scale') opts.scale = Number(val());
    else if (a === '--pad') opts.pad = Number(val());
    else if (a === '--concurrency') opts.concurrency = Number(val());
    else if (a === '--reel') opts.reel = true;
    else if (a === '--no-timecode') opts.timecode = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--remote') opts.remote = val();
    else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else pos.push(a);
  }
  const [cmd, jobPath, ...names] = pos;
  return { cmd, jobPath, opts: { ...opts, names } };
}

const OPS = { stills, preview, master };

try {
  const { cmd, jobPath, opts } = parse(process.argv.slice(2));
  if (!OPS[cmd] || !jobPath) { console.error(USAGE); process.exit(2); }
  opts.outDir ??= join(dirname(resolve(jobPath)), 'out');
  const t0 = Date.now();
  const log = opts.json ? () => {} : (m) => console.log(m);
  const result = opts.remote
    ? await runRemote(opts.remote, cmd, jobPath, { ...opts, log })
    : await OPS[cmd](await readJobFile(jobPath), { ...opts, log });
  const problems = (Array.isArray(result) ? result : []).flatMap((r) => (r.problems ?? []).map((p) => `${r.name}: ${p}`));
  for (const p of problems) console.error('scene ' + p);
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  console.error('vpr: ' + (e?.message ?? e));
  process.exit(1);
}
