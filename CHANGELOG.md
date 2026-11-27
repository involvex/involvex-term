# Changelog

## [Unreleased]

### Changed

- Docs: Microsoft Store listing is live
  (https://apps.microsoft.com/detail/9NBNBH9CJ507); dual-channel install CTAs
  on README / docs site; ROADMAP v0.11 marked shipped

## [0.10.0] - 2026-11-22

### Added

- Recent directories MRU from OSC 7 (new-tab ▾ menu + palette “New tab in …”)
- App clipboard history ring (`Ctrl+Shift+V` cycles; Win+V untouched; optional
  persist across restarts, off by default)
- Recent commands in the palette (snippets / agent writes + OSC 633 shell
  integration; Ctrl+R stays with the shell; Enter inserts without auto-run)
- Import / export shell profiles independently of full settings

### Changed

- Docs: ROADMAP v0.10 shell memory; suggestions FEAT-006/008/015/024 shipped

## [0.9.3] - 2026-11-22

### Added

- footer git actions and Linux OSC7 cwd
- Footer Git actions: Fetch, Pull (`--ff-only`), Push (never force), Stash,
  Stash pop — with confirm dialogs when the tree is dirty / ahead / behind
- Git Changes view in the footer menu (read-only staged / unstaged / untracked
  `name-status` paths)
- Live OSC 7 cwd for Linux bash and zsh (spawn-arg / ZDOTDIR hooks; footer Git
  and session restore follow `cd`)

### Changed

- build(deps-dev): bump eslint-plugin-react-refresh from 0.5.7 to 0.5.8
- build(deps-dev): bump prettier from 3.10.0 to 3.10.1
- build(deps-dev): bump eslint from 10.14.0 to 10.15.0
- build(deps-dev): bump electron from 45.1.0 to 45.4.1
- build(deps): bump simple-git from 4.0.2 to 4.1.0
- Docs: ROADMAP Git-actions batch; suggestions FEAT-001/010/011/012/025 shipped

## [0.9.2] - 2026-11-15

### Added

- profile editor and Win11 sparse Explorer menu

### Fixed

- run makeappx with cwd-relative argv only
- invoke cmd.exe /c with relative bat names
- keep signing password out of JS for CodeQL
- address CodeQL and Explorer arg quoting

### Changed

- docs: drop stale Unreleased block before 0.9.2 cut

## [0.9.1] - 2026-11-15

### Changed

- perf: coalesce PTY IPC and polish chrome tokens
- build(deps-dev): bump prettier from 3.9.10 to 3.10.0
- build(deps-dev): bump vite from 8.3.5 to 8.3.8
- build(deps-dev): bump typescript-eslint from 8.72.1 to 8.72.2
- build(deps): bump systeminformation from 5.33.18 to 5.33.19
- build(deps-dev): bump @vitejs/plugin-react from 6.2.1 to 6.3.0
- build(deps-dev): bump typescript-eslint from 8.71.2 to 8.72.1
- build(deps-dev): bump @vitejs/plugin-react from 6.1.2 to 6.2.1
- build(deps-dev): bump vite-plugin-electron from 1.1.2 to 1.2.0
- build(deps-dev): bump eslint from 10.12.0 to 10.14.0
- build(deps-dev): bump globals from 17.13.0 to 17.14.0
- build(deps): bump softprops/action-gh-release from 3.0.3 to 3.0.4
- build(deps): bump systeminformation from 5.33.15 to 5.33.18
- build(deps-dev): bump electron-builder from 26.15.3 to 26.18.0
- build(deps-dev): bump electron from 44.7.0 to 45.1.0
- build(deps): bump chokidar from 5.0.0 to 6.0.0
- build(term): switch CLI bins to dist build
- build(deps): bump electron-updater from 6.8.9 to 6.8.11
- build(deps-dev): bump vite from 8.3.4 to 8.3.5
- build(deps): bump actions/setup-python from 7.0.0 to 7.1.0
- build(deps-dev): bump prettier from 3.9.9 to 3.9.10
- build(deps): bump zod from 4.6.5 to 4.6.7
- build(deps-dev): bump vite from 8.3.3 to 8.3.4
- build(deps-dev): bump typescript-eslint from 8.71.1 to 8.71.2

## [0.9.0] - 2026-10-13

### Added

- palette v2, buffer/WebGL, git pending, update UX

### Fixed

- require Ctrl+click to open terminal links
- guard multi-tab pty spawn storm that OOM-crashed the app

### Changed

- perf: lazy pane hydration on first focus
- build(deps-dev): bump eslint from 10.11.0 to 10.12.0
- build(deps-dev): bump electron from 44.5.1 to 44.7.0
- build(deps-dev): bump @vitejs/plugin-react from 6.1.1 to 6.1.2
- build(deps-dev): bump typescript-eslint from 8.71.0 to 8.71.1
- build(deps-dev): bump vite from 8.3.2 to 8.3.3

- palette: ranked fuzzy search, MRU ordering, OpenCode sessions + git checkout rows
- settings: optional WebGL terminal renderer for smoother output floods
- about: update check / download progress / restart-to-install controls

### Changed

- perf: lazy pane hydration — spawn xterm/ConPTY only when a pane is first focused on the active tab
- perf: frame-budget PTY → xterm write flushing under output floods
- git footer shows a pending “⎇ …” state on pane switch instead of a stale branch or false “no repo”

### Fixed

- require Ctrl+click (Cmd+click on macOS) to open terminal URLs and local paths

## [0.8.7] - 2026-10-05

### Changed

- ci: refuse to cut an empty release in scripts/release.mjs

## [0.8.6] - 2026-10-04

### Added

- keyboard resizing for split dividers
- transitions for hover and state changes
- keyboard navigation for the tab bar
- add a themed focus ring for keyboard navigation
- surface rejected settings paths in the UI
- derive chrome tokens from settings.theme

### Fixed

- lock node-pty's pty registry, drop the assert that aborted the app
- settings banner blames only the file it names
- the settings rejection banner could never be hidden
- stop reporting a settings.json that is no longer invalid
- let only the settings write decide whether a save succeeded
- guard renderer sends against a destroyed window
- report settings write failures instead of swallowing them
- make the settings directory injectable so tests are isolated
- make the settings test suite pass on Linux
- one Tab stop for the tab strip, NaN-safe split ratios
- write settings.json atomically
- ignore prototype-polluting keys when merging settings
- import must not install executable shell profiles
- focus guard matched the tab bar, not the tab
- make the chrome font theme-driven
- make client-id field reachable, reject unknown actions
- fall back per field instead of resetting the file
- release pty state on natural exit and teardown on quit
- kill stale pty before re-spawn with reused pane id

### Changed

- test: isolate pluginManager through the settings seam
- perf: cap the settings rejection report
- perf: redundant pane focus no longer rebuilds every tab
- refactor: introduce design tokens for app chrome
- perf: diff-guard pane agent labels against poll ticks
- perf: throttle pane divider drag writes
- ci: run bun test and ignore generated coverage output

## [0.8.5] - 2026-10-03

### Added

- process manager with per-process CPU, memory, and disk I/O

### Changed

- perf: lazy footer data depth, PTY batching, and render/bundle cuts

## [0.8.4] - 2026-10-03

### Added

- actionable gist errors and proactive token validation

## [0.8.3] - 2026-10-02

### Fixed

- stable spawn geometry and guarded ConPTY resize for pwsh7

### Changed

- perf: cut hot-path process spawns and renderer re-render cost

## [0.8.2] - 2026-10-02

### Added

- background app-update notifications

### Changed

- build: integrate CLI compilation into the main build

## [0.8.1] - 2026-10-02

### Added

- add toggle-app global hotkey for show/hide

### Fixed

- spawn on stable geometry + title from resolved cwd
- prompt-anchored background completion toast
- tab profile menu overlay

### Changed

- perf: break the per-prompt update cascade
- build: update deps (electron 44.5.1, vite 8.3.2, others)
- chore: remove redundant dev:electron script

## [0.8.0] - 2026-09-29

### Added

- explorer context menu + doctor CLI
- multi-pane search, cross-tab pane drag-drop, native image paste

### Fixed

- Ctrl+V pastes clipboard 3x in terminal panes
- harden CLI installer path handling

### Changed

- docs: community & contribution infrastructure
- build(deps): bump actions/upload-pages-artifact from 4.0.0 to 5.0.0
- build(deps): bump actions/setup-node from 4 to 7
- build(deps): bump actions/deploy-pages from 4.0.0 to 5.0.1
- build(deps): bump actions/setup-python from 5.0.0 to 7.0.0

## [0.7.0] - 2026-09-29

### Added

- local plugin system (SDK, example, docs) + CLI README polish

### Changed

- chore: bun.lock — register packages/sdk workspace

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
