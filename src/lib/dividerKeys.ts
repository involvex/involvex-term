/**
 * Keyboard control for split dividers.
 *
 * A `.pane-divider` is a `<div>` with only an `onPointerDown`, so pane sizes were
 * mouse-only. These functions hold the arithmetic - which key moves which way,
 * how far, and where the limits are - separately from the React wiring so the
 * numbers can be tested without a DOM.
 *
 * Limits match `updateSplitRatio` in `panes.ts` (0.1 .. 0.9): a split that
 * collapses to nothing hides its own pane, and one that reaches the far edge
 * leaves the neighbour unusably thin. Duplicated here as named constants
 * rather than imported from the tree module because the clamp there is an
 * inline `Math.min(0.9, Math.max(0.1, ...))`, not an exported pair.
 */

/** Smallest ratio either pane may be squeezed to. Mirrors updateSplitRatio. */
export const SPLIT_MIN = 0.1
/** Largest ratio either pane may take. Mirrors updateSplitRatio. */
export const SPLIT_MAX = 0.9

/** Arrow-key step. Fine enough to land on a usable size in a few presses. */
export const SPLIT_STEP = 0.02
/** Shift+Arrow step, for crossing a wide split without dozens of presses. */
export const SPLIT_STEP_COARSE = 0.1

/** Which way a divider runs, matching `SplitDir` in `panes.ts`. */
export type DividerDir = 'horizontal' | 'vertical'

/**
 * New ratio for a keypress, or null when the key is not ours.
 *
 * Only the arrows along the divider's own axis do anything, per the ARIA
 * window-splitter pattern: a horizontal divider moves with Up/Down, a vertical
 * one with Left/Right. Claiming the cross axis would move the divider in a
 * direction it cannot go.
 *
 * Home and End jump to the limits, which is how a user gets *out* of a split
 * that has been squeezed too far to grab with a pointer.
 */
export function resolveDividerKey(
	key: string,
	dir: DividerDir,
	ratio: number,
	coarse = false,
): number | null {
	// A stale or malformed ratio should still respond sensibly rather than
	// returning null and stranding the key.
	const from = Number.isFinite(ratio) ? clampRatio(ratio) : 0.5
	const step = coarse ? SPLIT_STEP_COARSE : SPLIT_STEP
	if (key === 'Home') return SPLIT_MIN
	if (key === 'End') return SPLIT_MAX
	if (dir === 'horizontal') {
		// Divider runs left-to-right, so it moves vertically.
		if (key === 'ArrowUp') return clampRatio(from - step)
		if (key === 'ArrowDown') return clampRatio(from + step)
	} else {
		if (key === 'ArrowLeft') return clampRatio(from - step)
		if (key === 'ArrowRight') return clampRatio(from + step)
	}
	return null
}

/** True when `key` is one the divider handles, so the caller can preventDefault. */
export function isDividerKey(key: string): boolean {
	return (
		key === 'ArrowUp' ||
		key === 'ArrowDown' ||
		key === 'ArrowLeft' ||
		key === 'ArrowRight' ||
		key === 'Home' ||
		key === 'End'
	)
}

function clampRatio(r: number): number {
	return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r))
}

/**
 * Rounded percentage for `aria-valuenow`.
 *
 * ARIA wants a number a screen reader can read out, and the underlying ratio has
 * more precision than "about a third of the way" implies.
 */
export function dividerPercent(ratio: number): number {
	if (!Number.isFinite(ratio)) return 50
	return Math.round(clampRatio(ratio) * 100)
}
