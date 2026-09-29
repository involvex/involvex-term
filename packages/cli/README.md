# @involvex/term

[![npm](https://img.shields.io/npm/v/%40involvex%2Fterm)](https://www.npmjs.com/package/@involvex/term)
[![License: MIT](https://img.shields.io/badge/license-MIT-4ec9b0)](https://github.com/involvex/involvex-term/blob/main/LICENSE)
[![Repo](https://img.shields.io/badge/repo-involvex--term-181717?logo=github)](https://github.com/involvex/involvex-term)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-4ec9b0)](https://involvex.github.io/involvex-term/)
[![Sponsor](https://img.shields.io/badge/sponsor-%E2%9D%A4-db61a2?logo=githubsponsors)](https://github.com/sponsors/involvex)

CLI for [Involvex-Term](https://github.com/involvex/involvex-term) — a
minimalist, dark, Git-aware desktop terminal (Electron + xterm.js +
node-pty). This package installs the app from its latest GitHub release and
gives you a `wt`-style command line to control the running window.

```sh
bunx @involvex/term install     # download latest release + install global `involvex-term`
involvex-term upgrade           # install the latest release if newer (--force to reinstall)
involvex-term uninstall         # remove the app + global CLI (--keep-cli to keep the CLI)
involvex-term sp -d .           # split the focused pane (-H / -V for direction)
involvex-term nt -d C:\repos    # new tab (alias: st)
```

## Commands

| Command                                              | Description                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `install [--pm bun\|npm] [--no-global]`              | Download + install the latest release, then this CLI globally  |
| `upgrade [--force] [--pm bun\|npm]` (alias `update`) | Install the latest release only if newer than what's installed |
| `uninstall [--keep-cli]`                             | Remove the app and (unless `--keep-cli`) the global CLI        |
| `sp [-H\|-V] [-d <dir>] [-p <profile>]`              | Split the focused pane (horizontal by default)                 |
| `nt [-d <dir>] [-p <profile>]` (alias `st`)          | Open a new tab                                                 |
| `start`                                              | Launch the app                                                 |
| `path`                                               | Print the resolved app executable path                         |
| `--version`, `--help`                                | Self-explanatory                                               |

`install` runs the Windows NSIS installer silently (or places the AppImage
on Linux), records the app path and version in `~/.involvex-term/cli.json`,
then runs `bun add -g @involvex/term` (or `npm i -g`; force with `--pm`,
skip with `--no-global`). Set `INVOLVEX_TERM_EXE` to override the app path.
Settings in `~/.involvex-term/settings.json` survive `uninstall`.

`sp`/`nt`/`st` are forwarded to the running window through Electron's
single-instance channel; if the app isn't running it starts and applies the
command once ready. Relative `-d` paths are resolved against the CLI's own
current directory.

## Links

- Repository: <https://github.com/involvex/involvex-term>
- Docs: <https://involvex.github.io/involvex-term/>
- Plugin API (`@involvex/term-sdk`): <https://github.com/involvex/involvex-term/blob/main/PLUGINS.md>
- Issues: <https://github.com/involvex/involvex-term/issues>
- Sponsor: <https://github.com/sponsors/involvex>
- Author: [involvex](https://github.com/involvex)

## Development

Source is TypeScript (`src/cli.ts`), bundled for Node with
`bun build --target node` (`bun run build`). CI publishes on `v*` tags using
the `NPM_TOKEN` secret; the package version is taken from the tag.
