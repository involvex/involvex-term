import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const scratchHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-term-plugins-'))

const settingsStore = await import('../../electron/settingsStore.ts')
// Redirect through the seam rather than $HOME / $USERPROFILE. Bun resolves
// `os.homedir()` once at process start and ignores later changes to either, so
// the previous environment override moved nothing: these tests created — and
// then deleted — a `plugins` directory in the developer's real
// ~/.involvex-term on every run.
settingsStore.setSettingsHome(scratchHome)

const {
	initPluginHost,
	loadPlugins,
	pluginCommandList,
	pluginStatus,
	pluginStatusBarList,
	runPluginCommand,
	unloadPlugins,
	pluginsDir,
} = await import('../../electron/pluginManager.ts')

function writePlugin(name: string, source: string): void {
	const dir = path.join(pluginsDir(), name)
	fs.mkdirSync(dir, {recursive: true})
	fs.writeFileSync(path.join(dir, 'index.mjs'), source)
}

describe('pluginManager', () => {
	it('resolves the plugins dir inside the scratch home', () => {
		// Guards the isolation. Plugins live inside the settings directory, so
		// relocating that directory has to move them too; if `pluginsDir()`
		// ever went back to reading `os.homedir()` directly, these tests would
		// pass while still touching the real home.
		expect(pluginsDir()).toBe(
			path.join(scratchHome, '.involvex-term', 'plugins'),
		)
		expect(pluginsDir().startsWith(os.tmpdir())).toBe(true)
		expect(pluginsDir().startsWith(os.homedir())).toBe(false)
	})

	beforeEach(() => {
		fs.rmSync(pluginsDir(), {recursive: true, force: true})
		initPluginHost({
			settingsSnapshot: () => ({
				version: '9.9.9',
				theme: {bg: '#000', fg: '#fff'},
			}),
			onChanged: () => {},
		})
	})

	afterEach(async () => {
		await unloadPlugins()
		fs.rmSync(pluginsDir(), {recursive: true, force: true})
	})

	it('loads a plugin and registers its command', async () => {
		writePlugin(
			'good',
			`export default {
				activate(api) {
					api.commands.register(
						{id: 'good.hi', title: 'Say hi'},
						() => {},
					)
					api.statusBar.set({id: 'good.seg', text: 'hello'})
				},
			}`,
		)
		await loadPlugins('1.0.0')

		expect(pluginCommandList()).toEqual([{id: 'good.hi', title: 'Say hi'}])
		expect(pluginStatusBarList()).toEqual([{id: 'good.seg', text: 'hello'}])
		const status = pluginStatus(true)
		expect(status.enabled).toBe(true)
		expect(status.loaded).toEqual([{name: 'good', commands: ['good.hi']}])
		expect(status.errors).toEqual([])
	})

	it('runs a registered command', async () => {
		writePlugin(
			'runner',
			`export default {
				activate(api) {
					api.commands.register({id: 'r.run', title: 'Run'}, () => {
						globalThis.__ran = true
					})
				},
			}`,
		)
		await loadPlugins('1.0.0')
		const ok = await runPluginCommand('r.run')
		expect(ok).toBe(true)
		const ran = (globalThis as unknown as {__ran?: boolean}).__ran === true
		expect(ran).toBe(true)
	})

	it('isolates a broken plugin without affecting others', async () => {
		writePlugin('broken', `throw new Error('boom')`)
		writePlugin(
			'fine',
			`export default {
				activate(api) {
					api.commands.register({id: 'fine.cmd', title: 'Fine'}, () => {})
				},
			}`,
		)
		await loadPlugins('1.0.0')

		const status = pluginStatus(true)
		expect(status.errors).toEqual([{name: 'broken', error: 'boom'}])
		expect(status.loaded).toEqual([{name: 'fine', commands: ['fine.cmd']}])
	})

	it('persists per-plugin storage across reloads', async () => {
		writePlugin(
			'stateful',
			`export default {
				activate(api) {
					const cur = api.storage.get() ?? {n: 0}
					cur.n += 1
					api.storage.set(cur)
					api.commands.register({id: 'stateful.n', title: String(cur.n)}, () => {})
				},
			}`,
		)
		await loadPlugins('1.0.0')
		expect(pluginCommandList()[0]?.title).toBe('1')
		await loadPlugins('1.0.0')
		expect(pluginCommandList()[0]?.title).toBe('2')
	})

	it('unregisters commands on unload', async () => {
		writePlugin(
			'temp',
			`export default {
				activate(api) {
					api.commands.register({id: 'temp.cmd', title: 'Temp'}, () => {})
				},
			}`,
		)
		await loadPlugins('1.0.0')
		expect(pluginCommandList().length).toBe(1)
		await unloadPlugins()
		expect(pluginCommandList().length).toBe(0)
	})
})
