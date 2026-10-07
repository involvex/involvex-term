import {countLeaves, type PaneNode} from './panes'

/**
 * Pane budget: each pane pins a ConPTY pair + a full shell process
 * (pwsh7 ≈ 100–200MB). 5 tabs × 2–3 panes crashed the app with a 728MB
 * dump, so cap growth with a readable toast instead of a silent crash.
 * Main enforces a higher hard ceiling (MAX_LIVE_PTYS); this soft budget
 * trips first, where we can explain it.
 */
export const MAX_TABS = 10
export const MAX_TOTAL_PANES = 20
export const MAX_PANES_PER_TAB = 6

export function totalPanes(tabs: {root: PaneNode}[]): number {
	return tabs.reduce((n, t) => n + countLeaves(t.root), 0)
}
