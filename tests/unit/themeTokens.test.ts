import {describe, expect, it} from 'bun:test'
import {THEME_PRESETS} from '../../src/lib/themePresets.ts'
import {
	applyThemeTokens,
	FALLBACK_THEME_BG,
	FALLBACK_THEME_FG,
	isUsableColor,
	resolveThemeColor,
} from '../../src/lib/themeTokens.ts'

/** Stand-in for document.documentElement — records setProperty calls in order. */
function stubRoot(): {
	calls: Array<[string, string]>
	root: {style: {setProperty(name: string, value: string): void}}
} {
	const calls: Array<[string, string]> = []
	return {
		calls,
		root: {style: {setProperty: (n, v) => calls.push([n, v])}},
	}
}

describe('isUsableColor', () => {
	it('accepts every colour shape a shipped preset uses', () => {
		for (const preset of THEME_PRESETS) {
			expect(isUsableColor(preset.bg)).toBe(true)
			expect(isUsableColor(preset.fg)).toBe(true)
		}
	})

	it('accepts the hex forms users may type into settings.json', () => {
		for (const v of ['#abc', '#abcd', '#1e1e1e', '#1E1E1EFF', '  #fff  ']) {
			expect(isUsableColor(v)).toBe(true)
		}
	})

	it('rejects values that would poison every derived color-mix()', () => {
		for (const v of [
			'',
			'   ',
			'banana',
			'#12',
			'#12345',
			'rgb(',
			undefined,
			null,
			42,
			{},
		]) {
			expect(isUsableColor(v)).toBe(false)
		}
	})
})

describe('resolveThemeColor', () => {
	it('passes a valid colour through, trimmed', () => {
		expect(resolveThemeColor('  #002b36 ', FALLBACK_THEME_BG)).toBe('#002b36')
	})

	it('falls back when the value is missing or unusable', () => {
		expect(resolveThemeColor(undefined, FALLBACK_THEME_BG)).toBe(
			FALLBACK_THEME_BG,
		)
		expect(resolveThemeColor('not-a-colour', FALLBACK_THEME_FG)).toBe(
			FALLBACK_THEME_FG,
		)
	})
})

describe('applyThemeTokens', () => {
	it('writes exactly the two theme inputs the stylesheet derives from', () => {
		const {calls, root} = stubRoot()
		applyThemeTokens({bg: '#002b36', fg: '#839496'}, root)
		expect(calls).toEqual([
			['--theme-bg', '#002b36'],
			['--theme-fg', '#839496'],
		])
	})

	it('keeps the default ramp intact for the default preset', () => {
		const {calls, root} = stubRoot()
		applyThemeTokens({bg: FALLBACK_THEME_BG, fg: FALLBACK_THEME_FG}, root)
		expect(calls).toEqual([
			['--theme-bg', '#1e1e1e'],
			['--theme-fg', '#cccccc'],
		])
	})

	it('falls back per-field so one bad value cannot blank the whole app', () => {
		const {calls, root} = stubRoot()
		applyThemeTokens({bg: 'banana', fg: '#839496'}, root)
		expect(calls).toEqual([
			['--theme-bg', FALLBACK_THEME_BG],
			['--theme-fg', '#839496'],
		])
	})

	it('survives a missing or null theme', () => {
		for (const theme of [null, undefined, {}]) {
			const {calls, root} = stubRoot()
			applyThemeTokens(theme, root)
			expect(calls).toEqual([
				['--theme-bg', FALLBACK_THEME_BG],
				['--theme-fg', FALLBACK_THEME_FG],
			])
		}
	})

	it('is a no-op without a DOM instead of throwing', () => {
		expect(() => applyThemeTokens({bg: '#fff', fg: '#000'}, null)).not.toThrow()
	})
})
