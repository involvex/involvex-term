# hello-plugin

Minimal example [Involvex-Term](https://github.com/involvex/involvex-term)
plugin demonstrating the three hook groups in
[`PLUGINS.md`](../../../PLUGINS.md):

- `api.commands.register` — a command-palette entry
- `api.statusBar.set` — a live clock segment in the footer
- `api.pty.onSpawn` + `api.storage` — counts panes spawned, persisted to
  `storage.json` next to this plugin

## Try it

```powershell
Copy-Item -Recurse . "$env:USERPROFILE\.involvex-term\plugins\hello-plugin"
```

Then in Involvex-Term: **Settings → Plugins → Enable plugins → Reload
plugins**. You should see a clock and a pane counter in the footer, and
"Hello: say hi" in the command palette (`Ctrl+Shift+P`).
