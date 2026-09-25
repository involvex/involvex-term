# Changelog

All notable changes to this project are documented in this file.

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
