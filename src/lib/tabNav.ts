/**
 * Keyboard navigation for the tab bar.
 *
 * Kept separate from `TabBar.tsx` so the index arithmetic is testable without
 * a DOM: the roving `tabIndex` in the component is only correct if "which tab
 * does ArrowRight land on" is right.
 */

/** Keys the tab bar itself handles, as opposed to keys it ignores. */
export type TabNavKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'

/**
 * Index the given key moves to, or null when the key is not ours.
 *
 * Wraps at both ends, matching Chrome and VS Code: a tab strip that stops at
 * the ends is disorienting because the user cannot tell whether there is more
 * in that direction. Switching tabs is cheap here — selection only — so the
 * tabs activate as focus moves (automatic activation, per the ARIA pattern)
 * rather than waiting for Enter/Space.
 */
export function resolveTabNav(
	key: string,
	currentIndex: number,
	count: number,
): number | null {
	if (count <= 0) return null
	// A stale index (tab closed mid-flight) should land somewhere sane.
	const from = currentIndex >= 0 && currentIndex < count ? currentIndex : 0
	if (key === 'ArrowRight') return (from + 1) % count
	if (key === 'ArrowLeft') return (from - 1 + count) % count
	if (key === 'Home') return 0
	if (key === 'End') return count - 1
	return null
}

export function isTabNavKey(key: string): key is TabNavKey {
	return (
		key === 'ArrowLeft' ||
		key === 'ArrowRight' ||
		key === 'Home' ||
		key === 'End'
	)
}

/**
 * Keys that act on the focused tab rather than moving focus.
 *
 * The strip is a single Tab stop (roving tabindex), so the per-tab close
 * buttons are `tabIndex={-1}` — otherwise tabbing past the strip costs two
 * stops per tab and a screen-reader user walks the whole list twice. These keys
 * are how a keyboard user still closes a tab without leaving the strip.
 */
export type TabCloseKey = 'Delete' | 'Backspace'

export function isTabCloseKey(key: string): key is TabCloseKey {
	return key === 'Delete' || key === 'Backspace'
}

/** Id of the element that holds the active tab's panes. */
export const TAB_PANEL_ID = 'ivx-tabpanel'

/**
 * DOM id for a tab.
 *
 * A `role="tab"` has to reference its panel with `aria-controls`, and the panel
 * names its tab back with `aria-labelledby`, so the tab needs a stable id in the
 * document. Tab ids are already unique, so the prefix only keeps them from
 * colliding with anything else in the app.
 */
export function tabDomId(tabId: string): string {
	return `ivx-${tabId}`
}
