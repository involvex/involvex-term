import {describe, expect, it} from 'bun:test'
import {
	MAX_PANES_PER_TAB,
	MAX_TABS,
	MAX_TOTAL_PANES,
	totalPanes,
} from '../../src/lib/paneBudget.ts'
import type {PaneLeaf} from '../../src/lib/panes.ts'

function leaf(paneId: string): PaneLeaf {
	return {kind: 'leaf', paneId}
}

describe('paneBudget', () => {
	it('exposes a sane budget (soft cap below the main-process ceiling)', () => {
		// Main's MAX_LIVE_PTYS is 24; the renderer budget must trip first.
		expect(MAX_TOTAL_PANES).toBeLessThan(24)
		expect(MAX_PANES_PER_TAB).toBeGreaterThan(1)
		expect(MAX_TABS).toBeGreaterThan(1)
	})

	it('counts leaves across tabs', () => {
		expect(totalPanes([])).toBe(0)
		expect(
			totalPanes([
				{root: leaf('a')},
				{
					root: {
						kind: 'split',
						id: 's1',
						dir: 'vertical',
						ratio: 0.5,
						first: leaf('b'),
						second: leaf('c'),
					},
				},
			]),
		).toBe(3)
	})
})
