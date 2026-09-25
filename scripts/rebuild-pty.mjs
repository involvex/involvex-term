// Self-sufficient node-pty rebuild for Electron.
// Problem: node-gyp@9 (via electron-rebuild@3) needs `distutils`, removed in
// Python 3.12+. Instead of requiring every shell to have PYTHON set, this
// script discovers a working Python itself:
//   1. $PYTHON env var (if it has distutils)
//   2. `python=` pin in .npmrc
//   3. pyenv-win versions <= 3.11 (highest first)
//   4. `python3` / `python` on PATH (distutils probe)
// Then it applies the Spectre patch and runs electron-rebuild with the
// resolved interpreter forced via PYTHON / npm_config_python.
// Usage: bun scripts/rebuild-pty.mjs  (also wired into `bun run build`)
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

function probe(python) {
  if (!python) return false;
  try {
    const exe = python.endsWith(".exe") ? python : python;
    fs.accessSync(exe, fs.constants.X_OK);
    execFileSync(exe, ["-c", "import distutils.version"], {
      stdio: "ignore",
      timeout: 30000,
    });
    return true;
  } catch {
    return false;
  }
}

function npmrcPython() {
  try {
    const rc = fs.readFileSync(path.join(ROOT, ".npmrc"), "utf8");
    const m = rc.match(/^\s*python\s*=\s*(.+?)\s*$/m);
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function pyenvCandidates() {
  const roots = [
    process.env.PYENV_ROOT,
    path.join(os.homedir(), ".pyenv", "pyenv-win"),
  ].filter(Boolean);
  const found = [];
  for (const root of roots) {
    const versions = path.join(root, "versions");
    let dirs;
    try {
      dirs = fs.readdirSync(versions);
    } catch {
      continue;
    }
    for (const d of dirs) {
      const m = d.match(/^(\d+)\.(\d+)\.(\d+)/);
      if (!m) continue;
      const major = Number(m[1]);
      const minor = Number(m[2]);
      if (major !== 3 || minor > 11) continue; // distutils only <= 3.11
      const exe = path.join(versions, d, "python.exe");
      found.push({ exe, rank: minor * 1000 + Number(m[3]) });
    }
  }
  return found.sort((a, b) => b.rank - a.rank).map((f) => f.exe);
}

function pathCandidates() {
  const out = [];
  for (const name of ["python3", "python"]) {
    try {
      const which =
        process.platform === "win32"
          ? execFileSync("where", [name], { encoding: "utf8" })
          : execFileSync("which", [name], { encoding: "utf8" });
      const first = which.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first) out.push(first);
    } catch {
      /* not on PATH */
    }
  }
  return out;
}

const candidates = [
  process.env.PYTHON,
  npmrcPython(),
  ...pyenvCandidates(),
  ...pathCandidates(),
].filter(Boolean);

const seen = new Set();
const python = candidates.find((c) => {
  if (seen.has(c)) return false;
  seen.add(c);
  return probe(c);
});

if (!python) {
  console.error(
    "[rebuild-pty] no Python with `distutils` found (need CPython <= 3.11).",
  );
  console.error(
    "[rebuild-pty] Checked: $PYTHON, .npmrc, pyenv-win versions, PATH.",
  );
  console.error(
    "[rebuild-pty] Install Python 3.10/3.11 (e.g. `pyenv install 3.10.11`) and re-run.",
  );
  process.exit(1);
}
console.log(`[rebuild-pty] using Python: ${python}`);

// 1. Spectre patch (idempotent)
const patch = spawnSync(process.execPath, ["scripts/patch-node-pty.mjs"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: false,
});
if (patch.status !== 0) process.exit(patch.status ?? 1);

// 2. Rebuild with forced interpreter
const env = {
  ...process.env,
  PYTHON: python,
  npm_config_python: python,
};
function runPkg(bin, args) {
  return spawnSync(bin, args, { cwd: ROOT, stdio: "inherit", env });
}
let build = runPkg("bun", ["x", "electron-rebuild", "-f", "-w", "node-pty"]);
if (build.error?.code === "ENOENT") {
  console.log("[rebuild-pty] `bun` not found, falling back to `npx`");
  build = runPkg("npx", ["electron-rebuild", "-f", "-w", "node-pty"]);
}
if (build.error) {
  console.error(`[rebuild-pty] failed to launch rebuild: ${build.error.message}`);
  process.exit(1);
}
process.exit(build.status ?? 1);
