// The three things the renderer does, cheapest first.
//
//   stills   a few full-resolution frames per graphic at fixed fractions of its
//            duration, composited over the real frame when footage is given.
//   preview  a low-res, low-fps clip of a window around each item, laid over
//            the real footage with its audio. The check that a reveal lands on
//            the right word, before anything is placed in Descript.
//   master   the full-resolution, full-fps file of one graphic, the asset that
//            gets placed. Descript renders the video itself; this is never that.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from './browser.js';
import { buildFilm } from './film.js';
import { PREVIEW_DEFAULTS } from './formats.js';
import { ffmpeg, hasAudio, pngPipe, PNG_IN, MASTER_CODEC } from './ffmpeg.js';

const TIMECODE_FONT = readFileSync(fileURLToPath(new URL('../assets/timecode.ttf', import.meta.url)));

// 254.2 -> "04:14.200", the way a note about the timeline would quote it.
export function timecode(sec) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (h ? h + ':' : '') + p(m) + ':' + p(s) + '.' + p(ms % 1000, 3);
}
const even = (x) => Math.max(2, Math.round(x / 2) * 2);
const r3 = (x) => Math.round(x * 1000) / 1000;

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

function select(job, names, type) {
  const pool = type ? job.items.filter((i) => i.type === type) : job.items;
  if (!names?.length) return pool;
  const missing = names.filter((n) => !job.items.some((i) => i.name === n));
  if (missing.length) throw new Error(`no item named ${missing.join(', ')}`);
  return pool.filter((i) => names.includes(i.name));
}

async function withFilm(renderer, job, item, fn) {
  const film = await renderer.load(buildFilm(item, item.code, job.fmt, job.brand, job.assets), job.fmt);
  try {
    const result = await fn(film);
    const problems = await film.problems();
    return { ...result, problems };
  } finally {
    await film.close();
  }
}

// Stills

export async function stills(job, { names, outDir, concurrency = 3, log = () => {} } = {}) {
  const items = select(job, names, 'graphic');
  if (!items.length) throw new Error('stills need at least one graphic');
  mkdirSync(outDir, { recursive: true });
  const { width: W, height: H, captionZone } = job.fmt;
  const renderer = await Renderer.open();
  try {
    return await mapLimit(items, concurrency, (item) => withFilm(renderer, job, item, async (film) => {
      const times = job.fmt.stills.map((f) => Math.round(item.dur * f * 100) / 100);
      const reviews = [];
      for (const t of times) {
        const raw = join(outDir, `still-${item.name}-t_${t.toFixed(2)}.png`);
        writeFileSync(raw, await film.frame(t, 1));
        const review = join(outDir, `review-${item.name}-t_${t.toFixed(2)}.png`);
        const chain = [];
        const args = [];
        if (job.base) {
          // The real frame at the moment this still will sit over: catches text over the face.
          args.push('-ss', r3(item.at + t).toFixed(3), '-i', job.base, '-i', raw);
          chain.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[b]`, '[b][1:v]overlay=0:0[c]');
        } else {
          args.push('-i', raw);
          chain.push('[0:v]null[c]');
        }
        if (captionZone) chain.push(`[c]drawbox=x=0:y=${captionZone.y0}:w=${W}:h=${captionZone.y1 - captionZone.y0}:color=red@0.9:t=6[c2]`);
        else chain.push('[c]null[c2]');
        await ffmpeg([...args, '-filter_complex', chain.join(';'), '-map', '[c2]', '-frames:v', '1', review]);
        reviews.push(review);
      }
      const sheet = join(outDir, `sheet-${item.name}.png`);
      const tw = W >= H ? 640 : 360;
      const ins = reviews.flatMap((r) => ['-i', r]);
      const scaled = reviews.map((_, i) => `[${i}:v]scale=${tw}:-2[s${i}]`).join(';');
      const stack = reviews.map((_, i) => `[s${i}]`).join('') + `hstack=inputs=${reviews.length}[o]`;
      await ffmpeg([...ins, '-filter_complex', `${scaled};${stack}`, '-map', '[o]', '-frames:v', '1', sheet]);
      log(`${item.name}: ${times.length} stills, sheet ${sheet}`);
      return { name: item.name, times, sheet, reviews };
    }));
  } finally {
    await renderer.close();
  }
}

// Master

export async function master(job, { names, outDir, concurrency = 3, log = () => {} } = {}) {
  const items = select(job, names, 'graphic');
  if (!items.length) throw new Error('master needs at least one graphic');
  mkdirSync(outDir, { recursive: true });
  const fps = job.fmt.fps;
  const renderer = await Renderer.open();
  try {
    return await mapLimit(items, concurrency, (item) => withFilm(renderer, job, item, async (film) => {
      const t0 = Date.now();
      const n = Math.round(item.dur * fps);
      const codec = item.transparent ? MASTER_CODEC.transparent : MASTER_CODEC.opaque;
      const out = join(outDir, `${item.name}.${codec.ext}`);
      let count = 0;
      await ffmpeg([...PNG_IN(fps), '-r', String(fps), ...codec.args, out], {
        input: pngPipe(async function* () { for (let i = 0; i < n; i++) { count++; yield film.frame(i / fps, 1); } }),
      });
      if (count !== n) throw new Error(`${item.name}: frame mismatch ${count}/${n}`);
      const ms = Date.now() - t0;
      log(`${item.name}: ${n} frames -> ${out} in ${(ms / 1000).toFixed(1)}s`);
      return { name: item.name, file: out, frames: n, ms };
    }));
  } finally {
    await renderer.close();
  }
}

// Preview

// Renders each graphic once, at preview size and fps, as a small transparent overlay.
async function previewOverlays(job, graphics, windows, { fps, scale, tmp, concurrency, timecode: tc, W, H }) {
  const renderer = await Renderer.open();
  try {
    const timecodes = new Map();
    if (tc) {
      const size = Math.max(14, Math.round(H / 27));
      for (const w of windows) {
        const n = Math.round(w.len * fps);
        const file = join(tmp, `tc-${w.target.name}.mov`);
        const texts = Array.from({ length: n }, (_, i) => timecode(w.start + i / fps));
        await ffmpeg([...PNG_IN(fps), '-r', String(fps), '-c:v', 'qtrle', '-pix_fmt', 'argb', file], {
          input: pngPipe(() => renderer.labels(texts, { width: W, height: H, size, font: TIMECODE_FONT })),
        });
        timecodes.set(w.target.name, file);
      }
    }
    const done = await mapLimit(graphics, concurrency, (item) => withFilm(renderer, job, item, async (film) => {
      const n = Math.round(item.dur * fps);
      const file = join(tmp, `ov-${item.name}.mov`);
      await ffmpeg([...PNG_IN(fps), '-r', String(fps), '-c:v', 'qtrle', '-pix_fmt', 'argb', file], {
        input: pngPipe(async function* () { for (let i = 0; i < n; i++) yield film.frame(i / fps, scale); }),
      });
      return { name: item.name, file };
    }));
    return { graphics: new Map(done.map((d) => [d.name, d])), timecodes };
  } finally {
    await renderer.close();
  }
}

export async function preview(job, { names, outDir, fps, scale, pad, reel = false, timecode = true, concurrency = 3, log = () => {} } = {}) {
  fps = fps ?? PREVIEW_DEFAULTS.fps;
  scale = scale ?? PREVIEW_DEFAULTS.scale;
  pad = pad ?? PREVIEW_DEFAULTS.pad;
  const targets = select(job, names);
  mkdirSync(outDir, { recursive: true });
  const W = even(job.fmt.width * scale), H = even(job.fmt.height * scale);
  const tmp = mkdtempSync(join(tmpdir(), 'vpr-'));
  const audio = job.base ? await hasAudio(job.base) : false;

  // Each window shows every item that overlaps it, so neighbours land as they will.
  const windows = targets.map((t) => {
    const start = Math.max(0, t.at - pad);
    const end = t.at + t.dur + pad;
    // Paint order: z first (higher on top, default 0), then placement time.
    const layers = job.items.filter((i) => i.at < end && i.at + i.dur > start)
      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || a.at - b.at);
    return { target: t, start, len: end - start, layers };
  });
  const needed = [...new Set(windows.flatMap((w) => w.layers).filter((i) => i.type === 'graphic'))];

  try {
    const t0 = Date.now();
    const { graphics: overlays, timecodes } = await previewOverlays(job, needed, windows, { fps, scale, tmp, concurrency, timecode, W, H });
    const tRender = Date.now() - t0;
    const results = [];
    for (const w of windows) {
      const args = [];
      if (job.base) args.push('-ss', r3(w.start).toFixed(3), '-t', r3(w.len).toFixed(3), '-i', job.base);
      else args.push('-f', 'lavfi', '-t', r3(w.len).toFixed(3), '-i', `color=c=0x2a2a2a:s=${W}x${H}:r=${fps}`);
      const chain = [`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}[v0]`];
      let cur = 'v0';
      w.layers.forEach((layer, k) => {
        const idx = k + 1;
        const off = layer.at - w.start;
        const skip = Math.max(0, -off);
        if (layer.type === 'graphic') {
          if (skip) args.push('-ss', r3(skip).toFixed(3));
          if (off > 0) args.push('-itsoffset', r3(off).toFixed(3));
          args.push('-i', overlays.get(layer.name).file);
          chain.push(`[${idx}:v]setsar=1[o${k}]`);
        } else {
          args.push('-ss', r3(layer.in + skip).toFixed(3), '-t', r3(layer.dur - skip).toFixed(3));
          if (off > 0) args.push('-itsoffset', r3(off).toFixed(3));
          args.push('-i', layer.src);
          chain.push(`[${idx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${fps}[o${k}]`);
        }
        chain.push(`[${cur}][o${k}]overlay=0:0:eof_action=pass[v${k + 1}]`);
        cur = `v${k + 1}`;
      });
      if (timecode) {
        // Composition time in the corner, so a note can say exactly where.
        const idx = w.layers.length + 1;
        args.push('-i', timecodes.get(w.target.name));
        chain.push(`[${cur}][${idx}:v]overlay=0:0:eof_action=pass[tc]`);
        cur = 'tc';
      }
      const out = join(outDir, `preview-${w.target.name}.mp4`);
      await ffmpeg([...args, '-filter_complex', chain.join(';'), '-map', `[${cur}]`,
        ...(audio ? ['-map', '0:a', '-c:a', 'aac', '-b:a', '96k'] : []),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(PREVIEW_DEFAULTS.crf), '-pix_fmt', 'yuv420p',
        '-t', r3(w.len).toFixed(3), '-movflags', '+faststart', out]);
      log(`${w.target.name}: ${r3(w.start)}s to ${r3(w.start + w.len)}s, ${w.layers.length} layer(s) -> ${out}`);
      results.push({ name: w.target.name, file: out, start: r3(w.start), end: r3(w.start + w.len), layers: w.layers.map((l) => l.name) });
    }
    let reelFile = null;
    if (reel && results.length > 1) {
      reelFile = join(outDir, 'preview-reel.mp4');
      const list = join(tmp, 'reel.txt');
      writeFileSync(list, results.map((r) => `file '${r.file.replace(/'/g, "'\\''")}'\n`).join(''));
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', reelFile]);
      log(`reel -> ${reelFile}`);
    }
    return { previews: results, reel: reelFile, renderMs: tRender, totalMs: Date.now() - t0 };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
