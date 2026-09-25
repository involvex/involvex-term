// Validates: pwsh -NoExit -Command <OSC7 hook> emits OSC7 with CWD on first
// prompt WITHOUT echoing the init code into the terminal.
/* eslint-disable no-control-regex -- OSC7 sequences are control chars by design */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pty = require("node-pty");

const pwsh7 = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
const shell = fs.existsSync(pwsh7) ? pwsh7 : "powershell.exe";

const INIT =
  "$__it_pb=(Get-Item function:prompt -EA SilentlyContinue).ScriptBlock;" +
  "function global:prompt{" +
  "try{[Console]::Write([char]27+']7;file://localhost/'+[uri]::EscapeDataString($PWD.Path)+[char]7)}catch{};" +
  "if($__it_pb){&$__it_pb}else{'PS '+$PWD.Path+'> '}}";

let out = "";
const p = pty.spawn(shell, ["-NoLogo", "-NoExit", "-Command", INIT], {
  name: "xterm-256color",
  cols: 80,
  rows: 24,
  cwd: "D:\\repos\\involvex\\involvex-term",
});
p.onData((d) => {
  out += d;
});

setTimeout(() => {
  const hasOsc7 = out.includes("]7;file://");
  const leaksInit = out.includes("__it_pb") || out.includes("EscapeDataString");
  // Extract emitted path: ESC ] 7 ; file://host PATH BEL
  // Same capture semantics as electron/cwdTracker.ts OSC7_RE: terminator excluded
  const m = out.match(/\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/);
  let decoded = "";
  if (m) {
    const raw = m[1] ?? "";
    try {
      decoded = decodeURIComponent(raw).replace(/\//g, "\\").replace(/^\\([A-Za-z]:\\)/, "$1");
    } catch {
      decoded = raw;
    }
  }
  console.log("OSC7_EMITTED:" + hasOsc7);
  console.log("INIT_LEAKED:" + leaksInit);
  console.log("DECODED_CWD:" + decoded);
  console.log("CWD_VALID:" + fs.existsSync(decoded));
  p.kill();
  process.exit(hasOsc7 && !leaksInit ? 0 : 1);
}, 12000);
