/**
 * Fresh-launch spawn geometry.
 *
 * On mount the terminal container often isn't laid out yet (grid
 * unmeasured, window restoring, webfont not loaded), so FitAddon proposes
 * collapsed dims (1x1 / 9x5). Spawning ConPTY at those dims makes
 * PSReadLine wrap the first prompt mid-path; it only re-renders on the
 * next input. The spawn therefore waits for a sane measurement.
 */

export const SPAWN_MIN_COLS = 40
export const SPAWN_MIN_ROWS = 10
export const SPAWN_FALLBACK_COLS = 80
export const SPAWN_FALLBACK_ROWS = 24
/** Give layout this long to settle before falling back to 80x24. */
export const SPAWN_READY_TIMEOUT_MS = 2500
/** Spawn only after N consecutive stable measurements (window restore). */
export const SPAWN_STABLE_SAMPLES = 3
/** Poll interval while waiting for stable geometry. */
export const SPAWN_POLL_MS = 100
/** A measurement counts as stable when it moves at most this much. */
export const SPAWN_STABLE_TOLERANCE = 2
/** Debounce for post-spawn ConPTY resizes (window animate/maximize). */
export const RESIZE_DEBOUNCE_MS = 150

export function isSpawnableGeometry(cols: number, rows: number): boolean {
	return (
		Number.isFinite(cols) &&
		Number.isFinite(rows) &&
		cols >= SPAWN_MIN_COLS &&
		rows >= SPAWN_MIN_ROWS
	)
}

/** True when two measurements are close enough to count as settled. */
export function isStableGeometry(
	prev: {cols: number; rows: number} | null,
	next: {cols: number; rows: number},
	tolerance: number = SPAWN_STABLE_TOLERANCE,
): boolean {
	if (!prev) return false
	return (
		Math.abs(prev.cols - next.cols) <= tolerance &&
		Math.abs(prev.rows - next.rows) <= tolerance
	)
}

/**
 * Post-spawn guard: never push transient collapses (window animate,
 * grid unmeasured, font swap) into ConPTY. A collapsed ConPTY rewraps
 * the PSReadLine prompt mid-path (vertical `PS D:\\re / os\\open …`
 * fragments) and desyncs xterm rows so typing lands mid-screen.
 * Returns true when the resize should be applied.
 */
export function shouldSyncResize(
	cols: number,
	rows: number,
	lastSent: {cols: number; rows: number} | null,
): boolean {
	if (!isSpawnableGeometry(cols, rows)) return false
	if (!lastSent) return true
	return cols !== lastSent.cols || rows !== lastSent.rows
}
