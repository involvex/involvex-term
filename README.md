# involvex-term

[![CI](https://github.com/involvex/involvex-term/actions/workflows/ci.yml/badge.svg)](https://github.com/involvex/involvex-term/actions/workflows/ci.yml)

Minimalist dark-themed Git-aware terminal: Electron + TypeScript + Bun + xterm.js + node-pty.

## Features

- xterm.js dark theme (`#1e1e1e / #cccccc`), fit + web-links + find
- node-pty OS shell (pwsh/PowerShell on Windows, zsh/bash elsewhere)
- Footer status bar: Git branch/dirty/ahead/behind/stash + CPU/MEM
- Tabs like Windows Terminal: `Ctrl+Shift+T/W`, `Ctrl+Tab`, `Ctrl+1..9`,
  `Ctrl+Shift+D`
- Split panes (binary tree, flat CSS grid) — horizontal `Shift+Alt+D`,
  vertical `Shift+Alt+V`, close `Shift+Alt+C`
- Shell profiles: pwsh / Windows PowerShell / cmd / WSL via + ▾ or palette
- Tab rename (double-click) and drag-reorder
- Theme presets in Settings (custom colors still work)
- Background-pane completion toast when a hidden pane goes idle
- Command palette (`Ctrl+Shift+P`) and find (`Ctrl+Shift+F`)
- **OpenCode** button / `Ctrl+Shift+O` — launches
  [OpenCode](https://opencode.ai) in the focused pane; click the footer
  `OC` widget to continue the matched session (`opencode -s <id>`)
- Windows Terminal style copy/paste: `Ctrl+C` copies only with selection;
  right-click shows a context menu (URL / path / copy / paste)
- Session restore, tray, optional quake dropdown (`Ctrl+\``)
- Settings at `~/.involvex-term/settings.json` (`Ctrl+,`)
- Ctrl+click URLs and local paths; scrollback / scrollbar / font fallback
- Optional Windows 11 mica title-bar backdrop
- Command snippets in the palette; clear buffer / prompt marks
- In-app update check (packaged NSIS/AppImage via GitHub Releases)
- Export / import settings from Settings
- Footer Git menu (branch switch, Explorer, copy remote) + OpenCode session picker

## Quickstart (Bun, PowerShell)

```powershell
bun install               # postinstall only applies the node-pty Spectre patch
bun run dev:electron      # dev (vite + Electron)
bun run rebuild           # FORCE full node-pty rebuild (slow, rarely needed)
bun run build             # tsc + vite + node-pty rebuild + electron-builder
                          # also refreshes release/latest → current win-unpacked
bun run link:desktop      # Desktop shortcut → release/latest/involvex-term.exe
```

Checks:

```powershell
bunx tsc --noEmit
bun run lint
bun run format:check
```

## OpenCode

Install [OpenCode](https://opencode.ai) so `opencode` is on your PATH, then:

- Click **OC** in the tab bar, or
- Press `Ctrl+Shift+O`, or
- Use the command palette / Terminal menu, or
- Click the footer OpenCode status to continue that session

involvex-term sends `opencode` (or `opencode -s <id>` / `opencode -c`) + Enter
to the focused pane (after a soft interrupt).

## Native module note (node-pty)

`bun run rebuild` / `bun run build` handle the Electron ABI rebuild via
`scripts/rebuild-pty.mjs` (Python ≤ 3.11 discovery, Spectre patch).

Troubleshooting:

- `pty.vcxproj` / MSB3202: delete `node_modules/node-pty/build` and rebuild
- Electron incomplete install: `node node_modules/electron/install.js`

See [AGENTS.md](AGENTS.md) for full native-build notes.

## Desktop shortcut (version-proof)

`bun run build` refreshes `release/latest` → `release/<version>/win-unpacked`
(Windows junction). Point your Desktop `.lnk` at the junction once:

```powershell
bun run link:desktop
# → %USERPROFILE%\Desktop\Involvex-Term.lnk
#    Target: D:\repos\involvex\involvex-term\release\latest\involvex-term.exe
```

Re-run `bun run link:latest` (or just `build`) after each release — the
shortcut keeps working without editing the `.lnk`.

## Settings

Stored at `~/.involvex-term/settings.json` (zod-validated, watched live):

```json
{
	"theme": {
		"bg": "#1e1e1e",
		"fg": "#cccccc",
		"fontFamily": "...",
		"fontSize": 14,
		"fontFallback": "..."
	},
	"startup": {"mode": "session", "profileId": ""},
	"terminal": {
		"scrollback": 5000,
		"scrollbar": true,
		"completionBell": true
	},
	"window": {"acrylic": false},
	"tabs": {"confirmClose": false, "restoreSession": true}
}
```

## Project structure

```
electron/
  main.ts          IPC + window + watchers
  preload.ts       window.termApi bridge
  ptyManager.ts    node-pty (1 pty per pane)
  cwdTracker.ts    OSC7 / OSC633 parser
  gitEngine.ts     simple-git status
  sysEngine.ts     CPU/MEM via systeminformation
  settingsStore.ts ~/.involvex-term/settings.json
  hotkeys.ts       Menu accelerators
  tray.ts / quake.ts
src/
  App.tsx
  components/      TabBar, PaneLayout, TerminalView, StatusBar, …
  lib/             panes, searchRegistry, focusTerm
scripts/           rebuild-pty, patch-node-pty, link-latest, generate-icon, test-osc7
.github/workflows/ ci.yml, release.yml
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for Windows Terminal–class parity phases and
beyond (Git + OpenCode differentiators).

## License

[MIT](LICENSE)
