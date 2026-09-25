import type {SearchAddon} from '@xterm/addon-search'

const addons = new Map<string, SearchAddon>()

export function registerSearch(tabId: string, addon: SearchAddon): void {
	addons.set(tabId, addon)
}

export function unregisterSearch(tabId: string): void {
	addons.delete(tabId)
}

export function getSearch(tabId: string): SearchAddon | undefined {
	return addons.get(tabId)
}
