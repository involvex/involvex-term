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
	discoverPlugins,
	initPluginHost,
	loadPlugins,
	notifyPtyPrompt,
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
		await loadPlugins('1.0.0', ['good'])

		expect(pluginCommandList()).toEqual([{id: 'good.hi', title: 'Say hi'}])
		expect(pluginStatusBarList()).toEqual([{id: 'good.seg', text: 'hello'}])
		const status = pluginStatus(true)
		expect(status.enabled).toBe(true)
		expect(status.loaded).toEqual([
			{
				name: 'good',
				commands: ['good.hi'],
				dir: path.join(pluginsDir(), 'good'),
				entry: path.join(pluginsDir(), 'good', 'index.mjs'),
			},
		])
		expect(status.untrusted).toEqual([])
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
		await loadPlugins('1.0.0', ['runner'])
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
		await loadPlugins('1.0.0', ['broken', 'fine'])

		const status = pluginStatus(true)
		expect(status.errors).toEqual([
			{
				name: 'broken',
				error: 'boom',
				dir: path.join(pluginsDir(), 'broken'),
				entry: path.join(pluginsDir(), 'broken', 'index.mjs'),
			},
		])
		expect(status.loaded).toEqual([
			{
				name: 'fine',
				commands: ['fine.cmd'],
				dir: path.join(pluginsDir(), 'fine'),
				entry: path.join(pluginsDir(), 'fine', 'index.mjs'),
			},
		])
	})

	it('blocks untrusted plugins until they are on the allowlist', async () => {
		writePlugin(
			'hello',
			`export default {
				activate(api) {
					api.commands.register({id: 'hello.hi', title: 'Hi'}, () => {})
				},
			}`,
		)
		await loadPlugins('1.0.0', [])
		const blocked = pluginStatus(true)
		expect(blocked.loaded).toEqual([])
		expect(blocked.untrusted).toEqual([
			{
				name: 'hello',
				dir: path.join(pluginsDir(), 'hello'),
				entry: path.join(pluginsDir(), 'hello', 'index.mjs'),
			},
		])
		expect(pluginCommandList()).toEqual([])

		await loadPlugins('1.0.0', ['hello'])
		const allowed = pluginStatus(true)
		expect(allowed.untrusted).toEqual([])
		expect(allowed.loaded.map(p => p.name)).toEqual(['hello'])
		expect(pluginCommandList()).toEqual([{id: 'hello.hi', title: 'Hi'}])
	})

	it('discoverPlugins lists entry paths without importing', () => {
		writePlugin(
			'scan-me',
			`export default { activate() { throw new Error('should not run') } }`,
		)
		const found = discoverPlugins()
		expect(found).toEqual([
			{
				name: 'scan-me',
				dir: path.join(pluginsDir(), 'scan-me'),
				entry: path.join(pluginsDir(), 'scan-me', 'index.mjs'),
			},
		])
		expect(pluginCommandList()).toEqual([])
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
		await loadPlugins('1.0.0', ['stateful'])
		expect(pluginCommandList()[0]?.title).toBe('1')
		await loadPlugins('1.0.0', ['stateful'])
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
		await loadPlugins('1.0.0', ['temp'])
		expect(pluginCommandList().length).toBe(1)
		await unloadPlugins()
		expect(pluginCommandList().length).toBe(0)
	})

	it('exposes api.git.get via the host gitSnapshot seam', async () => {
		initPluginHost({
			settingsSnapshot: () => ({
				version: '9.9.9',
				theme: {bg: '#000', fg: '#fff'},
			}),
			onChanged: () => {},
			gitSnapshot: async cwd => ({
				repoRoot: cwd,
				branch: 'main',
				isDirty: true,
			}),
		})
		writePlugin(
			'gitty',
			`export default {
				async activate(api) {
					const snap = await api.git.get('/tmp/repo')
					api.commands.register(
						{id: 'gitty.snap', title: JSON.stringify(snap)},
						() => {},
					)
				},
			}`,
		)
		await loadPlugins('1.0.0', ['gitty'])
		expect(pluginCommandList()[0]?.title).toBe(
			JSON.stringify({
				repoRoot: '/tmp/repo',
				branch: 'main',
				isDirty: true,
			}),
		)
	})

	it('fans out notifyPtyPrompt to onPrompt listeners', async () => {
		writePlugin(
			'prompter',
			`export default {
				activate(api) {
					api.pty.onPrompt(info => {
						globalThis.__promptInfo = info
					})
				},
			}`,
		)
		await loadPlugins('1.0.0', ['prompter'])
		notifyPtyPrompt({
			paneId: 'p1',
			cwd: '/repos/demo',
			hadOutput: true,
		})
		expect(
			(globalThis as unknown as {__promptInfo?: unknown}).__promptInfo,
		).toEqual({
			paneId: 'p1',
			cwd: '/repos/demo',
			hadOutput: true,
		})
	})

	it('isolates a throwing onPrompt listener', async () => {
		writePlugin(
			'bad-prompt',
			`export default {
				activate(api) {
					api.pty.onPrompt(() => {
						throw new Error('prompt boom')
					})
					api.pty.onPrompt(info => {
						globalThis.__promptOk = info.paneId
					})
				},
			}`,
		)
		await loadPlugins('1.0.0', ['bad-prompt'])
		notifyPtyPrompt({paneId: 'p2', cwd: '/x', hadOutput: false})
		expect((globalThis as unknown as {__promptOk?: string}).__promptOk).toBe(
			'p2',
		)
	})
})
