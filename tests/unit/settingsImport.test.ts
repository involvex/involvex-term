import {afterEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Import is the one settings path that takes its input from a file the user
 * picked off disk, so a profile's `command`/`args` — which are spawned verbatim
 * on every new tab — are executable content arriving from outside the app.
 *
 * The realistic vector is a *chosen file*, not a chosen victim: a config
 * posted in a gist, issue or "share your theme" tool. The user imports what
 * they believe is a colour scheme and gets code execution on every tab opened
 * afterwards, with no prompt and nothing in the UI to notice.
 *
 * These tests pin the mitigation: the profile travels, its command does not.
 */

let counter = 0
const scratchDirs: string[] = []

/**
 * Fresh module copy per test, so `rejectedBySource` (module-level state) and
 * the profile defaults cannot leak between cases.
 */
async function storeWithScratchHome(): Promise<
	typeof import('../../electron/settingsStore.ts')
> {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-import-'))
	scratchDirs.push(home)
	const previous = process.env.USERPROFILE
	process.env.USERPROFILE = home
	try {
		return await import(`../../electron/settingsStore.ts?i=${counter++}`)
	} finally {
		if (previous === undefined) delete process.env.USERPROFILE
		else process.env.USERPROFILE = previous
	}
}

afterEach(() => {
	while (scratchDirs.length) {
		fs.rmSync(scratchDirs.pop()!, {recursive: true, force: true})
	}
})

describe('parseImportedSettings: profile commands are not imported', () => {
	it('drops a custom profile command that would be spawned', async () => {
		const store = await storeWithScratchHome()

		const imported = store.parseImportedSettings({
			terminal: {
				profiles: [
					{
						id: 'payload',
						name: 'Totally Normal',
						kind: 'custom',
						command: 'C:\\Users\\victim\\Downloads\\setup.exe',
						args: ['--silent'],
					},
				],
			},
		})

		const profile = imported.terminal.profiles[0]
		expect(profile.command).toBeUndefined()
		expect(profile.args).toBeUndefined()
		// Identity survives, so the reference graph still resolves.
		expect(profile.id).toBe('payload')
		expect(profile.kind).toBe('custom')
	})

	it('drops a command smuggled onto a builtin kind', async () => {
		// The case a `kind === 'custom'` filter would miss: resolveProfile
		// honours `command` for every builtin kind whenever the path exists
		// (shellProfiles.ts), so `kind: 'cmd'` runs an arbitrary binary too.
		const store = await storeWithScratchHome()

		const imported = store.parseImportedSettings({
			terminal: {
				profiles: [
					{
						id: 'cmd',
						name: 'Command Prompt',
						kind: 'cmd',
						command: 'C:\\Windows\\System32\\calc.exe',
					},
				],
			},
		})

		expect(imported.terminal.profiles[0].command).toBeUndefined()
	})

	it('drops args even when the command is empty', async () => {
		// args are appended to the resolved shell, so `-File payload.ps1`
		// executes on a profile that still looks harmless.
		const store = await storeWithScratchHome()

		const imported = store.parseImportedSettings({
			terminal: {
				profiles: [
					{
						id: 'pwsh',
						name: 'PowerShell 7',
						kind: 'pwsh',
						command: '',
						args: ['-File', 'C:\\Users\\victim\\payload.ps1'],
					},
				],
			},
		})

		const profile = imported.terminal.profiles[0]
		expect(profile.args).toBeUndefined()
		expect(profile.command).toBeUndefined()
	})

	it('keeps the profile reference pointing at a real profile', async () => {
		// Dropping the whole entry instead of just its command would leave
		// defaultProfileId pointing at nothing.
		const store = await storeWithScratchHome()

		const imported = store.parseImportedSettings({
			terminal: {
				defaultProfileId: 'payload',
				profiles: [
					{
						id: 'payload',
						name: 'Custom',
						kind: 'custom',
						command: 'C:\\evil.exe',
					},
				],
			},
		})

		expect(imported.terminal.defaultProfileId).toBe('payload')
		expect(
			imported.terminal.profiles.some(
				p => p.id === imported.terminal.defaultProfileId,
			),
		).toBe(true)
	})

	it('reports the stripped paths so the import is not silent', async () => {
		const store = await storeWithScratchHome()

		store.parseImportedSettings({
			terminal: {
				profiles: [
					{
						id: 'payload',
						name: 'Custom',
						kind: 'custom',
						command: 'C:\\evil.exe',
					},
				],
			},
		})

		expect(store.rejectedSettingsPaths('import')).toEqual([
			'terminal.profiles[0].command',
		])
	})

	it('leaves the rest of the import intact', async () => {
		// Stripping must not cost the user the settings they actually wanted.
		const store = await storeWithScratchHome()

		const imported = store.parseImportedSettings({
			theme: {bg: '#002b36', fontSize: 15},
			terminal: {
				startDir: 'D:\\repos',
				scrollback: 9000,
				profiles: [
					{
						id: 'payload',
						name: 'Custom',
						kind: 'custom',
						command: 'C:\\evil.exe',
					},
				],
			},
		})

		expect(imported.theme.bg).toBe('#002b36')
		expect(imported.theme.fontSize).toBe(15)
		expect(imported.terminal.startDir).toBe('D:\\repos')
		expect(imported.terminal.scrollback).toBe(9000)
	})

	it('reports nothing for a profile that never had a command', async () => {
		// Builtins carry no command, so the ordinary case must stay silent —
		// a permanent warning would train the user to ignore it.
		const store = await storeWithScratchHome()

		store.parseImportedSettings({
			terminal: {profiles: [{id: 'cmd', name: 'Command Prompt', kind: 'cmd'}]},
		})

		expect(store.rejectedSettingsPaths('import')).toEqual([])
	})
})
