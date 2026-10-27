// Housekeeping for warm serverless instances. Vercel keeps an instance alive
// between calls, and a call that is killed mid-render (the duration limit)
// never runs its own cleanup: its Chromium keeps running, holding memory and
// its shared-memory files in /tmp. /tmp is 512 MB and the unpacked Chromium
// takes 200 MB of it, so a few orphans fill it and every later launch crashes.
// The service renders one job at a time per instance, so at the start of a job
// nothing of ours should be running and anything left over can go.
import { lstatSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';

const TMP = '/tmp';
const LEFTOVERS = /^(playwright_chromiumdev_profile-|vpr-|vpr-out-|frames-)/;

export function freeMB(dir = TMP) {
  try {
    const s = statfsSync(dir);
    return Math.round((s.bavail * s.bsize) / 1048576);
  } catch {
    return null;
  }
}

// Kills leftover Chromium processes and removes leftover temp folders. Only on
// Vercel: on a workstation it would take down browsers that are not ours.
export function sweep() {
  if (!process.env.VERCEL) return { killed: 0, removed: 0 };
  let killed = 0, removed = 0;
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    if (Number(pid) === process.pid) continue;
    let cmd = '';
    try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8'); } catch { continue; }
    if (cmd.startsWith(join(TMP, 'chromium'))) {
      try { process.kill(Number(pid), 'SIGKILL'); killed++; } catch { /* already gone */ }
    }
  }
  for (const name of readdirSync(TMP)) {
    if (!LEFTOVERS.test(name)) continue;
    rmSync(join(TMP, name), { recursive: true, force: true });
    removed++;
  }
  return { killed, removed };
}

function sizeOf(path) {
  try {
    const st = lstatSync(path);
    if (!st.isDirectory()) return st.size;
    return readdirSync(path).reduce((n, f) => n + sizeOf(join(path, f)), 0);
  } catch {
    return 0;
  }
}

// What is using /tmp: the largest entries (hidden ones included), and files
// already deleted but still held open by a process, which only df can see.
export function tmpReport() {
  const mb = (b) => Math.round(b / 1048576);
  const entries = readdirSync(TMP).map((n) => [n, sizeOf(join(TMP, n))]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const held = [];
  for (const pid of readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    let fds = [];
    try { fds = readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    let bytes = 0, count = 0;
    for (const fd of fds) {
      try {
        const target = readlinkSync(`/proc/${pid}/fd/${fd}`);
        if (target.startsWith(TMP) && target.endsWith('(deleted)')) { bytes += statSync(`/proc/${pid}/fd/${fd}`).size; count++; }
      } catch { /* closed meanwhile */ }
    }
    if (count) {
      let cmd = '';
      try { cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')[0]; } catch { /* gone */ }
      held.push(`pid ${pid}${Number(pid) === process.pid ? ' (this process)' : ''} ${cmd}: ${count} deleted files, ${mb(bytes)} MB`);
    }
  }
  return `largest in /tmp: ${entries.map(([n, b]) => `${n} ${mb(b)} MB`).join(', ')}; held open after deletion: ${held.length ? held.join('; ') : 'none'}`;
}
