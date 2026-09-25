# Roadmap — involvex-term

Living product plan. Positioning: **Windows Terminal parity where it matters**,
plus **Git + OpenCode differentiators** — not a clone of every WT setting.

Track progress by moving items into CHANGELOG when shipped.

## Done / shipping

- Tabs, split panes (horizontal + vertical), find, command palette
- Session restore, tray, quake dropdown
- Git footer (branch, dirty, ahead/behind, stash) + live OSC7 cwd
- OpenCode launch, PATH detect, footer status, click-to-continue
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
3. Optional AI-agnostic env hooks only (no competing chat UI)

## Explicitly out of scope

- Built-in SSH session manager (use `ssh` in the shell)
- Broadcast input to all panes
- Built-in AI chat that duplicates OpenCode
- Signed / notarized macOS builds until Apple certs exist
