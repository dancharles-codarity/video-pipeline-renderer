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

const JOB = {
  format: 'landscape',
  brand: 'matrix-events',
  base: 'base.mp4',
  items: [
    { name: 'tag', dur: 2.0, at: 3.0, transparent: true, scene: { template: 'landscape/tag', params: { n: 2, title: 'Pre-production' } } },
    { name: 'card', dur: 1.5, at: 7.0, scene: { code: "kit.scene('g',{init(kit){kit.stage.append(kit.h('<div class=\"ground\"><p class=\"display\" style=\"position:absolute;left:200px;top:400px;font-size:120px\">Card</p></div>'))},render(t){}});" } },
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
  await assert.rejects(prepareJob({ ...JOB, base: '/etc/passwd' }, null, remote), /URL/);
  await assert.rejects(prepareJob({ ...JOB, base: 'https://x/a.mp4', brand: '../../etc' }, null, remote), /brand/);
  await assert.rejects(prepareJob({ ...JOB, base: 'https://x/a.mp4', items: [{ name: 'a', dur: 1, at: 0, scene: { file: 'x.js' } }] }, null, remote), /inline/);
  await assert.rejects(prepareJob({ ...JOB, base: 'https://x/a.mp4', items: [{ name: 'a', dur: 1, at: 0, scene: { template: '../../src/job' } }] }, null, remote), /template/);
});
