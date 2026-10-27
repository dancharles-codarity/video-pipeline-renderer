// ffmpeg and ffprobe, with PNG frames streamed in on stdin.
import { spawn } from 'node:child_process';

let FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// Serverless has no system ffmpeg: use the static build shipped as a dependency.
export async function useBundledBinaries() {
  FFMPEG = (await import('ffmpeg-static')).default;
}

function run(bin, args, { input, anyExit = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 || anyExit ? resolve(out + err) : reject(new Error(`${bin} exited ${code}: ${err.trim().slice(-800)}`))));
    if (input) input(p.stdin).then(() => p.stdin.end(), (e) => { p.kill(); reject(e); });
    else p.stdin.end();
  });
}

export const ffmpeg = (args, opts) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

// `ffmpeg -i` with no output lists the streams and exits 1; that listing is enough.
export async function hasAudio(src) {
  const out = await run(FFMPEG, ['-hide_banner', '-i', src], { anyExit: true });
  if (/No such file|Invalid data|Server returned|Connection refused/i.test(out)) throw new Error(`cannot read ${src}: ${out.trim().split('\n').pop()}`);
  return /Stream #\d+:\d+.*: Audio:/.test(out);
}

// True when a frame shows nothing: fully transparent, or (opaque) one flat colour.
export async function isBlank(png, transparent) {
  const vf = transparent ? 'format=rgba,alphaextract,signalstats,metadata=print' : 'format=yuv444p,signalstats,metadata=print';
  const out = await run(FFMPEG, ['-hide_banner', '-i', png, '-vf', vf, '-f', 'null', '-'], { anyExit: true });
  const v = (k) => Number(out.match(new RegExp(`lavfi\\.signalstats\\.${k}=(\\d+)`))?.[1]);
  if (transparent) return v('YMAX') === 0;
  return v('YMIN') === v('YMAX') && v('UMIN') === v('UMAX') && v('VMIN') === v('VMAX');
}

// Writes PNG buffers from an async producer to ffmpeg's stdin, respecting backpressure.
export function pngPipe(produce) {
  return async (stdin) => {
    for await (const png of produce()) {
      if (!stdin.write(png)) await new Promise((r) => stdin.once('drain', r));
    }
  };
}

export const PNG_IN = (fps) => ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];

// The two master codecs. qtrle/argb for transparent overlays: not ProRes 4444
// (three times the size), never PNG in MOV (Descript rejects it).
export const MASTER_CODEC = {
  transparent: { ext: 'mov', args: ['-c:v', 'qtrle', '-pix_fmt', 'argb'] },
  opaque: { ext: 'mp4', args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] },
};
