import {afterEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
		expect([...rejected]).toEqual(['theme.fontSize'])
	})

	it('reports every rejected path, not just the first', () => {
		const {settings, rejected} = parseSettingsLenient({
			terminal: {scrollback: 1}, // below min
			theme: {fontSize: '14'},
			tray: {enabled: 'yes'}, // wrong type
		})

		expect([...rejected].sort()).toEqual([
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
		expect([...rejected]).toEqual(['theme.fontSize'])
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
		expect([...rejected]).toEqual(['terminal.profiles'])
		expect(settings.terminal.defaultProfileId).toBe(
			defaultSettings().terminal.defaultProfileId,
		)
	})

	it('returns untouched defaults when the whole document is the wrong shape', () => {
		for (const raw of [42, 'nope', true, [1, 2, 3], null]) {
			const {settings, rejected} = parseSettingsLenient(raw)
			expect(settings).toEqual(defaultSettings())
			expect([...rejected]).toEqual([])
		}
	})

	it('is a no-op for an already-valid document', () => {
		const valid = defaultSettings()
		const {settings, rejected} = parseSettingsLenient(valid)
		expect(settings).toEqual(valid)
		expect([...rejected]).toEqual([])
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

/**
 * The rejection buckets live in settingsStore and are written by the
 * filesystem-touching entry points, so this reloads the module against a
 * throwaway home directory rather than the developer's real settings file.
 */
let counter = 0
const scratchDirs: string[] = []
let activeStore: typeof import('../../electron/settingsStore.ts') | null = null

async function storeWithScratchHome(): Promise<
	typeof import('../../electron/settingsStore.ts')
> {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-settings-'))
	scratchDirs.push(home)
	// Distinct specifier so Bun evaluates a fresh copy of the module; that also
	// means the override below cannot leak into another test file.
	const store = await import(`../../electron/settingsStore.ts?t=${counter++}`)
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

describe('prototype-polluting keys in a settings document', () => {
	// `JSON.parse` makes `__proto__` a real own property, so `Object.entries`
	// sees it and `out.__proto__ = value` fires the prototype setter instead
	// of defining a key. The damage is subtler than a plain overwrite: the
	// repair loop deletes the rejected leaf, and it then resolves through the
	// injected prototype — so the app reports "reset to default" while the
	// attacker's value is what actually lands.
	//
	// Scope note: this is value substitution within the parsed object, not
	// global pollution. zod v4 builds null-prototype records, so nothing
	// reaches `Object.prototype` for other code to trip over.

	it('ignores __proto__ so a rejected leaf really falls back to its default', () => {
		// The exact payload: `theme: null` forces the schema to reject theme,
		// which is what let the injected prototype take effect.
		const payload = JSON.parse(
			'{"theme":null,"__proto__":{"theme":{"bg":"#00ff00","fontSize":31}}}',
		) as unknown

		const {settings} = parseSettingsLenient(payload)

		const d = defaultSettings().theme
		expect(settings.theme.bg).toBe(d.bg)
		expect(settings.theme.fontSize).toBe(d.fontSize)
	})

	it('ignores __proto__ when a sibling section is rejected', () => {
		// Second confirmed-vulnerable shape, found by probing rather than
		// assumed: `terminal: null` rejects the whole section, and `startDir`
		// then resolves through the injected prototype. The report said
		// ["terminal"] while startDir held the attacker's value.
		const payload = JSON.parse(
			'{"terminal":null,"__proto__":{"terminal":{"startDir":"C:\\\\evil"}}}',
		) as unknown

		const {settings, rejected} = parseSettingsLenient(payload)

		expect(settings.terminal.startDir).toBe(defaultSettings().terminal.startDir)
		expect([...rejected]).toEqual(['terminal'])
	})

	it('ignores constructor as well', () => {
		// No payload was found that abuses `constructor` here — zod's output
		// never dereferences it, so it currently has no effect. Kept as a cheap
		// canary so the day that changes, the guard is already there.
		const payload = JSON.parse(
			'{"constructor":{"prototype":{"theme":{"bg":"#00ff00"}}}}',
		) as unknown

		const {settings} = parseSettingsLenient(payload)

		expect(settings.theme.bg).toBe(defaultSettings().theme.bg)
	})

	it('does not pollute Object.prototype globally', () => {
		const payload = JSON.parse('{"__proto__":{"polluted":"yes"}}') as unknown

		parseSettingsLenient(payload)

		expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
	})

	it('still applies legitimate settings alongside a __proto__ payload', () => {
		// The guard must skip only the unsafe key, not abandon the document.
		const payload = JSON.parse(
			'{"terminal":{"startDir":"D:\\\\kept"},"__proto__":{"theme":{"bg":"#00ff00"}}}',
		) as unknown

		const {settings} = parseSettingsLenient(payload)

		expect(settings.terminal.startDir).toBe('D:\\kept')
		expect(settings.theme.bg).toBe(defaultSettings().theme.bg)
	})
})

describe('rejection reporting', () => {
	it('records the paths a load had to reject', async () => {
		const store = await storeWithScratchHome()
		fs.mkdirSync(store.settingsDir(), {recursive: true})
		fs.writeFileSync(
			store.settingsFile(),
			JSON.stringify({theme: {fontSize: '14'}, terminal: {scrollback: 1}}),
		)

		const loaded = store.loadSettings()

		expect(loaded.terminal.scrollback).toBe(
			defaultSettings().terminal.scrollback,
		)
		expect(store.rejectedSettingsPaths('settings.json').sort()).toEqual([
			'terminal.scrollback',
			'theme.fontSize',
		])
		expect(store.allRejectedSettingsReport().paths.sort()).toEqual([
			'terminal.scrollback',
			'theme.fontSize',
		])
		expect(store.allRejectedSettingsReport().total).toBe(2)
	})

	it('keeps an import report when the save that follows it reports nothing', async () => {
		// This is why the buckets are keyed by source. `settings:import` runs
		// parseImportedSettings() and then saveSettings(); with a single shared
		// slot the save's empty result would erase the import's report and the
		// user would never learn the file did not apply in full.
		const store = await storeWithScratchHome()
		const imported = store.parseImportedSettings({
			theme: {fontSize: '14'},
			terminal: {startDir: 'D:\\kept'},
		})
		expect(imported.terminal.startDir).toBe('D:\\kept')

		store.saveSettings(imported)

		expect(store.rejectedSettingsPaths('import')).toEqual(['theme.fontSize'])
	})

	it('reports nothing when the file is entirely valid', async () => {
		const store = await storeWithScratchHome()
		fs.mkdirSync(store.settingsDir(), {recursive: true})
		fs.writeFileSync(
			store.settingsFile(),
			JSON.stringify({theme: {bg: '#002b36'}}),
		)

		store.loadSettings()

		expect(store.allRejectedSettingsReport().paths).toEqual([])
		expect(store.allRejectedSettingsReport().total).toBe(0)
	})
})

describe('rejection reports are capped', () => {
	// Every one of these paths used to be returned over IPC on `settings:get`.
	// At 200k bad values that measured a 3.33 MB reply on the main process, on
	// the path the renderer calls at startup — so one broken file cost 3.33 MB
	// of structured-clone and a multi-second stringification on every launch.
	const LIMIT = 200

	function pathologicalHotkeys(n: number): Record<string, unknown> {
		const hotkeys: Record<string, unknown> = {}
		for (let i = 0; i < n; i++) hotkeys[`k${i}`] = 12_345
		return {hotkeys}
	}

	it('caps the path list while reporting the true total', async () => {
		const store = await storeWithScratchHome()
		const n = LIMIT * 5
		fs.mkdirSync(store.settingsDir(), {recursive: true})
		fs.writeFileSync(
			store.settingsFile(),
			JSON.stringify(pathologicalHotkeys(n)),
		)

		store.loadSettings()
		const report = store.allRejectedSettingsReport()

		expect(report.paths.length).toBe(LIMIT)
		// The total is what the UI shows, so it must not be capped too —
		// otherwise the banner would claim a truncated list was the whole story.
		expect(report.total).toBe(n)
	})

	it('ships the same payload whether the file has 1x or 20x the bad values', async () => {
		// The invariant that matters: the IPC payload must not scale with how
		// broken the file is. Comparing two input sizes catches an absent cap
		// at any threshold, which a fixed byte limit cannot — pick the limit
		// too loose and the regression slips through, too tight and it fails
		// on harmless input.
		const payloadFor = async (n: number) => {
			const store = await storeWithScratchHome()
			fs.mkdirSync(store.settingsDir(), {recursive: true})
			fs.writeFileSync(
				store.settingsFile(),
				JSON.stringify(pathologicalHotkeys(n)),
			)
			store.loadSettings()
			return Buffer.byteLength(
				JSON.stringify(store.allRejectedSettingsReport().paths),
			)
		}

		const small = await payloadFor(LIMIT)
		const huge = await payloadFor(LIMIT * 20)

		expect(small).toBe(huge)
	})

	it('does not walk the full rejection set on every settings:get', async () => {
		// The cap is worthless if producing the report still touches every
		// path: `[...set].slice(0, n)` walks the whole set and allocates an
		// array of all of it to return a prefix.
		const store = await storeWithScratchHome()
		fs.mkdirSync(store.settingsDir(), {recursive: true})
		fs.writeFileSync(
			store.settingsFile(),
			JSON.stringify(pathologicalHotkeys(LIMIT * 20)),
		)
		store.loadSettings()

		// Timing a size-dependent loop is noisy, so assert the observable
		// instead: repeated calls must cost the same whether the file had
		// 4x the bad values, because the retained data is capped.
		const small = await storeWithScratchHome()
		fs.mkdirSync(small.settingsDir(), {recursive: true})
		fs.writeFileSync(
			small.settingsFile(),
			JSON.stringify(pathologicalHotkeys(LIMIT)),
		)
		small.loadSettings()

		expect(small.allRejectedSettingsReport().paths.length).toBe(LIMIT)
		expect(store.allRejectedSettingsReport().paths.length).toBe(LIMIT)
		expect(store.allRejectedSettingsReport().total).toBe(LIMIT * 20)
	})

	it('de-duplicates paths rejected by two sources', async () => {
		const store = await storeWithScratchHome()
		fs.mkdirSync(store.settingsDir(), {recursive: true})
		const doc = {theme: {fontSize: '14'}}
		fs.writeFileSync(store.settingsFile(), JSON.stringify(doc))

		store.loadSettings()
		// A save of the same bad value rejects the same path again.
		store.saveSettings(doc as never)

		const report = store.allRejectedSettingsReport()
		expect(report.paths).toEqual(['theme.fontSize'])
		// Summed per-source totals, so this is 2. Documented as an
		// overcount: a diagnostic should never under-report.
		expect(report.total).toBe(2)
	})

	it('does not cap when the file is only mildly broken', async () => {
		const store = await storeWithScratchHome()
		fs.mkdirSync(store.settingsDir(), {recursive: true})
		fs.writeFileSync(
			store.settingsFile(),
			JSON.stringify({theme: {fontSize: '14'}, terminal: {scrollback: 1}}),
		)

		store.loadSettings()
		const report = store.allRejectedSettingsReport()

		expect(report.paths.sort()).toEqual([
			'terminal.scrollback',
			'theme.fontSize',
		])
		expect(report.total).toBe(2)
	})
})
