// Turns a client's design system into the stage stylesheet. Nothing about any
// client lives in this repo: each job brings its own.
//
// The design block of a job:
//   tokens    the Design System artifact's tokens.json, inline or as a source
//   theme     which theme a themed token resolves to (default: the first listed)
//   fontBase  where tokens.type.fonts[].file paths resolve (a URL or folder)
//   files     explicit sources for those paths, e.g. {"fonts/orbitron-bold.otf": "data:..."}
//   fonts     extra faces: [{family, weight, style, src}]
//   css       inline CSS from the client's design file (Motion and Video section)
//   cssFile   the same as a source
//   ground    stage colour behind full-frame cards (default: the bg-page token)
//   assets    logos and images by name, e.g. {"logo-white.png": "https://...b-cdn.net/..."}
//
// A source is an http(s) URL, a data: URI or (local jobs only) a path.
//
// From tokens the stage gets, scoped to #stage:
//   --<token-name> for every token in every group, themes and {references} resolved
//   --font-<family key> for each type.families entry, and @font-face per font file
//   a class per type style (.me-display-xl ...) setting family, size, weight, tracking
const FONT_MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const FONT_FORMAT = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };

const ext = (p) => (p.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '').toLowerCase();
const ident = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
// CSS values come from a client file: refuse anything that could close the rule or
// pull in a resource, so a token can only ever be a value.
const safeValue = (v) => {
  const s = String(v);
  if (/[;{}<>]|url\s*\(|@import|expression\s*\(/i.test(s)) throw new Error(`token value not allowed in CSS: ${s.slice(0, 80)}`);
  return s;
};
const quote = (s) => `"${String(s).replace(/["\\]/g, '')}"`;

// Every {name, value} token in every group, keyed by name.
function collectTokens(tokens) {
  const all = new Map();
  for (const group of Object.values(tokens ?? {})) {
    if (group && Array.isArray(group.tokens)) for (const t of group.tokens) if (t?.name != null) all.set(String(t.name), t.value);
  }
  return all;
}

export function resolveTokens(tokens, theme) {
  const raw = collectTokens(tokens);
  const themeId = theme ?? tokens?.color?.themes?.[0]?.id;
  const out = new Map();
  const resolve = (name, seen = new Set()) => {
    if (out.has(name)) return out.get(name);
    if (seen.has(name)) throw new Error(`token reference loop at ${name}`);
    seen.add(name);
    let v = raw.get(name);
    if (v && typeof v === 'object') v = v[themeId] ?? Object.values(v)[0];
    if (v == null) return undefined;
    v = String(v).replace(/\{([^}]+)\}/g, (_, ref) => {
      if (!raw.has(ref)) throw new Error(`token ${name} refers to unknown {${ref}}`);
      return resolve(ref, seen);
    });
    out.set(name, v);
    return v;
  };
  for (const name of raw.keys()) resolve(name);
  return out;
}

// fetch(src) -> Buffer, supplied by the job loader (it knows local vs remote rules).
export async function buildDesign(design = {}, fetchSource) {
  const tokens = design.tokens && typeof design.tokens === 'object'
    ? design.tokens
    : design.tokens ? JSON.parse((await fetchSource(design.tokens)).toString('utf8')) : null;
  const values = tokens ? resolveTokens(tokens, design.theme) : new Map();

  const faces = [];
  const warnings = [];
  const fontFile = (file) => {
    if (design.files?.[file]) return design.files[file];
    if (design.fontBase) return design.fontBase.replace(/\/*$/, '/') + file.replace(/^\/+/, '');
    return null;
  };
  const missing = [];
  for (const f of tokens?.type?.fonts ?? []) {
    const src = fontFile(f.file);
    if (src) faces.push({ family: f.family, weight: f.weight, style: f.style, src, name: f.file });
    else missing.push(f.file);
  }
  if (missing.length) {
    // Render anyway: text falls back along the type.families stacks.
    warnings.push(`no font files given for ${missing.join(', ')}; text uses the fallback fonts in type.families. Pass design.files or design.fontBase for the real faces`);
  }
  for (const f of design.fonts ?? []) faces.push({ family: f.family, weight: f.weight, style: f.style, src: f.src, name: f.name ?? f.src });

  const rules = [];
  for (const f of faces) {
    const e = ext(f.name.split('?')[0]) || ext(String(f.src).split('?')[0]);
    const mime = FONT_MIME[e];
    if (!mime) throw new Error(`font ${f.name}: unsupported type (woff2, woff, ttf, otf)`);
    const b64 = (await fetchSource(f.src)).toString('base64');
    // data: URIs are the one url() the player accepts in a stylesheet.
    rules.push(`@font-face { font-family: ${quote(f.family)}; font-weight: ${safeValue(f.weight ?? 'normal')}; font-style: ${safeValue(f.style ?? 'normal')}; src: url(data:${mime};base64,${b64}) format("${FONT_FORMAT[e]}"); }`);
  }

  const vars = [...values].map(([k, v]) => `--${ident(k)}: ${safeValue(v)};`);
  const families = tokens?.type?.families ?? {};
  for (const [k, v] of Object.entries(families)) vars.push(`--font-${ident(k)}: ${safeValue(v)};`);
  const stage = [...vars];
  // Without a body family the browser default is a serif; sans reads closer to any brand.
  stage.push(families.body ? 'font-family: var(--font-body);' : 'font-family: sans-serif;');
  if (values.has('fg-1')) stage.push('color: var(--fg-1);');
  rules.push(`#stage { ${stage.join(' ')} }`);

  for (const group of tokens?.type?.groups ?? []) {
    for (const s of group.styles ?? []) {
      const decl = [];
      if (group.family) decl.push(`font-family: var(--font-${ident(group.family)})`);
      if (s.fontSize) decl.push(`font-size: ${safeValue(s.fontSize)}`);
      if (s.lineHeight) decl.push(`line-height: ${safeValue(s.lineHeight)}`);
      if (s.fontWeight) decl.push(`font-weight: ${safeValue(s.fontWeight)}`);
      if (s.letterSpacing) decl.push(`letter-spacing: ${safeValue(s.letterSpacing)}`);
      rules.push(`#stage .${ident(s.name)} { ${decl.join('; ')} }`);
    }
  }

  let css = rules.join('\n');
  if (design.cssFile) css += '\n' + (await fetchSource(design.cssFile)).toString('utf8');
  if (design.css) css += '\n' + design.css;
  if (/url\s*\(\s*['"]?(?!data:)/i.test(css.replace(/url\(data:[^)]*\)/g, ''))) {
    throw new Error('stylesheet url() must be a data: URI; give images as design.assets and use kit.assets.url() in scene code');
  }

  const assets = [];
  for (const [name, src] of Object.entries(design.assets ?? {})) assets.push({ name, bytes: await fetchSource(src) });

  return {
    css,
    ground: design.ground ?? values.get('bg-page') ?? '#000000',
    look: tokens?.name ?? 'client design',
    assets,
    warnings,
  };
}
