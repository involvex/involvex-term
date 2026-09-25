# Changelog

All notable changes to this project are documented in this file.

## [0.4.0] - Unreleased

### Added

- In-app update check via `electron-updater` (GitHub Releases; packaged installs)
- Command snippets in Settings + “Run: …” entries in the command palette
- Export / import settings JSON from Settings
- Clear buffer (`Ctrl+Shift+K`), mark prompt (`Ctrl+Shift+M`), jump marks
  (`Ctrl+Shift+Up/Down`)
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

## [0.1.1] - Unreleased

### Added

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
