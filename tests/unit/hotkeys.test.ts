import {describe, expect, it} from 'bun:test'
import {matchHotkey, parseHotkey} from '../../src/lib/hotkeys.ts'

describe('Hotkey utilities', () => {
	it('parses hotkey string correctly', () => {
		const parsed = parseHotkey('Ctrl+Shift+D')
		expect(parsed).toEqual({
			ctrl: true,
			alt: false,
			shift: true,
			meta: false,
			key: 'd',
		})
	})

	it('matches keyboard events', () => {
		const event = {ctrlKey: true, shiftKey: true, altKey: false, key: 'D'}
		expect(matchHotkey(event, 'Ctrl+Shift+D')).toBe(true)
		expect(matchHotkey(event, 'Ctrl+Shift+K')).toBe(false)
	})
})
