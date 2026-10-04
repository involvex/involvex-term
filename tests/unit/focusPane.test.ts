import {describe, expect, it} from 'bun:test'
import {focusPaneInTabs} from '../../src/lib/focusPane.ts'

interface Tab {
	id: string
	activePaneId: string
	root: unknown
}

const tabs: Tab[] = [
	{id: 'a', activePaneId: 'a1', root: {}},
	{id: 'b', activePaneId: 'b1', root: {}},
	{id: 'c', activePaneId: 'c1', root: {}},
]

describe('focusPaneInTabs', () => {
	it('moves focus to the requested pane', () => {
		const next = focusPaneInTabs(tabs, 'b', 'b2')

		expect(next.map(t => t.activePaneId)).toEqual(['a1', 'b2', 'c1'])
	})

	it('returns the SAME array when the pane already has focus', () => {
		// The load-bearing case. Every mousedown in a terminal calls this, and
		// most land on the pane that already has focus. `tabBindings` is
		// memoised on `tabs`, so a new array here would rebuild every tab's
		// callbacks and defeat the memo on every PaneLayout in the app.
		const next = focusPaneInTabs(tabs, 'b', 'b1')

		expect(next).toBe(tabs)
	})

	it('keeps the array identity for a redundant focus after a real change', () => {
		const moved = focusPaneInTabs(tabs, 'b', 'b2')

		// Focus b2, then click b2 again: the second call must not allocate.
		expect(focusPaneInTabs(moved, 'b', 'b2')).toBe(moved)
	})

	it('leaves the other tabs structurally identical', () => {
		const next = focusPaneInTabs(tabs, 'b', 'b2') as Tab[]

		// Untouched entries must keep their identity, or memo on the other
		// tabs' PaneLayouts fails for the same reason.
		expect(next[0]).toBe(tabs[0])
		expect(next[2]).toBe(tabs[2])
		expect(next[1]).not.toBe(tabs[1])
	})

	it('only changes the targeted tab', () => {
		const next = focusPaneInTabs(tabs, 'c', 'c9') as Tab[]

		expect(next[2].activePaneId).toBe('c9')
		expect(next[2].root).toBe(tabs[2].root)
	})

	it('returns the same array for an unknown tab', () => {
		// Nothing to focus; must not throw and must not churn identity.
		expect(focusPaneInTabs(tabs, 'nope', 'nope1')).toBe(tabs)
	})

	it('does not mutate the input', () => {
		focusPaneInTabs(tabs, 'b', 'b2')

		expect(tabs.map(t => t.activePaneId)).toEqual(['a1', 'b1', 'c1'])
	})

	it('handles an empty tab list', () => {
		const empty: Tab[] = []
		expect(focusPaneInTabs(empty, 'a', 'a1')).toBe(empty)
	})
})
