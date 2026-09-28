# @involvex/term

CLI for [Involvex-Term](https://github.com/involvex/involvex-term).

```sh
bunx @involvex/term install     # download latest release + install global `involvex-term`
involvex-term sp -d .           # split the focused pane (-H / -V for direction)
involvex-term nt -d C:\repos    # new tab (alias: st)
```

`install` runs the Windows NSIS installer silently (or places the AppImage on
Linux), records the app path in `~/.involvex-term/cli.json`, then runs
`bun add -g @involvex/term` (or `npm i -g`; force with `--pm`, skip with
`--no-global`). Set `INVOLVEX_TERM_EXE` to override the app path.

Commands are forwarded to the running window through Electron's single-instance
channel; if the app is not running it starts and applies them.
