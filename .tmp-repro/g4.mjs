import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { prepareJob } from '../src/job.js';
import { stills } from '../src/ops.js';
const tokens = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = readFileSync('.tmp-repro/scene.js', 'utf8');
const V = {
  'as-sent': base,
  'background-image': base.replace('background:linear-gradient(', 'background-image:linear-gradient('),
};
for (const [name, code] of Object.entries(V)) {
  const job = await prepareJob({ format: 'landscape', design: { tokens, theme: 'dark' }, items: [{ name, at: 0, dur: 6, scene: { code } }] }, '.', { remote: true });
  await stills(job, { outDir: '.tmp-repro/g4', times: [3] });
  const y = execSync(`ffmpeg -hide_banner -i .tmp-repro/g4/still-${name}-t_3.00.png -vf crop=1920:220:0:430,format=yuv444p,signalstats,metadata=print -f null - 2>&1 | grep -oE 'YMAX=[0-9]+' | head -1`).toString().trim();
  console.log(name.padEnd(18), y);
}
