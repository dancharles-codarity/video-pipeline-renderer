import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { prepareJob } from '../src/job.js';
import { stills } from '../src/ops.js';
const tokens = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const code = readFileSync('.tmp-repro/scene.js', 'utf8');
const V = {
  'as-sent': code,
  'no-fill-color': code.replace('-webkit-text-fill-color:transparent;', ''),
  'no-class': code.replace('sc-fig me-display-xl', 'sc-fig'),
  'accent-vars': code.replace('var(--me-cyan), var(--me-blue), var(--me-purple)', 'var(--accent-default), var(--accent-purple)'),
  'one-me-var': code.replace('var(--me-cyan), var(--me-blue), var(--me-purple)', 'var(--me-cyan), #8B30CC'),
  'no-spaces': code.replace('var(--me-cyan), var(--me-blue), var(--me-purple)', 'var(--me-cyan),var(--me-blue),var(--me-purple)'),
};
const items = Object.entries(V).map(([name, c]) => ({ name, at: 0, dur: 6, scene: { code: c } }));
const job = await prepareJob({ format: 'landscape', design: { tokens, theme: 'dark' }, items }, '.', { remote: true });
for (const r of await stills(job, { outDir: '.tmp-repro/b', times: [3] })) {
  // brightest pixel in the band where the figure sits
  const y = execSync(`ffmpeg -hide_banner -i .tmp-repro/b/still-${r.name}-t_3.00.png -vf crop=1920:220:0:430,format=yuv444p,signalstats,metadata=print -f null - 2>&1 | grep -oE 'YMAX=[0-9]+' | head -1`).toString().trim();
  console.log(r.name.padEnd(14), y);
}
