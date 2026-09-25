import os from "node:os";
import { createRequire } from "node:module";
import type { SysStats } from "./types.js";

// Main process is bundled as ESM — bare `require` is undefined there.
const require = createRequire(import.meta.url);

let si: typeof import("systeminformation") | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  si = require("systeminformation") as typeof import("systeminformation");
} catch {
  si = null;
}

export async function getSysStats(): Promise<SysStats> {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  let cpuPercent = 0;
  try {
    if (si) {
      const load = await si.currentLoad();
      cpuPercent = Math.round(load.currentLoad ?? 0);
    } else {
      const cpus = os.cpus();
      const idle = cpus.reduce((a, c) => a + c.times.idle, 0) / cpus.length;
      const tot =
        cpus.reduce(
          (a, c) =>
            a +
            c.times.user +
            c.times.nice +
            c.times.sys +
            c.times.idle +
            c.times.irq,
          0,
        ) / cpus.length;
      cpuPercent = tot > 0 ? Math.round(100 - (100 * idle) / tot) : 0;
    }
  } catch {
    cpuPercent = 0;
  }
  const GB = 1024 ** 3;
  return {
    cpuPercent,
    memUsedGB: Math.round((used / GB) * 10) / 10,
    memTotalGB: Math.round((total / GB) * 10) / 10,
    memPercent: total > 0 ? Math.round((100 * used) / total) : 0,
    uptimeSec: Math.floor(os.uptime()),
  };
}
