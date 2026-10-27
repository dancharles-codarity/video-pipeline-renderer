// Housekeeping for warm serverless instances. Vercel keeps an instance alive
// between calls, and a call that is killed mid-render (the duration limit)
// never runs its own cleanup: its Chromium keeps running, holding memory and
// its shared-memory files in /tmp. /tmp is 512 MB and the unpacked Chromium
// takes 200 MB of it, so a few orphans fill it and every later launch crashes.
// The service renders one job at a time per instance, so at the start of a job
// nothing of ours should be running and anything left over can go.
import { readdirSync, readFileSync, rmSync, statfsSync } from 'node:fs';
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
