# AGENTS.md — involvex-term

Git-aware desktop terminal (Electron + TypeScript + Bun + xterm.js + node-pty).
Dark theme `#1e1e1e / #cccccc`. Settings live at `~/.involvex-term/settings.json`.

## Commands (Bun only — never npm/yarn/pnpm)

```powershell
bun install               # postinstall only applies the node-pty Spectre patch
bun run dev:electron      # dev (vite + Electron)
bun run rebuild           # rebuild node-pty for Electron ABI (self-sufficient, see below)
bun run build             # tsc + vite + node-pty rebuild + electron-builder (outputs release/)
bunx tsc --noEmit         # ground truth for types (opencode LSP reports false electron errors)
bun scripts/test-osc7.mjs # OSC7/CWD end-to-end test (run under Electron)
bun scripts/generate-icon.mjs  # regenerate public/icon.png + icon.ico
```

Windows + PowerShell. No `rm -rf` (use `Remove-Item`), no `ls` (use `dir`/`Get-ChildItem`).

## Native build gotchas (node-pty)

- `node-gyp@9` needs CPython ≤ 3.11 (`distutils`). `scripts/rebuild-pty.mjs`
  auto-discovers one ($PYTHON → .npmrc → pyenv-win → PATH). Do NOT upgrade
  node-gyp to v10+ (silently incompatible with electron-rebuild@3).
- `scripts/patch-node-pty.mjs` strips `SpectreMitigation` from node-pty's gyp
  files (stock VS lacks Spectre libs → MSB8040). Runs in postinstall + rebuild.
- `electron-builder.json5` sets `npmRebuild: false` — packaging never rebuilds
  on its own; the `build` script rebuilds explicitly first.
- If `node_modules/electron/dist/electron.exe` is missing (bun's installer
  sometimes extracts incompletely), re-run `node node_modules/electron/install.js`.

## Architecture

```
Renderer (React, src/)              Main (electron/)
  TabBar / TerminalView (xterm)  →  ptyManager.ts (node-pty, 1 pty per tabId)
  StatusBar (GitWidget/SysWidget)←  gitEngine.ts (simple-git) + sysEngine.ts
  SettingsModal + useSettings    ↔  settingsStore.ts (zod, watched file)
  Tab hotkeys (Ctrl+Shift+T…)    ←  hotkeys.ts (Menu accelerators) + tab:action
  Tray (Show/NewTab/Settings)    ←  tray.ts
```

- CWD tracking: PowerShell `prompt` wrapper injected via `-NoExit -Command`
  spawn args emits OSC 7 per prompt; `cwdTracker.ts` sniffs + decodes it.
  Never `pty.write()` init code into a live shell (it echoes visibly).
- Main process is bundled ESM: no bare `require()` — use
  `createRequire(import.meta.url)` for `node-pty` / `systeminformation`
  (kept external in `vite.config.ts`).
- IPC via `window.termApi` (see `electron/preload.ts` + `src/types.ts`).
  PTY data channels are per-tab: `pty:data-${id}` / `pty:exit-${id}`.
- `spawnPty` must never receive an invalid cwd (Windows error 267) —
  it falls back to `os.homedir()` after `existsSync` check.

## Conventions

- `bunx tsc --noEmit` must be clean before any commit; ignore stale
  opencode LSP diagnostics about `electron` module declarations.
- Copy/paste semantics (Windows Terminal style): Ctrl+C copies only with a
  selection, otherwise passes ^C through; right-click copies selection or pastes.
- Settings schema changes must stay backward compatible (zod defaults) —
  mirror them in `src/types.ts` AppSettings + `src/App.tsx` DEFAULT_SETTINGS.
- Don't commit `dist/`, `dist-electron/`, `release/`, `build/`, `.npmrc`
  (all gitignored). Do commit `bun.lock`, `public/icon.*`, `scripts/`.
- Commit style: `feat:` / `fix:` / `build:` with scope in body, e.g.
  `git commit -m "feat: tray menu" -m "- bullet details"`.
