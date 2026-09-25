import os from "node:os";
import fs from "node:fs";
import { createRequire } from "node:module";
import type * as Pty from "node-pty";

// Main process is bundled as ESM — bare `require` is undefined there.
const require = createRequire(import.meta.url);

export interface PtyEntry {
  id: string;
  pty: Pty.IPty;
  cwd: string;
  shell: string;
}

const entries = new Map<string, PtyEntry>();

/**
 * PowerShell init ran via `-NoExit -Command` BEFORE the first prompt is
 * painted, so it never echoes visibly into the terminal (unlike writing
 * init code into the live pty, which races shell startup and leaks).
 * Profiles load before `-Command`, so this wraps the user's final `prompt`
 * (default, oh-my-posh, posh-git, …) and emits OSC 7 with the CWD on every
 * prompt — that's what cwdTracker sniffs for continuous Git tracking.
 */
export const PWSH_OSC7_INIT =
  "$__it_pb=(Get-Item function:prompt -EA SilentlyContinue).ScriptBlock;" +
  "function global:prompt{" +
  "try{[Console]::Write([char]27+']7;file://localhost/'+[uri]::EscapeDataString($PWD.Path)+[char]7)}catch{};" +
  "if($__it_pb){&$__it_pb}else{'PS '+$PWD.Path+'> '}}";

function lazyPty(): typeof Pty | null {
  try {
    return require("node-pty") as typeof Pty;
  } catch (e) {
    console.error(
      "[ptyManager] node-pty not available (needs electron-rebuild):",
      e,
    );
    return null;
  }
}

export function resolveShell(): { shell: string; args: string[] } {
  const platform = process.platform;
  if (platform === "win32") {
    const pwsh = `${process.env["SystemRoot"] ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    const candidates = [
      process.env["INVOLVEX_SHELL"] ?? process.env["INVOVEX_SHELL"],
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      pwsh,
      "cmd.exe",
    ].filter(Boolean) as string[];
    const shell =
      candidates.find((c) => {
        try {
          return fs.existsSync(c);
        } catch {
          return false;
        }
      }) ?? "powershell.exe";
    // PowerShell: run OSC7 prompt hook before first paint (no echo leak).
    // cmd.exe: no reliable per-prompt OSC support — plain spawn.
    const isPwsh =
      /pwsh(\.exe)?$/i.test(shell) || /powershell(\.exe)?$/i.test(shell);
    return isPwsh
      ? { shell, args: ["-NoLogo", "-NoExit", "-Command", PWSH_OSC7_INIT] }
      : { shell, args: [] };
  }
  const shell =
    process.env["SHELL"] || (platform === "darwin" ? "/bin/zsh" : "/bin/bash");
  return { shell, args: ["--login"] };
}

export function spawnPty(
  id: string,
  cwd: string,
  cols: number,
  rows: number,
): PtyEntry {
  const mod = lazyPty();
  const { shell, args } = resolveShell();
  // Never pass an invalid cwd to node-pty: Windows reports it as
  // "Cannot create process, error code: 267" (ERROR_DIRECTORY).
  let home = cwd || os.homedir();
  try {
    if (!fs.existsSync(home) || !fs.statSync(home).isDirectory()) {
      home = os.homedir();
    }
  } catch {
    home = os.homedir();
  }
  if (!mod)
    throw new Error(
      "node-pty native module unavailable. Run: bun run rebuild (requires Python 3.11 + VS Build Tools).",
    );
  const pty = mod.spawn(shell, args, {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: home,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    } as Record<string, string>,
  });
  const entry: PtyEntry = { id, pty, cwd: home, shell };
  entries.set(id, entry);
  return entry;
}

export function getPty(id: string): PtyEntry | undefined {
  return entries.get(id);
}

export function killPty(id: string): void {
  const e = entries.get(id);
  if (!e) return;
  try {
    e.pty.kill();
  } catch {
    /* noop */
  }
  entries.delete(id);
}

export function listPtys(): string[] {
  return [...entries.keys()];
}

export function setCwd(id: string, cwd: string): void {
  const e = entries.get(id);
  if (e) e.cwd = cwd;
}
