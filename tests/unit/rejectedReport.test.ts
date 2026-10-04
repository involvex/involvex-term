import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	currentFileRejectedReport,
	loadSettings,
	parseImportedSettings,
	rejectedSettingsReport,
	saveSettings,
	setSettingsHome,
	settingsFile,
} from '../../electron/settingsStore.ts'

/**
 * The Settings rejection banner.
 *
 * `settings:get` hands the renderer `currentFileRejectedReport()`, and the modal
 * turns it into "N value(s) in settings.json are invalid and were reset to their
 * default". The wording names the file, so that makes an accurate report
 * load-bearing: a false one tells the user their settings file is corrupt when it
 * is not, and there is nothing they can do about a file that is already correct.
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

		expect(currentFileRejectedReport()).toEqual({
			paths: ['theme.fontSize'],
			total: 1,
		})
	})

	it('stops reporting a path once the file no longer contains it', () => {
		// The regression. The banner told the user settings.json was invalid
		// while the file on disk parsed cleanly, because the report was built by
		// accumulating rejected paths into a Set that only ever grew.
		write({theme: {fontSize: 'huge'}})
		expect(currentFileRejectedReport().total).toBe(1)

		write({theme: {fontSize: 16}})

		expect(currentFileRejectedReport()).toEqual({paths: [], total: 0})
	})

	it('never reports a path alongside a zero total', () => {
		// The two halves were maintained separately, so this state was
		// reachable: the source snapshot had been replaced (total 0) while the
		// accumulated union still held the old path. The renderer then does
		// Math.max(rejectedTotal, rejectedPaths.length) and shows a warning for
		// a count the report itself says is zero.
		write({theme: {fontSize: 'huge'}})
		loadSettings()
		write({theme: {fontSize: 16}})
		loadSettings()

		const report = currentFileRejectedReport()
		expect(report.total > 0).toBe(report.paths.length > 0)
		expect(report.paths.length).toBeLessThanOrEqual(report.total)
	})

	it('keeps reporting a path that is still present across repeated loads', () => {
		// The fix must not turn into "clear the report and hope": a value that
		// is genuinely invalid stays visible however many times the file is
		// re-read, including via the settings-file watcher on every save.
		write({theme: {fontSize: 'huge'}})

		currentFileRejectedReport()
		currentFileRejectedReport()
		currentFileRejectedReport()

		expect(currentFileRejectedReport()).toEqual({
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

describe('the report blames only the file it names', () => {
	let home: string

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-attrib-'))
		setSettingsHome(home)
		fs.mkdirSync(settingsFile().replace(/[^/\\]+$/, ''), {recursive: true})
	})

	afterEach(() => {
		setSettingsHome(null)
		fs.rmSync(home, {recursive: true, force: true})
	})

	const write = (obj: unknown) =>
		fs.writeFileSync(settingsFile(), JSON.stringify(obj))

	it('does not blame the file for a value only a save rejected', () => {
		// The reported bug. Settings inputs commit on every keystroke, so
		// clearing a field hands the save a transiently invalid value - an empty
		// font size, a scrollback below its minimum. That rejection belongs to
		// the `save` source and never reached the file: `saveSettings` writes
		// the normalised result. The report still surfaced it, and the banner
		// named settings.json, so after a renderer reload the user was told a
		// correct file was invalid with no way to fix it.
		const base = loadSettings()
		saveSettings({...base, theme: {...base.theme, fontSize: 'huge'}} as never)

		expect(rejectedSettingsReport('save')).toEqual({
			paths: ['theme.fontSize'],
			total: 1,
		})
		expect(currentFileRejectedReport()).toEqual({paths: [], total: 0})
	})

	it('does not blame the file for a value only an import rejected', () => {
		// `settings:import` shows its own warning from the `import` source, so
		// folding it into the file's report gave the user the same accusation
		// twice, from two sources that both name the file.
		write({theme: {fontSize: 16}})
		parseImportedSettings({theme: {fontSize: 'huge'}})

		expect(rejectedSettingsReport('import')).toEqual({
			paths: ['theme.fontSize'],
			total: 1,
		})
		expect(currentFileRejectedReport()).toEqual({paths: [], total: 0})
	})

	it('clears the report once a save rewrites the file with valid values', () => {
		// The staleness half of the same bug. `persistWindowBounds` saves on
		// every window move and `saveSettings` writes the normalised result, so
		// a file broken at startup became valid moments later. Without the
		// re-read the init-time snapshot outlived the problem and survived the
		// reload that surfaced it.
		write({theme: {fontSize: 'huge'}})
		expect(currentFileRejectedReport().total).toBe(1)

		saveSettings(loadSettings())

		expect(currentFileRejectedReport()).toEqual({paths: [], total: 0})
	})

	it('still reports a file that is genuinely invalid', () => {
		// The control on the three above: narrowing the source and re-reading
		// must not have silenced real problems.
		write({theme: {fontSize: 'huge'}, terminal: {scrollback: 1}})

		const report = currentFileRejectedReport()
		expect(report.paths.sort()).toEqual([
			'terminal.scrollback',
			'theme.fontSize',
		])
		expect(report.total).toBe(2)
	})

	it('stops reporting once the file is deleted and replaced with defaults', () => {
		// `loadSettings` returns early when the file is missing, before the
		// snapshot is touched, so the rejections it used to hold survived the
		// deletion. The banner would then accuse a file that had just been
		// written with clean defaults.
		write({theme: {fontSize: 'huge'}})
		expect(currentFileRejectedReport().total).toBe(1)

		fs.rmSync(settingsFile())

		expect(currentFileRejectedReport()).toEqual({paths: [], total: 0})
	})

	it('still alarms when the file stops being readable', () => {
		// Malformed JSON has no salvageable fields, so the report cannot name a
		// path - but the file is broken and the previous version's paths are no
		// longer true of it. Silently going quiet here would be the worst
		// outcome: the user would lose the only warning that their settings are
		// not loading.
		write({theme: {fontSize: 'huge'}})
		expect(currentFileRejectedReport().total).toBe(1)

		fs.writeFileSync(settingsFile(), '{ not json')

		const report = currentFileRejectedReport()
		expect(report.total).toBe(1)
		expect(report.paths).toEqual(['(unreadable settings.json)'])
	})
})
