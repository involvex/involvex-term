# @involvex/term

CLI for [Involvex-Term](https://github.com/involvex/involvex-term).

```sh
bunx @involvex/term install     # download latest release + install global `involvex-term`
involvex-term upgrade           # install the latest release if newer (--force to reinstall)
involvex-term uninstall         # remove the app + global CLI (--keep-cli to keep the CLI)
involvex-term sp -d .           # split the focused pane (-H / -V for direction)
involvex-term nt -d C:\repos    # new tab (alias: st)
```

`install` runs the Windows NSIS installer silently (or places the AppImage on
Linux), records the app path and version in `~/.involvex-term/cli.json`, then
runs `bun add -g @involvex/term` (or `npm i -g`; force with `--pm`, skip with
`--no-global`). Set `INVOLVEX_TERM_EXE` to override the app path. Settings in
`~/.involvex-term/settings.json` survive uninstall.

Commands are forwarded to the running window through Electron's single-instance
channel; if the app is not running it starts and applies them.

## Development

Source is TypeScript (`src/cli.ts`), bundled for Node with
`bun build --target node` (`bun run build`). CI publishes on `v*` tags using the
`NPM_TOKEN` secret; the package version is taken from the tag.
