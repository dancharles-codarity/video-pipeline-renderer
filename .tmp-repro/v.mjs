import { prepareJob } from '../src/job.js';
import { stills } from '../src/ops.js';
import { execSync } from 'node:child_process';
const tokens = { color: { tokens: [{ name: 'c1', value: '#00C8FF' }, { name: 'c2', value: '#8B30CC' }] } };
const css = '.gclass { background: linear-gradient(90deg, var(--c1), var(--c2)); -webkit-background-clip: text; background-clip: text; color: transparent; }';
const p = (style, cls = '') => `kit.scene('g',{init(kit){kit.stage.append(kit.h('<div style="position:absolute;inset:0;background:#060614"><p class="${cls}" style="position:absolute;margin:0;left:200px;top:300px;font-size:200px;font-weight:700;${style}">$4.7M</p></div>'))},render(){}});`;
const clip = '-webkit-background-clip:text;background-clip:text;color:transparent;';
const items = [
  ['inline-var-text', p('background:linear-gradient(90deg,var(--c1),var(--c2));' + clip)],
  ['inline-var-box', p('background:linear-gradient(90deg,var(--c1),var(--c2));color:#fff;')],
  ['inline-var-solid', p('background:var(--c1);' + clip)],
  ['class-var-text', p('', 'gclass')],
].map(([name, code]) => ({ name, at: 0, dur: 1, scene: { code } }));
const job = await prepareJob({ format: 'landscape', design: { tokens, css }, items }, '.', { remote: true });
for (const r of await stills(job, { outDir: '.tmp-repro/v', times: [0.5] })) {
  const y = execSync(`ffmpeg -hide_banner -i .tmp-repro/v/still-${r.name}-t_0.50.png -vf format=yuv444p,signalstats,metadata=print -f null - 2>&1 | grep -oE 'YMAX=[0-9]+' | head -1`).toString().trim();
  console.log(r.name.padEnd(18), y);
}
