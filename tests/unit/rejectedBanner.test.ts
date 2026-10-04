import {describe, expect, it} from 'bun:test'
import {
	rejectedBannerKey,
	rejectedCountFor,
	shouldShowRejectedBanner,
} from '../../src/lib/rejectedBanner.ts'

/**
 * The banner reads "N value(s) in settings.json are invalid and were reset to
 * their default. Everything else was kept."
 *
 * The regression: the guard compared a key built by interpolation against a
 * sentinel `'\n'` that interpolation could never produce - with nothing
 * rejected the key is `"0\n"` - so the banner showed unconditionally, claiming
 * a valid settings.json was corrupt.
 */
describe('rejected banner', () => {
	it('stays hidden when nothing was rejected', () => {
		expect(shouldShowRejectedBanner({paths: [], total: 0}, null)).toBe(false)
		expect(shouldShowRejectedBanner({paths: []}, null)).toBe(false)
	})

	it('shows when there are rejected paths', () => {
		expect(
			shouldShowRejectedBanner({paths: ['theme.fontSize'], total: 1}, null),
		).toBe(true)
	})

	it('shows when only a total is known', () => {
		// The sample is capped, so a large finding can arrive with paths and a
		// much larger total. The count must not read as the sample length.
		expect(shouldShowRejectedBanner({paths: [], total: 12}, null)).toBe(true)
	})

	it('stays hidden for a dismissed finding but reappears for a new one', () => {
		// Remembering the key rather than a boolean is the point: dismissing
		// one list must not permanently hide the next.
		const first = {paths: ['theme.fontSize'], total: 1}
		const key = rejectedBannerKey(first)
		expect(shouldShowRejectedBanner(first, key)).toBe(false)
		expect(
			shouldShowRejectedBanner({paths: ['terminal.scrollback'], total: 1}, key),
		).toBe(true)
	})

	it('reports the true count, not the capped sample length', () => {
		// Two paths and a total of 300: showing "2" would claim those were all
		// of them.
		expect(rejectedCountFor({paths: ['a.b', 'c.d'], total: 300})).toBe(300)
		// Older main processes send no total, so the sample is the best answer.
		expect(rejectedCountFor({paths: ['a.b', 'c.d']})).toBe(2)
	})

	it('never produces the sentinel an empty finding would need to match', () => {
		// The specific shape that broke the old guard: an empty finding has to
		// be distinguishable from a real one, and it is - by the count, not by
		// the key being empty.
		expect(rejectedBannerKey({paths: [], total: 0})).not.toBe('\n')
		expect(rejectedBannerKey({paths: [], total: 0})).toBe('0\n')
	})
})
