import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { prepareJob } from '../src/job.js';
import { stills } from '../src/ops.js';
const base = readFileSync('.tmp-repro/scene.js', 'utf8').replace('sc-fig me-display-xl', 'sc-fig');
const small = { color: { tokens: [['me-cyan', '#00C8FF'], ['me-blue', '#5B7FEE'], ['me-purple', '#8B30CC'], ['accent-default', '#00C8FF'], ['fg-2', '#B0B0CC']].map(([name, value]) => ({ name, value })) } };
const V = {
  'small-tokens': base,
  'no-fig-opacity': base.replace('this.fig.opacity = a;', ''),
  'no-wrap-opacity': base.replace("this.wrap.opacity = 1 - ei(seg(t, kit.dur - 0.5, kit.dur));", ''),
  'no-anim-at-all': base.replace(/render\(t, kit\) \{[\s\S]*?\n  \},/, 'render(t, kit) {},'),
};
for (const [name, code] of Object.entries(V)) {
  const job = await prepareJob({ format: 'landscape', design: { tokens: small }, items: [{ name, at: 0, dur: 6, scene: { code } }] }, '.', { remote: true });
  await stills(job, { outDir: '.tmp-repro/g3', times: [3] });
  const y = execSync(`ffmpeg -hide_banner -i .tmp-repro/g3/still-${name}-t_3.00.png -vf crop=1920:220:0:430,format=yuv444p,signalstats,metadata=print -f null - 2>&1 | grep -oE 'YMAX=[0-9]+' | head -1`).toString().trim();
  console.log(name.padEnd(16), y);
}
