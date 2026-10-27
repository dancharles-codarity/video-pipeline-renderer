// Headless Chromium around the vendored Motion player. The player's own `#tools`
// entry exposes window.__animation: load(files), frame(t, {scale}), consoleLog().
// Every frame comes from the same renderer the Motion artifact uses, so a still
// here is the frame Export would produce.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PLAYER_DIR = join(ROOT, 'vendor', 'motion');
const PLAYER_FILES = ['index.html', 'artifact-type/app.js', 'artifact-type/app.css'];

// Same flags as the Motion type's render-offline driver: deterministic raster,
// and no network for scene code.
const ARGS = [
  '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text',
  '--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP * ^NOTFOUND',
  '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp',
];

function localChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  return readdirSync(base).filter((d) => d.startsWith('chromium-'))
    .flatMap((d) => ['chrome-linux64', 'chrome-linux'].map((p) => join(base, d, p, 'chrome'))).find(existsSync);
}

// The single-process Chromium often dies on SIGTRAP (on shutdown, or when
// short of shared memory), and Vercel writes each crash's core dump into /tmp:
// two dumps took 300 MB of the 525. Launch it through a shell that sets the
// core size limit to zero, so a crash costs nothing on disk.
function noCoreDumps(exe) {
  const wrapper = `${exe}-nocore`;
  if (!existsSync(wrapper)) writeFileSync(wrapper, `#!/bin/sh\nulimit -c 0\nexec '${exe}' "$@"\n`, { mode: 0o755 });
  return wrapper;
}

async function launch() {
  const { chromium } = await import('playwright-core');
  if (process.env.VERCEL) {
    // Serverless: @sparticuz/chromium ships a Lambda-compatible build. Its
    // --disable-web-security stops the player's sandboxed iframe from loading
    // the film, and would loosen the sandbox anyway, so it is dropped.
    const sparticuz = (await import('@sparticuz/chromium')).default;
    const args = sparticuz.args.filter((a) => a !== '--disable-web-security');
    return chromium.launch({ executablePath: noCoreDumps(await sparticuz.executablePath()), args: [...args, ...ARGS] });
  }
  const exe = localChromium();
  return chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ARGS });
}

// Every open renderer, so a job that runs out of time can be stopped cleanly.
const OPEN = new Set();

export async function closeAll() {
  await Promise.all([...OPEN].map((r) => r.close().catch(() => {})));
}

export class Renderer {
  static async open() {
    const r = new Renderer();
    r.browser = await launch();
    OPEN.add(r);
    // One long-lived context with a page held open: the serverless build runs
    // --single-process, where closing a context takes the whole browser down.
    r.context = await r.browser.newContext();
    await r.context.addInitScript(() => { for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection']) Reflect.deleteProperty(globalThis, k); });
    r.keep = await r.context.newPage();
    return r;
  }

  async page(width, height) {
    const page = await this.context.newPage();
    await page.setViewportSize({ width, height });
    return page;
  }

  // Loads one film (the object window.__animation.load takes) into a fresh page.
  async load(files, { width, height }) {
    const page = await this.page(width, height);
    const base = pathToFileURL(PLAYER_DIR).href + '/';
    const allowed = new Set(PLAYER_FILES.map((f) => base + f));
    await page.route('**/*', (route) => {
      const u = route.request().url().split(/[?#]/)[0];
      return allowed.has(u) || /^(data|blob):/.test(u) ? route.continue() : route.abort();
    });
    await page.goto(base + 'index.html#tools');
    await page.waitForFunction(() => typeof window.__animation === 'object');
    const res = await page.evaluate((f) => window.__animation.load(f), files);
    if (res.error) {
      await page.close();
      throw new Error('film load failed: ' + String(res.error.message || res.error));
    }
    return new LoadedFilm(page, res.meta);
  }

  // Transparent PNG frames carrying one label each, bottom right: the composition
  // timecode on previews. Drawn here rather than by ffmpeg's drawtext, which
  // static ffmpeg builds often lack.
  async *labels(texts, { width, height, size, font }) {
    const page = await this.page(width, height);
    try {
      await page.route('**/*', (route) => route.abort());
      await page.evaluate(async ([fontB64, w, h, px]) => {
        const face = new FontFace('TC', `url(data:font/ttf;base64,${fontB64})`);
        document.fonts.add(await face.load());
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        window.__label = (text) => {
          const g = c.getContext('2d');
          g.clearRect(0, 0, w, h);
          g.font = `500 ${px}px TC`;
          const tw = g.measureText(text).width, pad = Math.round(px * 0.35), m = Math.round(px / 2);
          const bw = tw + pad * 2, bh = px + pad * 2;
          g.fillStyle = 'rgba(0,0,0,0.55)';
          g.fillRect(w - m - bw, h - m - bh, bw, bh);
          g.fillStyle = '#fff';
          g.textBaseline = 'middle';
          g.fillText(text, w - m - bw + pad, h - m - bh / 2);
          return c.toDataURL('image/png');
        };
      }, [font.toString('base64'), width, height, size]);
      for (const text of texts) {
        const url = await page.evaluate((t) => window.__label(t), text);
        yield Buffer.from(url.split(',')[1], 'base64');
      }
    } finally {
      await page.close();
    }
  }

  async close() {
    OPEN.delete(this);
    await this.browser?.close();
  }
}

class LoadedFilm {
  constructor(page, meta) { this.page = page; this.meta = meta; }

  // PNG bytes of the frame at time t. scale < 1 rasterises straight at the lower
  // resolution, which is what makes previews cheap.
  async frame(t, scale = 1) {
    const url = await this.page.evaluate(([tt, s]) => window.__animation.frame(tt, { scale: s }), [t, scale]);
    return Buffer.from(url.split(',')[1], 'base64');
  }

  // Console output from the film itself: raster-safety errors, throws in render.
  async problems() {
    const log = await this.page.evaluate(() => window.__animation.consoleLog());
    return log.filter((l) => l.level !== 'log').map((l) => `${l.level}: ${l.text}`);
  }

  async close() { await this.page.close(); }
}
