import type {SearchAddon} from '@xterm/addon-search'
import {collectLeaves, type PaneNode} from './panes'

const addons = new Map<string, SearchAddon>()

export function registerSearch(paneId: string, addon: SearchAddon): void {
	addons.set(paneId, addon)
}

export function unregisterSearch(paneId: string): void {
	addons.delete(paneId)
}

export function getSearch(paneId: string): SearchAddon | undefined {
	return addons.get(paneId)
}

export interface PaneSearch {
	paneId: string
	addon: SearchAddon
}

/** All registered search addons for the leaves of a tab's pane tree. */
export function getSearchesForRoot(root: PaneNode): PaneSearch[] {
	const out: PaneSearch[] = []
	const seen = new Set<string>()
	for (const leaf of collectLeaves(root)) {
		if (seen.has(leaf.paneId)) continue
		seen.add(leaf.paneId)
		const addon = addons.get(leaf.paneId)
		if (addon) out.push({paneId: leaf.paneId, addon})
	}
	return out
}
