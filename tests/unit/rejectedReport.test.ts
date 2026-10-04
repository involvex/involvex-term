import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	allRejectedSettingsReport,
	loadSettings,
	rejectedSettingsReport,
	setSettingsHome,
	settingsFile,
} from '../../electron/settingsStore.ts'

/**
 * The Settings rejection banner.
 *
 * `settings:get` hands the renderer `allRejectedSettingsReport()`, and the modal
 * turns it into "N value(s) in settings.json are invalid and were reset to their
 * default". That makes an accurate report load-bearing: a false one tells the
 * user their settings file is corrupt when it is not, and there is nothing they
 * can do about a file that is already correct.
 */
describe('rejection report reflects the current file', () => {
	let home: string

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-rejected-'))
		setSettingsHome(home)
		fs.mkdirSync(settingsFile().replace(/[^/\\]+$/, ''), {recursive: true})
	})

	afterEach(() => {
		setSettingsHome(null)
		fs.rmSync(home, {recursive: true, force: true})
	})

	const write = (obj: unknown) =>
		fs.writeFileSync(settingsFile(), JSON.stringify(obj))

	it('reports the offending path while the bad value is in the file', () => {
		write({theme: {fontSize: 'huge'}})
		loadSettings()

		expect(allRejectedSettingsReport()).toEqual({
			paths: ['theme.fontSize'],
			total: 1,
		})
	})

	it('stops reporting a path once the file no longer contains it', () => {
		// The regression. The banner told the user settings.json was invalid
		// while the file on disk parsed cleanly, because the union of rejected
		// paths was a Set that only ever grew.
		write({theme: {fontSize: 'huge'}})
		loadSettings()
		expect(allRejectedSettingsReport().total).toBe(1)

		write({theme: {fontSize: 16}})
		loadSettings()

		expect(allRejectedSettingsReport()).toEqual({paths: [], total: 0})
	})

	it('never reports a path alongside a zero total', () => {
		// The two halves were maintained separately, so this state was
		// reachable: the source snapshot had been replaced (total 0) while the
		// union still held the old path. The renderer then does
		// Math.max(rejectedTotal, rejectedPaths.length) and shows a warning for
		// a count the report itself says is zero.
		write({theme: {fontSize: 'huge'}})
		loadSettings()
		write({theme: {fontSize: 16}})
		loadSettings()

		const report = allRejectedSettingsReport()
		expect(report.total > 0).toBe(report.paths.length > 0)
		expect(report.paths.length).toBeLessThanOrEqual(report.total)
	})

	it('keeps reporting a path that is still present across repeated loads', () => {
		// The fix must not turn into "clear the report and hope": a value that
		// is genuinely invalid stays visible however many times the file is
		// re-read, including via the settings-file watcher on every save.
		write({theme: {fontSize: 'huge'}})
		loadSettings()
		loadSettings()
		loadSettings()

		expect(allRejectedSettingsReport()).toEqual({
			paths: ['theme.fontSize'],
			total: 1,
		})
	})

	it('reports the settings.json source independently', () => {
		write({theme: {fontSize: 'huge'}})
		loadSettings()

		expect(rejectedSettingsReport('settings.json')).toEqual({
			paths: ['theme.fontSize'],
			total: 1,
		})
		expect(rejectedSettingsReport('import')).toEqual({paths: [], total: 0})
	})
})
