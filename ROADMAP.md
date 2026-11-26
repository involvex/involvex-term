# Roadmap — involvex-term

Living product plan. Positioning: **Windows Terminal parity where it matters**,
plus **Git + OpenCode differentiators** — not a clone of every WT setting.

Track progress by moving items into CHANGELOG when shipped.

## Done / shipping

- Tabs, split panes (horizontal + vertical), find, command palette
- Session restore, tray, quake dropdown
- Git footer (branch, dirty, ahead/behind, stash) + live OSC7 cwd
- OpenCode launch, PATH detect, footer status, click-to-continue
- Agent-aware pane/tab labels from OpenCode session list (busy/idle cue)
- Explorer “Open in involvex-term” (classic HKCU + sparse MSIX path for Win11
  top-level; Authenticode for zero-friction modern menu still follow-up) +
  `involvex-term doctor` common-issue checks
- CI (lint / tsc / format) + GitHub Releases (Windows NSIS, Linux AppImage)
- Settings file (`~/.involvex-term/settings.json`), native confirm-on-close
- Shell / profile picker, tab rename + drag-reorder, theme presets,
  background-pane completion toast (v0.2)

## v0.2 — Daily driver polish

Shipped in tree (see CHANGELOG 0.2.0 unreleased):

1. ~~Shell / profile picker~~
2. ~~Tab rename + drag-reorder~~
3. ~~Theme presets~~
4. ~~Background-pane completion bell~~

## v0.3 — Windows Terminal parity core

1. ~~Startup actions (profile + start dir on launch)~~
2. ~~Cascadia / Nerd Font defaults + font fallback list~~
3. ~~Scrollbar visibility and scrollback size settings~~
4. ~~URL / path Ctrl+click (web-links + local paths)~~
5. ~~Optional mica backdrop on Windows 11~~
6. ~~Stable `release/latest` junction + desktop shortcut~~

## v0.4 — Power user

1. ~~In-app update check (`electron-updater` → GitHub Releases)~~
2. ~~Command snippets / quick-run entries in the palette~~
3. ~~Export / import settings~~
4. ~~Marked prompts / clear-buffer actions~~

## v0.5 — Beyond Windows Terminal

1. ~~Footer Git actions (branch menu, open in Explorer, copy remote)~~
2. ~~OpenCode multi-session picker~~
3. ~~Optional AI-agnostic env hooks only (no competing chat UI)~~
4. ~~Agent-aware pane labels (session title on tab/pane chrome)~~

## v0.9 — Instant feel

1. ~~Lazy pane hydration (spawn only on first focus of active-tab panes)~~
2. ~~Palette v2 speed (MRU + ranked fuzzy + sessions/branches)~~
3. ~~Buffer flood smoothness (frame budget + optional WebGL)~~
4. ~~Git footer honesty (pending state on pane switch)~~
5. ~~Update UX polish (About progress + download/install)~~

## v0.9.2 — Config + Distribution

1. ~~In-app shell profile editor (CRUD, reorder, command/args)~~
2. ~~Per-profile environment variables~~
3. ~~Terminal cursor style setting (block / underline / bar)~~
4. ~~Footer module order controls in Settings~~
5. ~~Win11 modern Explorer menu via IExplorerCommand + sparse MSIX (#12);
   classic HKCU remains default fallback; Authenticode signing optional~~

## Git you can act on (shipped in v0.9.3)

1. ~~Footer Git actions: fetch / pull (`--ff-only`) / push / stash / stash pop~~
2. ~~Read-only Changes list (`name-status`) in the Git footer menu~~
3. ~~Live OSC 7 cwd for Linux bash and zsh (footer + session honesty)~~

## v0.10 — Shell memory

1. Recent directories MRU (OSC 7) in new-tab ▾ menu + palette
2. App clipboard history ring (`Ctrl+Shift+V`; Win+V untouched; persist opt-in)
3. Recent commands in palette (app-written + OSC 633; Ctrl+R stays with the shell)
4. Import / export shell profiles independently of full settings

## v0.11 — Microsoft Store

1. Dual-channel Windows: GitHub NSIS + Store APPX/MSIX (`bun run build:store`)
2. Store runtime: no GitHub auto-update, safer close-to-tray default, privacy page
3. WACK hardening: remove raw `ipcRenderer` bridge, CSP, navigation deny, DevTools gated
4. See `docs/STORE.md` for Partner Center reservation + `msstore publish`

## Explicitly out of scope

- Built-in SSH session manager (use `ssh` in the shell)
- Broadcast input to all panes
- Built-in AI chat that duplicates OpenCode
- Signed / notarized macOS builds until Apple certs exist
