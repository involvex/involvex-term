import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// pluginManager reads PLUGINS_DIR from os.homedir() at import time via a
// module-level constant, so point HOME at a scratch dir before importing.
const scratchHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-term-plugins-'))
process.env['HOME'] = scratchHome
process.env['USERPROFILE'] = scratchHome

const {
	initPluginHost,
	loadPlugins,
	pluginCommandList,
	pluginStatus,
	pluginStatusBarList,
	runPluginCommand,
	unloadPlugins,
	PLUGINS_DIR,
} = await import('../../electron/pluginManager.ts')

function writePlugin(name: string, source: string): void {
	const dir = path.join(PLUGINS_DIR, name)
	fs.mkdirSync(dir, {recursive: true})
	fs.writeFileSync(path.join(dir, 'index.mjs'), source)
}

describe('pluginManager', () => {
	beforeEach(() => {
		fs.rmSync(PLUGINS_DIR, {recursive: true, force: true})
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
		fs.rmSync(PLUGINS_DIR, {recursive: true, force: true})
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
