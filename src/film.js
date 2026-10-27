// Builds the in-memory film the Motion player loads: one scene with the id `g`,
// the client's stage stylesheet, the helper kit and the scene code, plus assets.
// Nothing is written to disk; window.__animation.load takes the object as is.
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELPERS = readFileSync(join(ROOT, 'kit', 'helpers.js'), 'utf8');
const SETTLE = readFileSync(join(ROOT, 'kit', 'settle-vars.js'), 'utf8');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export function mimeOf(name) {
  const m = MIME[extname(name).toLowerCase()];
  if (!m) throw new Error(`asset "${name}" has an unsupported type (${Object.keys(MIME).join(' ')})`);
  return m;
}

// item: {name, dur, transparent, code}, fmt: a FORMATS entry, design: from
// buildDesign, assets: [{name, bytes}]. Returns what window.__animation.load takes.
export function buildFilm(item, fmt, design, assets) {
  const scenes = {
    v: 1, stage: 'final', look: design.look, width: fmt.width, height: fmt.height, fps: fmt.fps,
    background: item.transparent ? 'transparent' : design.ground,
    scenes: [{ id: 'g', name: item.name.slice(0, 40), dur: item.dur, desc: item.name }],
  };
  const helpers = item.helpers === false ? '' : `const RISE_DY = ${fmt.riseDy};\n${HELPERS}\n`;
  return {
    title: item.name,
    script: 'window.CUT = kit.scenes();\n',
    modules: [
      { name: 'scenes.json', kind: 'json', text: JSON.stringify(scenes) },
      { name: 'base.css', kind: 'css', text: design.css },
      { name: 'scene-g.js', kind: 'js', text: SETTLE + '\n' + helpers + item.code },
    ],
    assets: assets.map((a) => ({ name: a.name, mime: mimeOf(a.name), base64: a.bytes.toString('base64') })),
  };
}
