# involvex-term — Git-aware terminal

Minimalist dark-themed Git-aware terminal: Electron + TypeScript + Bun + xterm.js + node-pty.

## Features

- xterm.js dark theme (`#1e1e1e / #cccccc`), fit + web-links
- node-pty OS shell (pwsh/PowerShell on Windows, zsh/bash elsewhere)
- Footer status bar:
  - Left: Git `⎇ branch ●count ↑ahead ↓behind ⚑stash` (dirty/staged/untracked)
  - Right: PC stats `CPU % | MEM used/total %`
- Tabs like Windows Terminal: `Ctrl+Shift+T/W`, `Ctrl+Tab`, `Ctrl+1..9`, `Ctrl+Shift+D`
- Windows Terminal style copy/paste: `Ctrl+C` copies only with selection
  (plain `Ctrl+C` still interrupts), `Ctrl+V` pastes, right-click copies
  selection or pastes
- Remembers window size/position; minimize/close to system tray (configurable)
- Custom app icon (`public/icon.png`/`.ico`, generated via
  `bun scripts/generate-icon.mjs`)
- Customizable via `~/.involvex-term/settings.json` + in-app Settings (`Ctrl+,`):
  theme, font, footer modules on/off, refresh interval, hotkeys
- Git engine: OSC7 CWD tracking + `simple-git` + `chokidar` on `.git/HEAD,index,refs`

## Quickstart (Bun, PowerShell)

```powershell
bun install
bun run dev:electron   # vite dev + electron (use default `vite` runner)
# or web-only preview:
bun run dev
```

Build:

```powershell
bunx tsc --noEmit
bun run build          # tsc + vite + electron-builder
```

## Native module note (node-pty)

`node-pty` needs an Electron ABI rebuild (`bun run rebuild`).
Two gotchas are already handled in this repo:

1. **Python version**: the pinned `node-gyp@9` (via `electron-rebuild@3`)
   imports `distutils`, which was removed in Python 3.12 — so the build
   needs Python ≤ 3.11. (`pip install distutils` cannot fix this.)
   One-time setup on Windows + pyenv-win:
   ```powershell
   [Environment]::SetEnvironmentVariable('PYTHON', 'C:\Users\lukas\.pyenv\pyenv-win\versions\3.10.11\python.exe', 'User')
   # restart the shell afterwards so the variable propagates to child processes
   ```
   `.npmrc` pins the same path as a fallback for npm-based flows.
   (Upgrading to node-gyp 10+ was tried — it supports new Pythons but is
   silently incompatible with `electron-rebuild@3`, so v9 stays.)
2. **MSB8040 (Spectre libs)**: node-pty's gyp files request
   Spectre-mitigated libs which most VS installs lack. `scripts/patch-node-pty.mjs`
   (runs automatically in `postinstall`) strips that flag from
   `binding.gyp` + `deps/winpty/src/winpty.gyp`, restoring the previous
   effective behavior for local dev builds.

Troubleshooting:
- `pty.vcxproj` / MSB3202 errors: delete `node_modules/node-pty/build` and
  rebuild — stale half-generated build dirs cause it.
- "Electron failed to install correctly": bun's electron postinstall sometimes
  extracts incompletely. Re-run `node node_modules/electron/install.js`, or
  manually expand the cached
  `%LOCALAPPDATA%/electron/Cache/*/electron-v*-win32-x64.zip` into
  `node_modules/electron/dist` and write `electron.exe` into `path.txt`.

## Settings

Stored at `~/.involvex-term/settings.json` (auto-created, zod-validated):

```json
{
  "theme": { "bg": "#1e1e1e", "fg": "#cccccc", "fontFamily": "...", "fontSize": 14 },
  "footer": { "showGit": true, "showSys": true, "showCpu": true, "showMem": true, "modulesOrder": ["git", "sys"], "refreshMs": 1500 },
  "hotkeys": { "new-tab": "Ctrl+Shift+T", "close-tab": "Ctrl+Shift+W", "...": "..." },
  "tabs": { "confirmClose": false }
}
```

File is watched — external edits apply live.

## Project structure

```
electron/
  main.ts          IPC + window + watchers
  preload.ts       window.termApi bridge
  ptyManager.ts    node-pty multi-tab
  cwdTracker.ts    OSC7 parser
  gitEngine.ts     simple-git status (cached, debounced)
  sysEngine.ts     CPU/MEM via systeminformation
  settingsStore.ts ~/.involvex-term/settings.json (zod)
  hotkeys.ts       Menu accelerators from settings
src/
  App.tsx              tabs + git/sys/settings orchestration
  components/TerminalView.tsx TabBar.tsx StatusBar.tsx SettingsModal.tsx
  types.ts
```
