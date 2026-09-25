/* eslint-disable no-control-regex */
import { setCwd } from "./ptyManager.js";

// OSC 7: ESC ] 7 ; file://hostname/path ST  (ST = BEL \x07 or ESC \)
// Also supports OSC 633 (VS Code style) as fallback.
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const OSC633_RE = /\x1b\]633;P;Cwd=([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

function decodeOscPath(p: string): string {
  let s: string;
  try {
    s = decodeURIComponent(p.trim());
  } catch {
    s = p.trim();
  }
  if (process.platform === "win32") {
    // Normalize all separators first: handles /C:/..., /C:\...,
    // C%3A%5C... (our pwsh hook emits %5C-escaped backslashes) uniformly.
    s = s.replace(/\//g, "\\");
    // Strip stray leading backslash before drive letter: \C:\x -> C:\x
    s = s.replace(/^\\([A-Za-z]:\\)/, "$1");
  }
  return s;
}

/** Scan pty output for OSC7, update cwd, return cleaned output (OSC stripped). */
export function sniffCwd(
  tabId: string,
  data: string,
  onChange?: (tabId: string, cwd: string) => void,
): string {
  let cwd: string | null = null;
  let m: RegExpExecArray | null;
  OSC7_RE.lastIndex = 0;
  while ((m = OSC7_RE.exec(data)) !== null) {
    cwd = decodeOscPath(m[1] ?? "");
  }
  OSC633_RE.lastIndex = 0;
  while ((m = OSC633_RE.exec(data)) !== null) {
    cwd = decodeOscPath(m[1] ?? "");
  }
  if (cwd) {
    setCwd(tabId, cwd);
    onChange?.(tabId, cwd);
  }
  // Strip OSC sequences so xterm doesn't render garbage
  return data
    .replace(/\x1b\]7;file:\/\/[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\]633;P;Cwd=[^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}
