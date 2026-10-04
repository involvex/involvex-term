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

async function storeWithScratchHome(): Promise<
	typeof import('../../electron/settingsStore.ts')
> {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-write-'))
	scratchDirs.push(home)
	// Both variables, because `os.homedir()` reads $HOME on POSIX and
	// $USERPROFILE on Windows.
	//
	// NOTE: this is best effort. Bun resolves `os.homedir()` once at process
	// start and ignores later changes to either variable, so under `bun test`
	// on Linux the module still resolves the real home and these tests write
	// to the developer's actual settings dir. Verified on WSL: setting HOME
	// mid-process does not move it, while node does. Fixed properly by making
	// the settings dir injectable rather than derived from the environment.
	const restore = {HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE}
	process.env.HOME = home
	process.env.USERPROFILE = home
	try {
		return await import(`../../electron/settingsStore.ts?w=${counter++}`)
	} finally {
		for (const key of ['HOME', 'USERPROFILE'] as const) {
			const value = restore[key]
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
	}
}

afterEach(() => {
	while (scratchDirs.length) {
		fs.rmSync(scratchDirs.pop()!, {recursive: true, force: true})
	}
})

/** Entries in the settings dir, so a leaked temp file is visible. */
function settingsDirEntries(dir: string): string[] {
	return fs.readdirSync(dir).sort()
}

describe('saveSettings writes atomically', () => {
	it('leaves no temp file behind after a successful save', async () => {
		const store = await storeWithScratchHome()
		store.saveSettings(store.defaultSettings())

		expect(settingsDirEntries(store.SETTINGS_DIR)).toEqual(['settings.json'])
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

		expect(settingsDirEntries(store.SETTINGS_DIR)).toEqual(['settings.json'])
	})

	it('produces a complete, parseable file', async () => {
		const store = await storeWithScratchHome()
		store.saveSettings(store.defaultSettings())

		const raw = fs.readFileSync(store.SETTINGS_FILE, 'utf-8')
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
		const before = fs.readFileSync(store.SETTINGS_FILE, 'utf-8')

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
		expect(fs.readFileSync(store.SETTINGS_FILE, 'utf-8')).toBe(before)
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
		expect(settingsDirEntries(store.SETTINGS_DIR)).toEqual(['settings.json'])
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
			const onDisk = JSON.parse(fs.readFileSync(store.SETTINGS_FILE, 'utf-8'))
			expect(onDisk.terminal.scrollback).toBe(1000 + i)
		}
	})
})
