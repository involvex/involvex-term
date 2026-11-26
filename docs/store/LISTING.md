# Microsoft Store listing copy — Involvex Term

Paste into Partner Center. Screenshots must be **≥ 1366×768**.

## Short description (≤256 chars)

Minimalist dark Git-aware terminal for Windows: tabs, split panes, live Git
footer, OpenCode hooks, and Windows Terminal–style copy/paste.

## Description

Involvex Term is a Git-aware desktop terminal built with Electron, xterm.js,
and ConPTY (node-pty).

**Highlights**

- Dark theme tuned for long coding sessions
- Tabs and split panes (horizontal / vertical)
- Live Git status in the footer (branch, dirty counts, fetch/pull/push/stash)
- Shell profiles: PowerShell 7, Windows PowerShell, cmd, WSL
- OpenCode launch and session continue from the UI
- Session restore, system tray, optional quake dropdown
- Command palette, find-in-buffer, snippets
- Optional settings sync via private GitHub Gist (Device Code login)

**Updates**

Store installs update through the Microsoft Store. GitHub Releases auto-update
applies only to the separate NSIS installer from GitHub.

**Privacy**

https://involvex.github.io/involvex-term/privacy.html

**Notes for certification**

- `runFullTrust` is required to spawn interactive shells and access the
  filesystem like any terminal emulator.
- Closing the window quits by default on Store builds (close-to-tray is off
  until the user enables it). Tray remains optional.
- Third-party plugins are off by default and run unsandboxed if enabled.

## Search terms

terminal, powershell, git, developer, console, cmd, wsl, opencode, xterm

## What’s new (template)

vX.Y.Z — see https://github.com/involvex/involvex-term/blob/main/CHANGELOG.md

## Screenshots checklist

Capture from a packaged Store build (or NSIS with similar UI):

1. Split panes + Git footer (≥1366×768)
2. Settings / theme
3. Command palette or OpenCode side-by-side

Place exports in this folder as `shot-1.png`, `shot-2.png`, …
