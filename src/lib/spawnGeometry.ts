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

export function isSpawnableGeometry(cols: number, rows: number): boolean {
	return (
		Number.isFinite(cols) &&
		Number.isFinite(rows) &&
		cols >= SPAWN_MIN_COLS &&
		rows >= SPAWN_MIN_ROWS
	)
}
