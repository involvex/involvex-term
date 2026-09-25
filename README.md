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
bun install               # postinstall only applies the node-pty Spectre patch
bun run dev:electron      # dev (vite + Electron)
bun run rebuild           # FORCE full node-pty rebuild (slow, rarely needed)
bun run build             # tsc + vite + node-pty rebuild (skipped if up-to-date) + electron-builder
```

Build:

```powershell
bunx tsc --noEmit
bun run build          # tsc + vite + electron-builder
```

## Native module note (node-pty)

`bun run rebuild` / `bun run build` handle the Electron ABI rebuild
automatically via `scripts/rebuild-pty.mjs`, which picks a working Python
itself (`$PYTHON` → `.npmrc` pin → pyenv-win ≤ 3.11 → PATH probe).

Background (why the wrapper exists):

1. **Python version**: the pinned `node-gyp@9` (via `electron-rebuild@3`)
   imports `distutils`, removed in Python 3.12 — so the build needs
   CPython ≤ 3.11. (`pip install distutils` cannot fix this.)
   (node-gyp 10+ supports new Pythons but is silently incompatible with
   `electron-rebuild@3`, so v9 stays.)
2. **MSB8040 (Spectre libs)**: node-pty's gyp files request
   Spectre-mitigated libs which most VS installs lack.
   `scripts/patch-node-pty.mjs` (runs automatically in `postinstall` and
   before every rebuild) strips that flag from `binding.gyp` +
   `deps/winpty/src/winpty.gyp`.
3. **electron-builder rebuild**: disabled via `"npmRebuild": false` — the
   `build` script rebuilds explicitly through the wrapper instead, so
   packaging never depends on ambient shell env.

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
	"theme": {
		"bg": "#1e1e1e",
		"fg": "#cccccc",
		"fontFamily": "...",
		"fontSize": 14
	},
	"footer": {
		"showGit": true,
		"showSys": true,
		"showCpu": true,
		"showMem": true,
		"modulesOrder": ["git", "sys"],
		"refreshMs": 1500
	},
	"hotkeys": {
		"new-tab": "Ctrl+Shift+T",
		"close-tab": "Ctrl+Shift+W",
		"...": "..."
	},
	"tabs": {"confirmClose": false}
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
