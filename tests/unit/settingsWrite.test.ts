import {afterEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * settings.json holds every preference the user has. `fs.writeFileSync` opens
 * with 'w', which truncates the target before the first byte is written, so an
 * interrupted write leaves a half file. That is worse here than for ordinary
 * data: `loadSettings` catches the resulting `JSON.parse` failure and returns
 * pristine defaults, so a truncated file silently resets everything.
 *
 * These tests pin the atomic replace and, more importantly, the failure mode:
 * a save that does not complete must leave the previous file intact.
 */

let counter = 0
const scratchDirs: string[] = []
let activeStore: typeof import('../../electron/settingsStore.ts') | null = null

async function storeWithScratchHome(): Promise<
	typeof import('../../electron/settingsStore.ts')
> {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-write-'))
	scratchDirs.push(home)
	// Distinct specifier so Bun evaluates a fresh copy of the module; that also
	// means the override below cannot leak into another test file.
	const store = await import(`../../electron/settingsStore.ts?w=${counter++}`)
	// Redirect through the seam rather than $HOME / $USERPROFILE: Bun resolves
	// `os.homedir()` once at process start and ignores later changes to either
	// (verified on WSL — node honours them, Bun does not), so an environment
	// override does not move the settings dir and these tests would read and
	// overwrite the developer's real ~/.involvex-term.
	store.setSettingsHome(home)
	activeStore = store
	return store
}

afterEach(() => {
	// Put the copy back on the home default before its temp dir goes away, so
	// a later test in this file cannot touch a deleted directory.
	activeStore?.setSettingsHome(null)
	activeStore = null
	while (scratchDirs.length) {
		fs.rmSync(scratchDirs.pop()!, {recursive: true, force: true})
	}
})

/** Entries in the settings dir, so a leaked temp file is visible. */
function settingsDirEntries(dir: string): string[] {
	return fs.readdirSync(dir).sort()
}

describe('saveSettings writes atomically', () => {
	it('resolves the settings dir inside the scratch home', async () => {
		// Guards the isolation the whole suite depends on. Without the seam the
		// settings dir came from `os.homedir()`, which Bun fixes at process
		// start, so redirecting the environment did nothing and these tests
		// silently ran against — and overwrote — the developer's real settings.
		const store = await storeWithScratchHome()

		expect(store.settingsDir().startsWith(os.tmpdir())).toBe(true)
		expect(store.settingsDir().startsWith(os.homedir())).toBe(false)
		// And nothing was created in the real location.
		expect(fs.existsSync(store.settingsDir())).toBe(false)
	})

	it('leaves no temp file behind after a successful save', async () => {
		const store = await storeWithScratchHome()
		store.saveSettings(store.defaultSettings())

		expect(settingsDirEntries(store.settingsDir())).toEqual(['settings.json'])
	})

	it('leaves no temp file behind across repeated saves', async () => {
		// A leak only shows on the second save: the first one's temp is
		// renamed away, a later one that failed to clean up would accumulate.
		const store = await storeWithScratchHome()
		for (let i = 0; i < 5; i++) {
			store.saveSettings({
				...store.defaultSettings(),
				theme: {...store.defaultSettings().theme, fontSize: 12 + i},
			})
		}

		expect(settingsDirEntries(store.settingsDir())).toEqual(['settings.json'])
	})

	it('produces a complete, parseable file', async () => {
		const store = await storeWithScratchHome()
		store.saveSettings(store.defaultSettings())

		const raw = fs.readFileSync(store.settingsFile(), 'utf-8')
		expect(() => JSON.parse(raw)).not.toThrow()
		// The rename must have moved the whole document, not an empty file.
		expect(JSON.parse(raw).theme.fontSize).toBe(
			store.defaultSettings().theme.fontSize,
		)
	})

	it('keeps the previous file intact when the rename fails', async () => {
		// The load-bearing test. Injected at `renameSync` because that is the
		// last step, i.e. the worst possible moment: the new content is fully
		// written to the temp file and only the swap fails.
		const store = await storeWithScratchHome()
		const good = store.defaultSettings()
		store.saveSettings(good)
		const before = fs.readFileSync(store.settingsFile(), 'utf-8')

		const realRename = fs.renameSync
		// @ts-expect-error - deliberately swapping the implementation
		fs.renameSync = () => {
			throw Object.assign(new Error('injected rename failure'), {
				code: 'EIO',
			})
		}
		try {
			store.saveSettings({
				...good,
				theme: {...good.theme, fontSize: 30},
			})
			throw new Error('expected saveSettings to rethrow')
		} catch (err) {
			expect((err as NodeJS.ErrnoException).message).toBe(
				'injected rename failure',
			)
		} finally {
			fs.renameSync = realRename
		}

		// Byte-identical: a direct writeFileSync would have truncated this.
		expect(fs.readFileSync(store.settingsFile(), 'utf-8')).toBe(before)
		// And still loadable, which is the whole point - a corrupt file here
		// would reset every setting on the next launch.
		expect(store.loadSettings().theme.fontSize).toBe(good.theme.fontSize)
	})

	it('cleans up the temp file when the rename fails', async () => {
		const store = await storeWithScratchHome()
		store.saveSettings(store.defaultSettings())

		const realRename = fs.renameSync
		// @ts-expect-error - deliberately swapping the implementation
		fs.renameSync = () => {
			throw new Error('injected')
		}
		try {
			store.saveSettings(store.defaultSettings())
		} catch {
			/* expected */
		} finally {
			fs.renameSync = realRename
		}

		// A leaked temp would be mistaken for real settings on the next launch
		// and would make every later save fail against the wrong target.
		expect(settingsDirEntries(store.settingsDir())).toEqual(['settings.json'])
	})

	it('does not corrupt settings.json across many saves', async () => {
		// End-to-end guard: if any save left a partial file, one of these
		// reads would fail to parse.
		const store = await storeWithScratchHome()
		for (let i = 0; i < 20; i++) {
			const d = store.defaultSettings()
			store.saveSettings({
				...d,
				terminal: {...d.terminal, scrollback: 1000 + i},
			})
			const onDisk = JSON.parse(fs.readFileSync(store.settingsFile(), 'utf-8'))
			expect(onDisk.terminal.scrollback).toBe(1000 + i)
		}
	})
})
