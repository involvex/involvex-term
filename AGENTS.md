# AGENTS.md — involvex-term

Git-aware desktop terminal (Electron + TypeScript + Bun + xterm.js + node-pty).
Dark theme `#1e1e1e / #cccccc`. Settings live at `~/.involvex-term/settings.json`.

## Commands (Bun only — never npm/yarn/pnpm)

```powershell
bun install               # postinstall only applies the node-pty Spectre patch
bun run dev                # dev (vite + Electron)
bun run rebuild           # FORCE full node-pty rebuild (slow, rarely needed)
bun run build             # tsc + vite + node-pty rebuild + electron-builder + link-latest
bun run build:store       # Store APPX/MSIX (docs/STORE.md; needs store-identity.env)
bun run publish:store     # upload .msix draft (--noCommit); first IARC must be Partner Center
bun run commit:store      # msstore submission publish after age ratings exist
bun run link:latest       # release/latest → current win-unpacked (junction)
bun run link:desktop      # Desktop Involvex-Term.lnk → release/latest/involvex-term.exe
bunx tsc --noEmit         # ground truth for types (opencode LSP reports false electron errors)
bun scripts/test-osc7.mjs # OSC7/CWD end-to-end test (run under Electron)
bun scripts/generate-icon.mjs  # regenerate public/icon.png + icon.ico
```

OpenCode: TabBar **OC** / `Ctrl+Shift+O` / palette writes `opencode` into the
focused pane; footer **OC** click continues with `opencode -s <id>` (requires
`opencode` on PATH). Vertical split: `Shift+Alt+V`.

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
  TabBar / PaneLayout (grid)     →  ptyManager.ts (node-pty, 1 pty per paneId)
  TerminalView (xterm, per pane) ←  gitEngine.ts (simple-git) + sysEngine.ts
  StatusBar (GitWidget/SysWidget)   pty:data channels keyed by pane id
  SettingsModal + useSettings    ↔  settingsStore.ts (zod, watched file)
  Tab hotkeys (Ctrl+Shift+T…)    ←  hotkeys.ts (Menu accelerators) + tab:action
  Tray (Show/NewTab/Settings)    ←  tray.ts
```

- CWD tracking: PowerShell / cmd / WSL / Linux bash+zsh hooks injected via
  spawn args (or ZDOTDIR for zsh) emit OSC 7 / 9;9 per prompt;
  `cwdTracker.ts` sniffs + decodes it. Never `pty.write()` init code into
  a live shell (it echoes visibly).
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
- Split panes: binary tree per tab (`src/lib/panes.ts`), rendered FLAT on a
  CSS grid with stable pane-id keys — never nest TerminalViews, or closing
  one pane remounts (and resets) the survivors.
- Settings schema changes must stay backward compatible (zod defaults) —
  mirror them in `src/types.ts` AppSettings + `src/App.tsx` DEFAULT_SETTINGS.
- Agent env hooks (`agent.envHooks`, off by default): optional
  `INVOLVEX_TERM_*` / `TERM_PROGRAM` injection on PTY spawn via
  `electron/envHooks.ts` — no in-app AI chat.
- Don't commit `dist/`, `dist-electron/`, `release/`, `build/`, `.npmrc`
  (all gitignored). Do commit `bun.lock`, `public/icon.*`, `scripts/`.
- Commit style: `feat:` / `fix:` / `build:` with scope in body, e.g.
  `git commit -m "feat: tray menu" -m "- bullet details"`.

## Cloud agents (Linux)

Agents run on Ubuntu. Bun is on `PATH` (`~/.bun/bin`, linked at
`/usr/local/bin/bun`). Install dependencies with
`bun install --frozen-lockfile`.

If `node_modules/electron/dist/electron` is missing, download it with
`node node_modules/electron/install.js`.

`node-pty` has no Linux prebuild. `bun run rebuild` compiles it for
Electron's ABI before a pane can spawn a shell. The rebuild script uses
the first Python that can `import distutils.version`. On Ubuntu 24.04
that is Python 3.12 when `python3-setuptools` is installed.

`bun run dev` starts Vite at `http://localhost:5173/` and opens
the Electron window. A display is required. The Linux shell profile is
`$SHELL --login` (bash/zsh). OSC 7 cwd tracking is injected for
PowerShell, cmd, WSL, and Linux bash/zsh via spawn args / ZDOTDIR —
never `pty.write()` into a live shell. Custom shells must emit OSC 7
themselves for live footer Git / session cwd.

```bash
bunx tsc --noEmit
bun run lint
bun run format:check
```

## Current work

See `ROADMAP.md` (**Now**: FEAT-028 inline diff preview). Microsoft Store
listing live: https://apps.microsoft.com/detail/9NBNBH9CJ507
(`9NBNBH9CJ507`). Dual-channel NSIS + Store APPX; Store updates via
`bun run build:store` / `publish:store`. See `docs/STORE.md`.

## Learned preferences

- Dual-channel: keep GitHub NSIS + Store APPX; do not run `msstore init` (Bun).

## Learned workspace facts

- Store identity: `Einzelunternehmen.InvolvexTerm` /
  `CN=50777D18-6AA9-43B0-9CE5-BB776BC9514F` / PublisherDisplayName `involvex`
- Store ID `9NBNBH9CJ507` · PFN `Einzelunternehmen.InvolvexTerm_nk2dxr82q950t`
- Live: https://apps.microsoft.com/detail/9NBNBH9CJ507
- Protocol: `ms-windows-store://pdp/?productid=9NBNBH9CJ507`
- Local identity file: `store-identity.env` (gitignored); template
  `store-identity.example.env`
