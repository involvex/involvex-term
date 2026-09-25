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
- Command palette (`Ctrl+Shift+P`) and find (`Ctrl+Shift+F`)
- **OpenCode** button / `Ctrl+Shift+O` — launches
  [OpenCode](https://opencode.ai) in the focused pane; click the footer
  `OC` widget to continue the matched session (`opencode -s <id>`)
- Windows Terminal style copy/paste: `Ctrl+C` copies only with selection
- Session restore, tray, optional quake dropdown (`Ctrl+\``)
- Settings at `~/.involvex-term/settings.json` (`Ctrl+,`)

## Quickstart (Bun, PowerShell)

```powershell
bun install               # postinstall only applies the node-pty Spectre patch
bun run dev:electron      # dev (vite + Electron)
bun run rebuild           # FORCE full node-pty rebuild (slow, rarely needed)
bun run build             # tsc + vite + node-pty rebuild + electron-builder
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

## Settings

Stored at `~/.involvex-term/settings.json` (zod-validated, watched live):

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
		"modulesOrder": ["git", "sys"],
		"refreshMs": 1500
	},
	"hotkeys": {
		"new-tab": "Ctrl+Shift+T",
		"opencode": "Ctrl+Shift+O",
		"...": "..."
	},
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
scripts/           rebuild-pty, patch-node-pty, generate-icon, test-osc7
.github/workflows/ ci.yml, release.yml
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for Windows Terminal–class parity phases and
beyond (Git + OpenCode differentiators).

## License

[MIT](LICENSE)
