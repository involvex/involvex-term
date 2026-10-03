import {describe, expect, it} from 'bun:test'
import {
	defaultSettings,
	parseSettingsLenient,
	SettingsSchema,
} from '../../electron/settingsStore.ts'

describe('parseSettingsLenient', () => {
	it('keeps every valid setting when one field is malformed', () => {
		// The regression this replaces: one bad value made SettingsSchema.parse
		// throw and the caller returned pristine defaults, so `startDir` and
		// `scrollback` below were silently reset too.
		const {settings, rejected} = parseSettingsLenient({
			terminal: {startDir: 'D:\\repos', scrollback: 12_345},
			theme: {fontSize: '14'},
		})

		expect(settings.terminal.startDir).toBe('D:\\repos')
		expect(settings.terminal.scrollback).toBe(12_345)
		expect(settings.theme.fontSize).toBe(defaultSettings().theme.fontSize)
		expect(rejected).toEqual(['theme.fontSize'])
	})

	it('reports every rejected path, not just the first', () => {
		const {settings, rejected} = parseSettingsLenient({
			terminal: {scrollback: 1}, // below min
			theme: {fontSize: '14'},
			tray: {enabled: 'yes'}, // wrong type
		})

		expect(rejected.sort()).toEqual([
			'terminal.scrollback',
			'theme.fontSize',
			'tray.enabled',
		])
		expect(settings.terminal.scrollback).toBe(
			defaultSettings().terminal.scrollback,
		)
		expect(settings.tray.enabled).toBe(defaultSettings().tray.enabled)
	})

	it('preserves valid siblings inside the section that had the bad field', () => {
		const {settings, rejected} = parseSettingsLenient({
			theme: {bg: '#002b36', fg: '#839496', fontSize: 99},
		})

		expect(settings.theme.bg).toBe('#002b36')
		expect(settings.theme.fg).toBe('#839496')
		expect(settings.theme.fontSize).toBe(defaultSettings().theme.fontSize)
		expect(rejected).toEqual(['theme.fontSize'])
	})

	it('drops the whole array rather than splicing out one bad element', () => {
		// Splicing profiles[0] would renumber every later profile and silently
		// invalidate terminal.defaultProfileId.
		const {settings, rejected} = parseSettingsLenient({
			terminal: {
				profiles: [
					{id: 'pwsh', name: 'PowerShell', command: 'pwsh.exe'},
					{id: 'git', name: 42, command: 'git'},
				],
			},
		})

		expect(settings.terminal.profiles).toEqual(
			defaultSettings().terminal.profiles,
		)
		expect(rejected).toEqual(['terminal.profiles'])
		expect(settings.terminal.defaultProfileId).toBe(
			defaultSettings().terminal.defaultProfileId,
		)
	})

	it('returns untouched defaults when the whole document is the wrong shape', () => {
		for (const raw of [42, 'nope', true, [1, 2, 3], null]) {
			const {settings, rejected} = parseSettingsLenient(raw)
			expect(settings).toEqual(defaultSettings())
			expect(rejected).toEqual([])
		}
	})

	it('is a no-op for an already-valid document', () => {
		const valid = defaultSettings()
		const {settings, rejected} = parseSettingsLenient(valid)
		expect(settings).toEqual(valid)
		expect(rejected).toEqual([])
	})

	it('strips unknown keys without disturbing known ones', () => {
		const {settings} = parseSettingsLenient({
			terminal: {startDir: 'C:\\work', somethingRemovedInAPastRelease: true},
		})
		expect(settings.terminal.startDir).toBe('C:\\work')
		expect('somethingRemovedInAPastRelease' in settings.terminal).toBe(false)
	})

	it('does not mutate the caller-supplied object', () => {
		const raw = {terminal: {startDir: 'D:\\repos', scrollback: 1}}
		const snapshot = structuredClone(raw)
		parseSettingsLenient(raw)
		expect(raw).toEqual(snapshot)
	})

	it('still fills in defaults for keys the document never mentioned', () => {
		const {settings} = parseSettingsLenient({terminal: {startDir: 'D:\\repos'}})
		expect(settings).toEqual({
			...defaultSettings(),
			terminal: {
				...defaultSettings().terminal,
				startDir: 'D:\\repos',
			},
		})
	})

	it('matches the strict schema when nothing is malformed', () => {
		const raw = {terminal: {startDir: 'D:\\repos'}, theme: {bg: '#002b36'}}
		expect(parseSettingsLenient(raw).settings).toEqual(
			SettingsSchema.parse({
				...defaultSettings(),
				terminal: {...defaultSettings().terminal, startDir: 'D:\\repos'},
				theme: {...defaultSettings().theme, bg: '#002b36'},
			}),
		)
	})
})
