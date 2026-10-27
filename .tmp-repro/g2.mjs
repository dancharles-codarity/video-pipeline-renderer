import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { prepareJob } from '../src/job.js';
import { stills } from '../src/ops.js';
const full = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const code = readFileSync('.tmp-repro/scene.js', 'utf8').replace('sc-fig me-display-xl', 'sc-fig');
const groups = Object.keys(full).filter((k) => full[k]?.tokens);
const variants = { all: full, colorOnly: { color: full.color } };
for (const g of groups) { const t = { ...full }; delete t[g]; variants['minus-' + g] = t; }
variants.minusType = { ...full, type: undefined };
const items = Object.keys(variants).map((name) => ({ name, at: 0, dur: 6, scene: { code } }));
for (const [name, tokens] of Object.entries(variants)) {
  const job = await prepareJob({ format: 'landscape', design: { tokens, theme: 'dark' }, items: [{ name, at: 0, dur: 6, scene: { code } }] }, '.', { remote: true });
  const [r] = await stills(job, { outDir: '.tmp-repro/g2', times: [3] });
  const y = execSync(`ffmpeg -hide_banner -i .tmp-repro/g2/still-${name}-t_3.00.png -vf crop=1920:220:0:430,format=yuv444p,signalstats,metadata=print -f null - 2>&1 | grep -oE 'YMAX=[0-9]+' | head -1`).toString().trim();
  console.log(name.padEnd(22), y);
}
