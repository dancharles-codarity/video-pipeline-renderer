// Builds the in-memory film the Motion player loads: one scene with the id `g`,
// the brand stylesheet, the helper kit and the scene code, plus fonts and assets.
// Nothing is written to disk; window.__animation.load takes the object as is.
import { readFileSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(ROOT, 'templates');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export function mimeOf(name) {
  const m = MIME[extname(name).toLowerCase()];
  if (!m) throw new Error(`asset "${name}" has an unsupported type (${Object.keys(MIME).join(' ')})`);
  return m;
}

// Scene code for an item: a named template with params, a file, or inline code.
// Templates read their params from `P`.
export function sceneCode(scene, baseDir) {
  if (scene.template) {
    if (!/^(landscape|vertical)\/[a-z0-9-]+$/.test(scene.template)) throw new Error(`unknown template "${scene.template}"`);
    const file = join(TEMPLATES, scene.template.replace(/\.js$/, '') + '.js');
    return `const P = ${JSON.stringify(scene.params ?? {})};\n` + readFileSync(file, 'utf8');
  }
  const params = scene.params ? `const P = ${JSON.stringify(scene.params)};\n` : '';
  if (scene.file) return params + readFileSync(join(baseDir, scene.file), 'utf8');
  if (scene.code) return params + scene.code;
  throw new Error('a graphic scene needs one of template, file or code');
}

// item: {name, dur, transparent}, fmt: a FORMATS entry, brand: a loaded brand,
// assets: [{name, bytes}] (fonts first). Returns what window.__animation.load takes.
export function buildFilm(item, code, fmt, brand, assets) {
  const scenes = {
    v: 1, stage: 'final', look: brand.look, width: fmt.width, height: fmt.height, fps: fmt.fps,
    background: item.transparent ? 'transparent' : brand.ground,
    scenes: [{ id: 'g', name: item.name.slice(0, 40), dur: item.dur, desc: item.name }],
  };
  const helper = `const RISE_DY = ${fmt.riseDy};\n` + readFileSync(join(TEMPLATES, '_helper.js'), 'utf8');
  return {
    title: item.name,
    script: 'window.CUT = kit.scenes();\n',
    modules: [
      { name: 'scenes.json', kind: 'json', text: JSON.stringify(scenes) },
      { name: 'base.css', kind: 'css', text: brand.css },
      { name: 'scene-g.js', kind: 'js', text: helper + '\n' + code },
    ],
    assets: assets.map((a) => ({ name: a.name, mime: mimeOf(a.name), base64: a.bytes.toString('base64') })),
  };
}
