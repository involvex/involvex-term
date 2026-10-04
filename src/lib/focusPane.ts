/**
 * Focus a pane within its tab, as a pure state transition.
 *
 * Every mousedown inside a terminal routes here, including clicks on the pane
 * that already has focus - the overwhelmingly common case. Returning the
 * *same array* for that case is the whole point of this living outside the
 * component: `tabBindings` is memoised on `tabs`, so a fresh array rebuilds
 * every tab's `onFocusPane`/`onResizeSplit`/`onPaneMenu` closures and defeats
 * the `memo` on every `PaneLayout` in the app, not just the one clicked.
 *
 * Separate from the component so it can be tested without a DOM, the same
 * reason `dividerKeys.ts` holds the divider arithmetic.
 */
export function focusPaneInTabs<T extends {id: string; activePaneId: string}>(
	tabs: readonly T[],
	tabId: string,
	paneId: string,
): readonly T[] {
	const tab = tabs.find(t => t.id === tabId)
	// Unknown tab: nothing to focus, and returning `tabs` keeps the identity.
	// Already-focused pane: returning `tabs` is what avoids the cascade above.
	if (!tab || tab.activePaneId === paneId) return tabs
	return tabs.map(t => (t.id === tabId ? {...t, activePaneId: paneId} : t))
}
