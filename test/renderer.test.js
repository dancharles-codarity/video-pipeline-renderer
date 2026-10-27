// End-to-end checks against synthetic footage. Needs Chromium and ffmpeg.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareJob } from '../src/job.js';
import { stills, preview, master } from '../src/ops.js';

let dir;
const probe = (f, entries) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'json', f], { encoding: 'utf8' }));

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'vpr-test-'));
  const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
  ff('-f', 'lavfi', '-i', 'color=c=0x336699:s=640x360:r=30:d=12', '-f', 'lavfi', '-i', 'sine=f=440:d=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(dir, 'base.mp4'));
  ff('-f', 'lavfi', '-i', 'color=c=0x00ff00:s=320x180:r=30:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', join(dir, 'clip.mp4'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

const ROOT = join(import.meta.dirname, '..');
const TAG = readFileSync(join(ROOT, 'examples/sample/scenes/lower-third.js'), 'utf8');

const JOB = {
  format: 'landscape',
  design: {
    tokens: join(ROOT, 'examples/sample/tokens.json'),
    fontBase: join(ROOT, 'assets'),
    cssFile: join(ROOT, 'examples/sample/motion.css'),
  },
  base: 'base.mp4',
  items: [
    { name: 'tag', dur: 2.0, at: 3.0, transparent: true, scene: { code: TAG, params: { name: 'Sam Lee', role: 'Producer' } } },
    { name: 'card', dur: 1.5, at: 7.0, scene: { code: "kit.scene('g',{init(kit){kit.stage.append(kit.h('<div class=\"ground\"><p class=\"sample-display\" style=\"position:absolute;left:200px;top:400px\">Card</p></div>'))},render(t){}});" } },
    { name: 'clip', type: 'broll', src: 'clip.mp4', at: 5.5, dur: 1.0 },
  ],
};

test('job validation rejects a graphic with no scene', async () => {
  await assert.rejects(prepareJob({ ...JOB, items: [{ name: 'x', dur: 1, at: 0 }] }, dir), /scene/);
});

test('job validation rejects duplicate names', async () => {
  await assert.rejects(prepareJob({ ...JOB, items: [JOB.items[0], JOB.items[0]] }, dir), /twice/);
});

test('stills: one frame per fraction plus a contact sheet', async () => {
  const job = await prepareJob(JOB, dir);
  const [r] = await stills(job, { names: ['tag'], outDir: join(dir, 'out') });
  assert.deepEqual(r.times, [0.3, 1, 1.94]);
  assert.equal(r.problems.length, 0, r.problems.join('\n'));
  for (const f of r.reviews) assert.ok(existsSync(f));
  const s = probe(r.sheet, 'stream=width,height').streams[0];
  assert.equal(s.width, 640 * 3);
});

test('preview: low-res window over the footage, with audio, neighbours included', async () => {
  const job = await prepareJob(JOB, dir);
  const res = await preview(job, { names: ['tag', 'clip'], outDir: join(dir, 'out'), reel: true });
  const tag = res.previews.find((p) => p.name === 'tag');
  assert.equal(tag.start, 2);
  assert.equal(tag.end, 6);
  assert.deepEqual(tag.layers, ['tag', 'clip']);
  const info = probe(tag.file, 'stream=codec_type,width,height,r_frame_rate:format=duration');
  const v = info.streams.find((s) => s.codec_type === 'video');
  assert.equal(v.width, 960);
  assert.equal(v.height, 540);
  assert.equal(v.r_frame_rate, '12/1');
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'));
  assert.ok(Math.abs(Number(info.format.duration) - 4) < 0.15);
  assert.ok(existsSync(res.reel));
});

test('preview: the B-roll shows inside its window and not before', async () => {
  const job = await prepareJob(JOB, dir);
  const res = await preview(job, { names: ['clip'], outDir: join(dir, 'out2') });
  const f = res.previews[0].file; // window 4.5 to 7.5, clip at 5.5 to 6.5
  const px = (t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', 'format=rgb24,crop=2:2:480:270', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const before = px(0.5), during = px(1.5);
  assert.ok(during[1] > 200 && during[0] < 60, `clip should be green during its span, got ${[...during]}`);
  assert.ok(before[1] < 200, `clip should not show before its span, got ${[...before]}`);
});

test('master: full fps, right codec per transparency', async () => {
  const job = await prepareJob(JOB, dir);
  const out = join(dir, 'out3');
  const res = await master(job, { names: ['tag', 'card'], outDir: out });
  const tag = probe(res[0].file, 'stream=codec_name,pix_fmt,width,nb_frames').streams[0];
  assert.equal(tag.codec_name, 'qtrle');
  assert.equal(tag.pix_fmt, 'argb');
  assert.equal(tag.width, 1920);
  assert.equal(Number(tag.nb_frames), 60);
  const card = probe(res[1].file, 'stream=codec_name,pix_fmt').streams[0];
  assert.equal(card.codec_name, 'h264');
  assert.equal(card.pix_fmt, 'yuv420p');
});

test('timecode reads the way a timeline note quotes it', async () => {
  const { timecode } = await import('../src/ops.js');
  assert.equal(timecode(254.2), '04:14.200');
  assert.equal(timecode(3725.04), '1:02:05.040');
  assert.equal(timecode(0), '00:00.000');
});

test('remote jobs cannot reach server paths', async () => {
  const remote = { remote: true };
  const web = { ...JOB, design: {}, items: [JOB.items[1]], base: 'https://cdn.example/a.mp4' };
  await assert.rejects(prepareJob({ ...web, base: '/etc/passwd' }, null, remote), /URL/);
  await assert.rejects(prepareJob({ ...web, design: { tokens: '/etc/passwd' } }, null, remote), /URLs or data/);
  await assert.rejects(prepareJob({ ...web, design: { assets: { 'a.png': 'x.png' } } }, null, remote), /URLs or data/);
  await assert.rejects(prepareJob({ ...web, items: [{ name: 'a', dur: 1, at: 0, scene: { file: 'x.js' } }] }, null, remote), /inline/);
  await assert.rejects(prepareJob({ ...web, items: [{ name: 'b', type: 'broll', src: 'clip.mp4', at: 0, dur: 1 }] }, null, remote), /URL/);
});

test('remote media hosts can be restricted', async () => {
  process.env.VPR_MEDIA_HOSTS = 'codaritymedia.b-cdn.net';
  try {
    const web = { ...JOB, design: {}, items: [JOB.items[1]] };
    await assert.rejects(prepareJob({ ...web, base: 'https://elsewhere.example/a.mp4' }, null, { remote: true }), /host not allowed/);
    const ok = await prepareJob({ ...web, base: 'https://codaritymedia.b-cdn.net/clients/x/a.mp4' }, null, { remote: true });
    assert.equal(ok.base, 'https://codaritymedia.b-cdn.net/clients/x/a.mp4');
  } finally {
    delete process.env.VPR_MEDIA_HOSTS;
  }
});

test('design: themed tokens and references resolve, type styles become classes', async () => {
  const { buildDesign, resolveTokens } = await import('../src/design.js');
  const tokens = JSON.parse(readFileSync(join(ROOT, 'examples/sample/tokens.json'), 'utf8'));
  assert.equal(resolveTokens(tokens, 'dark').get('bg-page'), '#0E1420');
  assert.equal(resolveTokens(tokens, 'light').get('bg-page'), '#F7F7F2');
  const font = 'data:font/ttf;base64,' + readFileSync(join(ROOT, 'assets/timecode.ttf')).toString('base64');
  const read = async (src) => Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  const d = await buildDesign({ tokens, files: { 'timecode.ttf': font } }, read);
  assert.equal(d.ground, '#0E1420');
  assert.match(d.css, /@font-face \{ font-family: "Sample Sans"; font-weight: 500;/);
  assert.match(d.css, /--accent-default: #2EC4B6;/);
  assert.match(d.css, /#stage \.sample-display \{ font-family: var\(--font-display\); font-size: 120px/);
});

test('design: a token cannot break out of its CSS value', async () => {
  const { buildDesign } = await import('../src/design.js');
  const evil = { color: { tokens: [{ name: 'x', value: 'red; } body { background: url(https://evil.example/x)' }] } };
  await assert.rejects(buildDesign({ tokens: evil }, async () => Buffer.alloc(0)), /not allowed/);
  await assert.rejects(buildDesign({ css: '.a { background: url(https://evil.example/x.png) }' }, async () => Buffer.alloc(0)), /data: URI/);
});

test('mcp: handshake, tool list and the job reference', async () => {
  const { mcp } = await import('../src/mcp.js');
  const init = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  assert.equal(init.json.result.serverInfo.name, 'video-pipeline-renderer');
  assert.equal((await mcp({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.json.result.tools.map((t) => t.name), ['get_job_reference', 'render_stills', 'render_preview', 'render_master', 'get_render']);
  const ref = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_job_reference', arguments: {} } });
  assert.match(ref.json.result.content[0].text, /^## Client-neutral by design/);
  assert.match(ref.json.result.content[0].text, /items\[\]\.at/);
  const unknown = await mcp({ jsonrpc: '2.0', id: 4, method: 'nope' });
  assert.equal(unknown.json.error.code, -32601);
});

test('mcp: a bad job comes back as a tool error the model can read', async () => {
  const { mcp } = await import('../src/mcp.js');
  const r = await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'render_stills', arguments: { job: { items: [{ name: 'x', dur: 1, at: 0, scene: { file: 'a.js' } }] } } } });
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /inline/);
});

test('mcp: stills and previews come with images to look at', async () => {
  const { inspect } = await import('../src/mcp.js');
  const job = await prepareJob(JOB, dir);
  const out = join(dir, 'out-mcp');
  const st = await inspect('stills', await stills(job, { names: ['tag'], outDir: out }));
  assert.equal(st[0].name, 'tag');
  assert.equal(Buffer.from(st[0].png, 'base64').subarray(1, 4).toString(), 'PNG');
  const pv = await inspect('preview', await preview(job, { names: ['clip'], outDir: out }));
  const w = probe(join(out, 'preview-clip-strip.png'), 'stream=width').streams[0].width;
  assert.equal(w, 1440);
  assert.equal(pv[0].name, 'clip');
});

test('auth: header or query token, constant-time compare, refuse when unset', async () => {
  const { authorised, tokenFrom } = await import('../src/service.js');
  assert.equal(tokenFrom({ headers: { authorization: 'Bearer abc' } }), 'abc');
  assert.equal(tokenFrom({ headers: {}, url: '/api/mcp?token=xyz' }), 'xyz');
  assert.equal(tokenFrom({ headers: {}, query: { token: 'q' } }), 'q');
  assert.equal(authorised('abc', 'abc'), true);
  assert.equal(authorised('abd', 'abc'), false);
  assert.equal(authorised('', ''), false);
  assert.equal(authorised('anything', undefined), false);
});

const T1 = {
  format: 'landscape',
  design: { tokens: { name: 'Test', color: { themes: [{ id: 'dark' }], tokens: [
    { name: 'bg-page', value: { dark: '#0E1420' } }, { name: 'fg-1', value: { dark: '#FFFFFF' } }, { name: 'accent-default', value: { dark: '#2EC4B6' } }] } } },
};

test('scenes: the README example renders and is not blank', async () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const from = readme.indexOf('```js', readme.indexOf('A minimal working scene'));
  const code = readme.slice(from + 5, readme.indexOf('```', from + 5));
  const job = await prepareJob({ ...T1, items: [{ name: 'lt', at: 4, dur: 5, transparent: true, scene: { code, params: { name: 'Alex Morgan', role: 'Head of Events' } } }] }, dir, { remote: true });
  const [r] = await stills(job, { outDir: join(dir, 'out-ex') });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.problems, []);
});

test('scenes: a render that returns HTML is flagged as blank', async () => {
  const code = "kit.scene('g',{render(t,k){ return k.h('<div style=\"color:#fff;font-size:80px\">Hi</div>'); }});";
  const job = await prepareJob({ ...T1, items: [{ name: 'bad', at: 0, dur: 2, transparent: true, scene: { code } }] }, dir, { remote: true });
  const [r] = await stills(job, { outDir: join(dir, 'out-bad') });
  assert.match(r.warnings[0], /every still is blank/);
});

test('service: sweep and free-space check are safe off Vercel', async () => {
  const { sweep, freeMB } = await import('../src/serverless.js');
  assert.deepEqual(sweep(), { killed: 0, removed: 0 });
  assert.ok(freeMB() > 0);
});

test('design: font files named but not given are a warning, not a refusal', async () => {
  const { buildDesign } = await import('../src/design.js');
  const d = await buildDesign({ tokens: { type: { fonts: [{ family: 'Brand', file: 'fonts/brand.otf', weight: '700' }], families: { body: '"Brand", sans-serif' } } } }, async () => Buffer.alloc(0));
  assert.match(d.warnings[0], /fonts\/brand\.otf/);
  assert.doesNotMatch(d.css, /@font-face/);
});

test('stills: explicit times check exact moments', async () => {
  const job = await prepareJob(JOB, dir);
  const [r] = await stills(job, { names: ['tag'], outDir: join(dir, 'out-times'), times: [0.2, 0.4, 9] });
  assert.deepEqual(r.times, [0.2, 0.4]);
  const [one] = await stills(job, { names: ['tag'], outDir: join(dir, 'out-one'), times: [0.3] });
  assert.ok(existsSync(one.sheet));
});

test('mcp: times as a JSON string from a stale schema still works', async () => {
  const { mcp } = await import('../src/mcp.js');
  const job = { format: 'landscape', items: [{ name: 'x', at: 0, dur: 1, transparent: true, scene: { code: "kit.scene('g',{init(kit){kit.stage.append(kit.h('<p style=\"color:#fff;font-size:80px\">x</p>'))},render(){}});" } }] };
  const bad = await mcp({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'render_stills', arguments: { job, times: 'soon' } } });
  assert.match(bad.json.result.content[0].text, /times must be a list of seconds/);
});

test('background render: starts at once, then reports done with its files', async () => {
  const { startJob, loadJob } = await import('../src/service.js');
  const code = `kit.scene('g',{init(kit){kit.stage.append(kit.h('<p class="x" style="color:#fff;font-size:80px">x</p>'));this.x=Q(kit,'.x')},render(t){this.x.opacity=1}});`;
  const started = await startJob({ op: 'master', job: { ...T1, items: [{ name: 'bg', at: 0, dur: 0.5, transparent: true, scene: { code } }] } });
  assert.equal(started.status, 'running');
  let rec;
  for (let i = 0; i < 120; i++) {
    rec = await loadJob(started.job_id);
    if (rec.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(rec.status, 'done', rec.error);
  assert.equal(rec.files[0].file, 'bg.mov');
  await assert.rejects(startJob({ op: 'master', job: { items: [] } }), /at least one item/);
});

test('mcp: get_render with an unknown id is a readable error', async () => {
  const { mcp } = await import('../src/mcp.js');
  const r = await mcp({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'get_render', arguments: { job_id: '00000000-0000-0000-0000-000000000000' } } });
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /no render/);
});

test('scenes: a var() gradient clipped to text survives render() changing the element', async () => {
  const tokens = { color: { tokens: [{ name: 'c1', value: '#00C8FF' }, { name: 'c2', value: '#8B30CC' }] } };
  const code = `kit.scene('g',{init(kit){kit.stage.append(kit.h('<div style="position:absolute;inset:0;background:#060614"><p class="f" style="position:absolute;margin:0;left:200px;top:300px;font-size:200px;background:linear-gradient(90deg,var(--c1),var(--c2));-webkit-background-clip:text;background-clip:text;color:transparent">$4.7M</p></div>'));this.f=Q(kit,'.f')},render(t){this.f.opacity=1;this.f.transform='translateY(0px)'}});`;
  const job = await prepareJob({ format: 'landscape', design: { tokens }, items: [{ name: 'grad', at: 0, dur: 1, scene: { code } }] }, dir, { remote: true });
  const [r] = await stills(job, { outDir: join(dir, 'out-grad'), times: [0.5] });
  const stats = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i '${r.reviews[0]}' -vf crop=1920:300:0:300,format=yuv444p,signalstats,metadata=print -f null - 2>&1`], { encoding: 'utf8' });
  const ymax = Number(stats.match(/YMAX=(\d+)/)[1]);
  assert.ok(ymax > 60, `gradient figure should be visible, brightest pixel ${ymax}`);
});

test('design: flat token maps work, and undefined var() names are warned about', async () => {
  const { resolveTokens } = await import('../src/design.js');
  const flat = resolveTokens({ color: { 'bg-page': '#0E1420', 'fg-1': { dark: '#FFFFFF', light: '#000000' } }, radius: { 'radius-md': '12px' } }, 'dark');
  assert.equal(flat.get('bg-page'), '#0E1420');
  assert.equal(flat.get('fg-1'), '#FFFFFF');
  assert.equal(flat.get('radius-md'), '12px');
  const code = `kit.scene('g',{init(kit){kit.stage.append(kit.h('<p style="color:var(--fg-1);background:var(--bg-pgae)">x</p>'))},render(){}});`;
  const job = await prepareJob({ format: 'landscape', design: { tokens: { color: { 'bg-page': '#0E1420', 'fg-1': '#FFFFFF' } } }, items: [{ name: 'typo', at: 0, dur: 1, scene: { code } }] }, dir, { remote: true });
  assert.equal(job.warnings.length, 1);
  assert.match(job.warnings[0], /typo uses var\(--bg-pgae\)/);
  const none = await prepareJob({ format: 'landscape', design: { tokens: { color: [] } }, items: [{ name: 'n', at: 0, dur: 1, scene: { code: "kit.scene('g',{render(){}});" } }] }, dir, { remote: true });
  assert.match(none.warnings[0], /defines no tokens/);
});
