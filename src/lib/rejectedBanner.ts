/**
 * The "settings.json has invalid values" banner in Settings.
 *
 * Extracted so it can be tested without a DOM, and because the bug it replaces
 * was a comparison against a sentinel that no input could ever produce:
 *
 *   const rejectedKey = `${rejectedCount}\n${rejectedPaths.join('\n')}`
 *   const showRejected = rejectedKey !== '\n' && dismissedKey !== rejectedKey
 *
 * `rejectedKey` is built by interpolation, so with nothing rejected it is
 * `"0\n"` - never `"\n"`. The first clause was therefore always true and the
 * banner rendered unconditionally, reading "0 values in settings.json are
 * invalid and were reset to their default" on a perfectly valid file. The
 * dismissal worked, which is why it looked like a real warning that happened to
 * persist rather than a banner that could never go away.
 */

/** Cap on paths listed under the banner. */
export const REJECTED_PATH_PREVIEW = 8

export interface RejectedBannerInput {
	/** Capped sample of rejected paths, as sent by the main process. */
	paths: string[]
	/** True count, which may exceed `paths.length`. Absent on older mains. */
	total?: number
}

/**
 * The count to show.
 *
 * `paths` is a capped sample, so its length is not the count - a truncated list
 * reported as a count would read as "these were all of them". Prefer the true
 * total, and fall back to the sample's length only for an older main process
 * that sends no total.
 */
export function rejectedCountFor(input: RejectedBannerInput): number {
	return Math.max(input.total ?? 0, input.paths.length)
}

/**
 * Identity of the current finding, so dismissing one does not hide a different
 * one that arrives later.
 */
export function rejectedBannerKey(input: RejectedBannerInput): string {
	return `${rejectedCountFor(input)}\n${input.paths.join('\n')}`
}

/**
 * Whether to show the banner.
 *
 * There is something to report only when the count is above zero. Keying on the
 * key alone cannot express that: an empty finding still produces a non-empty
 * key, because the count of zero is part of it.
 */
export function shouldShowRejectedBanner(
	input: RejectedBannerInput,
	dismissedKey: string | null,
): boolean {
	return (
		rejectedCountFor(input) > 0 && dismissedKey !== rejectedBannerKey(input)
	)
}
