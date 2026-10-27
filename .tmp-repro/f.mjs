import { readFileSync, writeFileSync } from 'node:fs';
import { prepareJob } from '../src/job.js';
import { stills } from '../src/ops.js';
const tokens = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const code = readFileSync('.tmp-repro/scene.js', 'utf8');
const variant = (name, c) => ({ name, at: 65.1, dur: 6, scene: { code: c } });
const items = [
  variant('as-sent', code),
  variant('no-flex-center', code.replace('display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center', 'padding:300px 200px')),
  variant('no-transform', code.replace("this.fig.transform = 'translateY(' + lerp(40, 0, a) + 'px) scale(' + lerp(0.94, 1, a) + ')';", '')),
  variant('hex-colours', code.replace('var(--me-cyan), var(--me-blue), var(--me-purple)', '#00C8FF, #5B7FEE, #8B30CC')),
];
const job = await prepareJob({ format: 'landscape', design: { tokens, theme: 'dark' }, items }, '.', { remote: true });
for (const r of await stills(job, { outDir: '.tmp-repro/out', times: [3] })) console.log(r.name);
