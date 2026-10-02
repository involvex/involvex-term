import {describe, expect, it} from 'bun:test'
import {
	SPAWN_FALLBACK_COLS,
	SPAWN_FALLBACK_ROWS,
	SPAWN_MIN_COLS,
	SPAWN_MIN_ROWS,
	isSpawnableGeometry,
} from '../../src/lib/spawnGeometry.ts'

describe('spawn geometry gate', () => {
	it('accepts sane terminal sizes including the boundary', () => {
		expect(isSpawnableGeometry(80, 24)).toBe(true)
		expect(isSpawnableGeometry(120, 30)).toBe(true)
		expect(isSpawnableGeometry(SPAWN_MIN_COLS, SPAWN_MIN_ROWS)).toBe(true)
	})

	it('rejects the mount-time collapse (1x1 / 9x5) and narrow fits', () => {
		expect(isSpawnableGeometry(1, 1)).toBe(false)
		expect(isSpawnableGeometry(9, 5)).toBe(false)
		expect(isSpawnableGeometry(0, 0)).toBe(false)
		expect(isSpawnableGeometry(SPAWN_MIN_COLS - 1, 24)).toBe(false)
		expect(isSpawnableGeometry(80, SPAWN_MIN_ROWS - 1)).toBe(false)
	})

	it('rejects non-finite dimensions', () => {
		expect(isSpawnableGeometry(NaN, 24)).toBe(false)
		expect(isSpawnableGeometry(80, Infinity)).toBe(false)
	})

	it('falls back to a classic 80x24', () => {
		expect(SPAWN_FALLBACK_COLS).toBe(80)
		expect(SPAWN_FALLBACK_ROWS).toBe(24)
		expect(isSpawnableGeometry(SPAWN_FALLBACK_COLS, SPAWN_FALLBACK_ROWS)).toBe(
			true,
		)
	})
})
