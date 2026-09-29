// Example Involvex-Term plugin.
//
// Install: copy this folder to ~/.involvex-term/plugins/hello-plugin
// (or symlink it while developing), then enable plugins in
// Settings → Plugins and click "Reload plugins".
//
// See https://github.com/involvex/involvex-term/blob/main/PLUGINS.md

/** @type {import('@involvex/term-sdk').PluginModule} */
export default {
	activate(api) {
		api.log(`activated (host v${api.version})`)

		// Command palette entry (Ctrl+Shift+P → "Hello: say hi").
		api.commands.register(
			{id: 'hello.sayHi', title: 'Hello: say hi', hint: 'from hello-plugin'},
			() => {
				const {fg} = api.settings.get().theme
				api.log(`hi! current foreground color is ${fg}`)
			},
		)

		// Status-bar clock, ticking every second.
		const tick = () => {
			api.statusBar.set({
				id: 'hello.clock',
				text: new Date().toLocaleTimeString(),
				title: 'hello-plugin: local time',
			})
		}
		tick()
		const timer = setInterval(tick, 1000)

		// Count panes spawned since app start, persisted across restarts.
		const stored = api.storage.get() ?? {spawnCount: 0}
		api.pty.onSpawn(info => {
			stored.spawnCount += 1
			api.storage.set(stored)
			api.log(`pane spawned: ${info.paneId} in ${info.cwd} (${info.shell})`)
			api.statusBar.set({
				id: 'hello.spawns',
				text: `panes: ${stored.spawnCount}`,
				title: 'hello-plugin: panes spawned this session (cumulative)',
			})
		})

		this._cleanup = () => clearInterval(timer)
	},

	deactivate() {
		this._cleanup?.()
	},
}
