import {describe, expect, it} from 'bun:test'
import {
	isTabNavKey,
	resolveTabNav,
	TAB_PANEL_ID,
	tabDomId,
} from '../../src/lib/tabNav.ts'

describe('resolveTabNav', () => {
	it('moves one tab at a time', () => {
		expect(resolveTabNav('ArrowRight', 0, 3)).toBe(1)
		expect(resolveTabNav('ArrowRight', 1, 3)).toBe(2)
		expect(resolveTabNav('ArrowLeft', 2, 3)).toBe(1)
		expect(resolveTabNav('ArrowLeft', 1, 3)).toBe(0)
	})

	it('wraps at both ends', () => {
		// A strip that stops dead is disorienting: the user cannot tell whether
		// there is more in that direction.
		expect(resolveTabNav('ArrowRight', 2, 3)).toBe(0)
		expect(resolveTabNav('ArrowLeft', 0, 3)).toBe(2)
	})

	it('jumps to the ends with Home and End', () => {
		expect(resolveTabNav('Home', 2, 5)).toBe(0)
		expect(resolveTabNav('End', 0, 5)).toBe(4)
		expect(resolveTabNav('Home', 0, 1)).toBe(0)
		expect(resolveTabNav('End', 0, 1)).toBe(0)
	})

	it('ignores keys it does not own', () => {
		// Notably not ArrowUp/ArrowDown: those belong to the terminal, and
		// swallowing them would break scrolling a pane.
		for (const key of [
			'ArrowUp',
			'ArrowDown',
			'Enter',
			'Escape',
			'Tab',
			'a',
			'Delete',
			' ',
		]) {
			expect(resolveTabNav(key, 1, 4)).toBeNull()
		}
	})

	it('returns null for an empty tab strip', () => {
		for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
			expect(resolveTabNav(key, 0, 0)).toBeNull()
		}
	})

	it('recovers from a stale index rather than going out of bounds', () => {
		// The active tab can close between a keypress and the handler running.
		expect(resolveTabNav('ArrowRight', 9, 3)).toBe(1)
		expect(resolveTabNav('ArrowRight', -1, 3)).toBe(1)
		expect(resolveTabNav('ArrowLeft', 99, 3)).toBe(2)
	})

	it('stays in range for every index of a strip', () => {
		for (const count of [1, 2, 5, 17]) {
			for (let i = 0; i < count; i++) {
				for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
					const next = resolveTabNav(key, i, count)
					expect(next).not.toBeNull()
					expect(next!).toBeGreaterThanOrEqual(0)
					expect(next!).toBeLessThan(count)
				}
			}
		}
	})
})

describe('isTabNavKey', () => {
	it('matches exactly the four handled keys', () => {
		for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
			expect(isTabNavKey(key)).toBe(true)
		}
		for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'PageUp', 'Home ']) {
			expect(isTabNavKey(key)).toBe(false)
		}
	})
})

describe('tab DOM ids', () => {
	it('prefixes tab ids so they cannot collide with other element ids', () => {
		expect(tabDomId('tab-1')).toBe('ivx-tab-1')
		expect(tabDomId('tab-1')).not.toBe('tab-1')
	})

	it('gives distinct tabs distinct ids', () => {
		expect(tabDomId('tab-1')).not.toBe(tabDomId('tab-2'))
	})

	it('names the panel the tabs reference', () => {
		expect(TAB_PANEL_ID).toBe('ivx-tabpanel')
		expect(tabDomId('tab-1')).not.toBe(TAB_PANEL_ID)
	})
})
