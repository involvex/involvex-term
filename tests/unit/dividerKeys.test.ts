import {describe, expect, it} from 'bun:test'
import {
	dividerPercent,
	isDividerKey,
	resolveDividerKey,
	SPLIT_MAX,
	SPLIT_MIN,
	SPLIT_STEP,
	SPLIT_STEP_COARSE,
} from '../../src/lib/dividerKeys.ts'

describe('resolveDividerKey', () => {
	it('moves a horizontal divider with the vertical arrows', () => {
		// A horizontal divider runs left-to-right, so Up/Down are its axis.
		expect(resolveDividerKey('ArrowDown', 'horizontal', 0.5)).toBeCloseTo(0.52)
		expect(resolveDividerKey('ArrowUp', 'horizontal', 0.5)).toBeCloseTo(0.48)
	})

	it('moves a vertical divider with the horizontal arrows', () => {
		expect(resolveDividerKey('ArrowRight', 'vertical', 0.5)).toBeCloseTo(0.52)
		expect(resolveDividerKey('ArrowLeft', 'vertical', 0.5)).toBeCloseTo(0.48)
	})

	it('ignores the cross axis rather than pretending to move', () => {
		// Claiming these would move a divider in a direction it cannot go, and
		// swallow keys the terminal or the tab bar may want.
		expect(resolveDividerKey('ArrowLeft', 'horizontal', 0.5)).toBeNull()
		expect(resolveDividerKey('ArrowRight', 'horizontal', 0.5)).toBeNull()
		expect(resolveDividerKey('ArrowUp', 'vertical', 0.5)).toBeNull()
		expect(resolveDividerKey('ArrowDown', 'vertical', 0.5)).toBeNull()
	})

	it('steps further with the coarse flag', () => {
		expect(resolveDividerKey('ArrowDown', 'horizontal', 0.5, true)).toBeCloseTo(
			0.5 + SPLIT_STEP_COARSE,
		)
		expect(resolveDividerKey('ArrowDown', 'horizontal', 0.5)).toBeCloseTo(
			0.5 + SPLIT_STEP,
		)
		expect(SPLIT_STEP_COARSE).toBeGreaterThan(SPLIT_STEP)
	})

	it('jumps to the limits with Home and End', () => {
		// The escape hatch: a split squeezed too thin to grab with a pointer.
		expect(resolveDividerKey('Home', 'horizontal', 0.5)).toBe(SPLIT_MIN)
		expect(resolveDividerKey('End', 'horizontal', 0.5)).toBe(SPLIT_MAX)
		expect(resolveDividerKey('Home', 'vertical', 0.5)).toBe(SPLIT_MIN)
		expect(resolveDividerKey('End', 'vertical', 0.5)).toBe(SPLIT_MAX)
	})

	it('clamps at both limits instead of overshooting', () => {
		// Pane sizes mirror updateSplitRatio's 0.1..0.9; a splitter must not be
		// able to produce a ratio the tree would then reject.
		expect(resolveDividerKey('ArrowUp', 'horizontal', SPLIT_MIN)).toBe(
			SPLIT_MIN,
		)
		expect(resolveDividerKey('ArrowLeft', 'vertical', SPLIT_MIN)).toBe(
			SPLIT_MIN,
		)
		expect(resolveDividerKey('ArrowDown', 'horizontal', SPLIT_MAX)).toBe(
			SPLIT_MAX,
		)
		expect(resolveDividerKey('ArrowRight', 'vertical', SPLIT_MAX)).toBe(
			SPLIT_MAX,
		)
		expect(resolveDividerKey('Home', 'vertical', SPLIT_MIN)).toBe(SPLIT_MIN)
		expect(resolveDividerKey('End', 'vertical', SPLIT_MAX)).toBe(SPLIT_MAX)
	})

	it('agrees with the tree clamp for values outside the range', () => {
		// A ratio restored from an older session can land outside 0.1..0.9.
		for (const r of [-1, 0, 0.05, 0.95, 2]) {
			const next = resolveDividerKey('ArrowDown', 'horizontal', r)
			expect(next).not.toBeNull()
			expect(next!).toBeGreaterThanOrEqual(SPLIT_MIN)
			expect(next!).toBeLessThanOrEqual(SPLIT_MAX)
		}
	})

	it('recovers from a non-finite ratio instead of going nowhere', () => {
		for (const r of [NaN, Infinity, -Infinity]) {
			const next = resolveDividerKey('ArrowDown', 'horizontal', r)
			expect(next).not.toBeNull()
			expect(next!).toBeGreaterThanOrEqual(SPLIT_MIN)
			expect(next!).toBeLessThanOrEqual(SPLIT_MAX)
		}
	})

	it('never returns a value the tree would have to clamp again', () => {
		// Driven to both limits, every reachable ratio stays inside the range.
		for (const dir of ['horizontal', 'vertical'] as const) {
			const [decrease, increase] =
				dir === 'horizontal'
					? (['ArrowUp', 'ArrowDown'] as const)
					: (['ArrowLeft', 'ArrowRight'] as const)
			let r = 0.5
			for (let i = 0; i < 60; i++) {
				r = resolveDividerKey(decrease, dir, r)!
				expect(r).toBeGreaterThanOrEqual(SPLIT_MIN)
				expect(r).toBeLessThanOrEqual(SPLIT_MAX)
			}
			expect(r).toBe(SPLIT_MIN)
			for (let i = 0; i < 60; i++) {
				r = resolveDividerKey(increase, dir, r)!
				expect(r).toBeGreaterThanOrEqual(SPLIT_MIN)
				expect(r).toBeLessThanOrEqual(SPLIT_MAX)
			}
			expect(r).toBe(SPLIT_MAX)
		}
	})

	it('ignores keys it does not own', () => {
		for (const key of [
			'Enter',
			'Escape',
			'Tab',
			' ',
			'PageUp',
			'PageDown',
			'Backspace',
			'a',
			'F5',
		]) {
			expect(resolveDividerKey(key, 'horizontal', 0.5)).toBeNull()
			expect(resolveDividerKey(key, 'vertical', 0.5)).toBeNull()
		}
	})
})

describe('isDividerKey', () => {
	it('matches exactly the six handled keys', () => {
		for (const key of [
			'ArrowUp',
			'ArrowDown',
			'ArrowLeft',
			'ArrowRight',
			'Home',
			'End',
		]) {
			expect(isDividerKey(key)).toBe(true)
		}
	})

	it('does not match keys other handlers want', () => {
		for (const key of ['Enter', 'Escape', 'Tab', ' ', 'PageUp', 'a']) {
			expect(isDividerKey(key)).toBe(false)
		}
	})

	it('agrees with resolveDividerKey on at least one axis', () => {
		// The component preventDefaults on isDividerKey, so the two must not
		// disagree about whether a key is ours.
		for (const key of ['ArrowUp', 'ArrowLeft', 'Home', 'End', 'Enter', 'Tab']) {
			const claimed = isDividerKey(key)
			const acted =
				resolveDividerKey(key, 'horizontal', 0.5) !== null ||
				resolveDividerKey(key, 'vertical', 0.5) !== null
			expect(claimed).toBe(acted)
		}
	})
})

describe('dividerPercent', () => {
	it('renders the ratio as a readable percentage', () => {
		expect(dividerPercent(0.5)).toBe(50)
		expect(dividerPercent(0.1)).toBe(10)
		expect(dividerPercent(0.9)).toBe(90)
		expect(dividerPercent(1 / 3)).toBe(33)
	})

	it('clamps out-of-range values rather than announcing 140%', () => {
		expect(dividerPercent(1.4)).toBe(90)
		expect(dividerPercent(-0.2)).toBe(10)
	})

	it('falls back to centre for a non-finite value', () => {
		for (const r of [NaN, Infinity, -Infinity]) {
			expect(dividerPercent(r)).toBe(50)
		}
	})
})
