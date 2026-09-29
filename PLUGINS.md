# Involvex-Term plugins

Involvex-Term can load local plugins written as plain Node ESM modules.
Plugins add command-palette commands, small status-bar text segments, and
can observe (not transform) pty spawn/data/exit events. This is intended for
personal automation and small integrations — not a marketplace.

## ⚠️ Trust model

Plugins run **with full Node.js access in the main process**, the same
process that spawns your shells and holds your settings. There is no
sandboxing. Only enable plugins you wrote yourself or fully trust, the same
way you'd trust a shell profile script. Plugins are **off by default**
(`plugins.enabled: false` in settings).

## Installing a plugin

1. Enable plugins: **Settings → Plugins → Enable plugins**.
2. Copy (or symlink, while developing) the plugin's folder into
   `~/.involvex-term/plugins/<name>/`.
3. Click **Reload plugins** in Settings → Plugins (or restart the app).

A plugin folder needs one of:

- `index.mjs` (or `index.js`) at its root, or
- a `package.json` with a `main` field pointing at the entry file.

The entry file's default export (or its own module-level exports, if you
don't use `export default`) must implement `activate(api)`:

```js
/** @type {import('@involvex/term-sdk').PluginModule} */
export default {
	activate(api) {
		api.commands.register({id: 'hello.sayHi', title: 'Hello: say hi'}, () =>
			api.log('hi!'),
		)
	},
	deactivate() {
		// optional cleanup, called on quit or "Reload plugins"
	},
}
```

Install `@involvex/term-sdk` (`bun add -d @involvex/term-sdk`) for the
`PluginApi`/`PluginModule` types shown above via JSDoc — it's type-only, so
it never ships in your plugin's runtime.

See [`examples/plugins/hello-plugin`](examples/plugins/hello-plugin) for a
complete, runnable example (command + status-bar clock + pane counter).

## API reference

### `api.version: string`

The running app version, e.g. `"0.6.1"`.

### `api.log(...args)`

`console.log` prefixed with `[plugin:<name>]`.

### `api.commands.register(cmd, run)` / `unregister(id)`

```ts
register(cmd: {id: string; title: string; hint?: string}, run: () => void | Promise<void>): void
```

Adds an entry to the command palette (`Ctrl+Shift+P`). `run()` executes in
the main process — call other `api` methods from it, or reach into Node
(`child_process`, `fs`, `fetch`, …) as needed.

### `api.statusBar.set(segment)` / `clear(id)`

```ts
set(segment: {id: string; text: string; title?: string}): void
```

Shows (or replaces) a small text segment at the right of the footer, after
the built-in Git/sys/agent modules. `title` is a tooltip. Segments persist
until you `clear(id)` or the plugin is unloaded.

### `api.pty.onSpawn(cb)` / `onData(cb)` / `onExit(cb)`

Read-only observers over every pane's pty lifecycle:

```ts
onSpawn(cb: (info: {paneId: string; cwd: string; shell: string}) => void): () => void
onData(cb: (paneId: string, data: string) => void): () => void
onExit(cb: (paneId: string) => void): () => void
```

Each returns an unsubscribe function. `onData` receives output **after**
OSC 7/9;9/633 cwd sequences have been stripped — you cannot inject into or
alter what xterm renders from here (there's no write hook; that's
intentional, so a broken plugin can't corrupt terminal output).

### `api.settings.get()`

```ts
get(): {version: string; theme: {bg: string; fg: string}}
```

A read-only snapshot of a few user-facing settings. Grows over time as
plugins need more; open an issue if you need something specific.

### `api.storage.get<T>()` / `set(value)`

A tiny per-plugin JSON file at `<plugin dir>/storage.json`. `get()` returns
`undefined` if nothing was stored yet (or the file is corrupt) — always
handle that case.

## Debugging

- Load/activation errors are collected per plugin and shown under
  **Settings → Plugins → Errors** — a broken plugin never crashes the app or
  blocks other plugins.
- `api.log(...)` output goes to the main process console (the terminal you
  launched the app from in dev, or `dev:electron`'s console).
- **Reload plugins** re-imports every plugin file with a cache-busting query
  string, so edits show up without restarting the app.

## Roadmap

This is an intentionally small v1. Being considered for later:

- More settings/theme fields in `api.settings.get()`.
- A `contextMenu` hook for the terminal right-click menu.
- Publishing plugins as npm packages with a manifest (`involvexTerm` field
  in `package.json`) instead of copying folders by hand.
