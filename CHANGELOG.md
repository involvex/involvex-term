# Changelog

## [0.6.1] - 2026-09-29

### Added

- TypeScript CLI built with bun --target node, upgrade/uninstall, npm publish CI
- @involvex/term CLI, wt-style sp/nt, cmd/WSL cwd, chunk-safe OSC
- split panes inherit live cwd, About menu
- add comprehensive unit test suite using bun test
- agent-aware pane labels from OpenCode sessions
- optional AI-agnostic agent env hooks on PTY spawn

### Changed

- docs: show agent integration on GitHub Pages
- style(updater): convert CRLF line endings to LF
- chore: normalize line endings in updater module
- docs: expand v0.6.0 changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Agent-aware pane labels: tab + pane chrome show OpenCode session titles when
  a pane matches a listed session (cwd or launch/continue binding); busy/idle
  from recent `updated`; clears when the session leaves the list. Toggle:
  Settings → Agent → Pane labels (`agent.showPaneLabels`, default on)
- Optional AI-agnostic agent env hooks on PTY spawn (Settings → Agent):
  `TERM_PROGRAM`, `INVOLVEX_TERM_*`, and `INVOLVEX_TERM_CONTEXT` JSON for
  OpenCode / other agent CLIs — no in-app chat UI
- Docs site: agent split screenshot + Agent integration section (OpenCode,
  pane labels, env hooks) with links to README details

### Changed

- Docs / README: point visitors at GitHub Pages screenshots for agent UI

## [0.6.0] - 2026-09-28

### Added

- Settings sync via private GitHub Gist (Device Flow login, Push / Pull)
- Tabbed Settings UI (Appearance, Terminal, Hotkeys, Status, Window, Agent, Sync)

### Fixed

- SSH arrow keys echoing as `^[[A` / `^[[1;2D` (bundled ConPTY DLL)
- New-tab `[?1;2c` / tiny PTY spawn size crashing PSReadLine
- Sync UI treating signed-in users as unlinked until first gist push
- bump action-gh-release for large asset uploads

### Changed

- funding links

## [0.5.1] - 2026-09-27

### Added

- release script (tag + changelog + gh release)
- Windows Terminal-style pane context menu
- Footer Git menu: switch branch (local/remote), open repo in Explorer, copy
  remote URL / branch name
- OpenCode multi-session picker in the footer (new, continue last, pick by id)
- context-aware terminal right-click menu
- v0.4 updater, snippets, settings I/O, buffer marks
- v0.3 startup, links, scrollback, mica + release/latest
- v0.2 profiles, tab polish, themes, completion toast
- OpenCode continue and vertical splits
- add prebuild and typecheck scripts to package.json
- integrate OpenCode session management and status display

### Fixed

- Start directory honored on spawn (and deferred first tab until settings load);
  session restore still reuses saved pane cwds — use Startup → “New tab” for
  startDir on every launch
- Quake hotkey: try Grave/Alt/Win fallbacks when Ctrl+` is denied; quieter logs
- Chromium disk cache: dedicated `~/.involvex-term/electron` userData +
  single-instance lock
- startDir race, quake shortcut fallbacks, electron userData

### Changed

- chore: normalize line endings to LF
- style: normalize line endings
- docs: Linux cloud-agent setup notes
- chore: update dependencies
- docs: add product roadmap
- gitignore

## [0.4.0] - 2026-09-25

### Added

- In-app update check via `electron-updater` (GitHub Releases; packaged installs)
- Command snippets in Settings + “Run: …” entries in the command palette
- Export / import settings JSON from Settings
- Clear buffer (`Ctrl+Shift+K`), mark prompt (`Ctrl+Shift+M`), jump marks
  (`Ctrl+Shift+Up/Down`)
- Context-aware terminal right-click menu (open URL/path, reveal in Explorer,
  copy/paste; Shift+right-click keeps quick copy/paste)
- Release workflow uploads `latest.yml` / blockmaps for auto-update

## [0.3.0] - 2026-09-25

### Added

- Startup mode: restore session or open a fresh tab with profile + start dir
- Font fallback list (Nerd Font chain after primary family)
- Scrollback size and scrollbar visibility settings
- Ctrl+click local paths (`D:\…`, UNC, `/home/…`, `file://`) and http(s) links
- Optional Windows 11 mica backdrop (`window.acrylic`)
- `release/latest` junction after build; `bun run link:desktop` for a stable Desktop shortcut

## [0.2.0] - 2026-09-25

### Added

- Shell / profile picker (pwsh, Windows PowerShell, cmd, WSL) via + ▾ and palette
- Tab rename (double-click) and drag-reorder
- Theme presets (involvex, VS Code Dark+, One Dark, Dracula, Solarized Dark)
- Background-pane completion toast (BEL or idle after output)

## [0.5.2] - 2026-09-27

### Added

- tab menu, footer customize, agent CLI swap
- publish Windows Portable.exe on GitHub Releases

### Fixed

- harden release/CI and add GitHub Pages docs

### Changed

- chore: enhance Electron app configuration and GitHub Actions
- chore: downgrade Bun version in CI and release workflows
- chore: update GitHub Actions workflows with permissions
- chore: update GitHub Actions workflows to use latest action versions

- Click footer OpenCode status to continue that session (`opencode -s <id>`)
- Vertical split panes (`Shift+Alt+V`), menu, and command palette entry

## [0.1.0] - 2026-09-25

### Added

- OpenCode launch from the tab bar (`OC`), command palette, menu, and
  `Ctrl+Shift+O` — injects `opencode` into the focused pane
- Detects OpenCode on PATH and disables the button when missing
- OpenCode session status in the footer (title, count, cwd match)
- Native Electron confirm dialog when `tabs.confirmClose` is enabled
- GitHub Actions CI (lint, typecheck, format check)
- GitHub Actions release workflow (Windows NSIS + Linux AppImage on `v*` tags)
- MIT license, app icons (`public/icon.png` / `.ico`)

### Fixed

- `tabs.confirmClose` setting is now honored when closing tabs

### Changed

- Version bumped to 0.1.0; README refreshed for current features
