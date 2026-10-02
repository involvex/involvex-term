/**
 * Background-pane completion tracking.
 *
 * The old heuristic toasted on ANY background output + 1.2s quiet (or ANY
 * BEL), which false-positived constantly: session-restore spawn banners,
 * bursty watchers/servers pausing mid-run, stray beeps, ANSI repaints.
 *
 * A genuine completion is background output followed by a FRESH PROMPT —
 * main already detects every prompt render via OSC 7/633/9;9 (`sniffCwd`)
 * and forwards it as `pty:prompt`. So the prompt path owns notifications
 * once a pane has proven prompt-OSC capable; the idle timer survives only
 * as a fallback for shells that never emit prompt OSCs (plain bash).
 *
 * Rules:
 * - The first prompt per pane is the shell-init prompt: never toasts.
 * - One toast per background stint: cleared when the pane is foregrounded.
 *   (A second completion requires user input, which requires foreground,
 *   so this never suppresses a legit repeat.)
 * - Prompt and its text may arrive in either order (OSC split across
 *   chunks): an unarmed prompt leaves a short pending window that a
 *   following text chunk completes.
 * - Legacy idle path: only before any prompt OSC was ever seen, and only
 *   for output past a spawn grace (covers the restore-banner storm).
 */

export const COMPLETION_GRACE_MS = 5000
export const COMPLETION_IDLE_MS = 1200
const PROMPT_PENDING_MS = 2000

export interface CompletionTracker {
	/** Background pty text arrived. Returns whether to (re)arm the idle timer. */
	data(
		background: boolean,
		hasOutput: boolean,
		now: number,
	): {
		shouldToast: boolean
		armIdle: boolean
	}
	/** A prompt OSC was seen for this pane. */
	prompt(background: boolean, chunkHadOutput: boolean, now: number): boolean
	/** Legacy idle timer fired. Only meaningful pre-capability. */
	idleExpired(background: boolean, now: number): boolean
	/** Pane is being looked at: clears armed/pending/stint state. */
	noteForeground(): void
}

export function createCompletionTracker(
	now: number = Date.now(),
): CompletionTracker {
	const bornAt = now
	let promptsSeen = 0
	let capable = false
	let armed = false
	let pendingPromptUntil = 0
	let notifiedStint = false

	return {
		data(background, hasOutput, now) {
			if (!background) {
				armed = false
				pendingPromptUntil = 0
				notifiedStint = false
				return {shouldToast: false, armIdle: false}
			}
			if (notifiedStint) return {shouldToast: false, armIdle: false}
			if (hasOutput) {
				if (pendingPromptUntil > 0 && now <= pendingPromptUntil) {
					armed = false
					pendingPromptUntil = 0
					notifiedStint = true
					return {shouldToast: true, armIdle: false}
				}
				armed = true
			}
			return {
				shouldToast: false,
				armIdle: !capable && hasOutput && now - bornAt >= COMPLETION_GRACE_MS,
			}
		},

		prompt(background, chunkHadOutput, now) {
			promptsSeen += 1
			capable = true
			if (!background) {
				armed = false
				pendingPromptUntil = 0
				notifiedStint = false
				return false
			}
			// Shell-init prompt: never a completion.
			if (promptsSeen <= 1) {
				armed = false
				pendingPromptUntil = 0
				return false
			}
			if (notifiedStint) return false
			if (armed || chunkHadOutput) {
				armed = false
				pendingPromptUntil = 0
				notifiedStint = true
				return true
			}
			pendingPromptUntil = now + PROMPT_PENDING_MS
			return false
		},

		idleExpired(background, now) {
			if (!background || capable || notifiedStint || !armed) return false
			if (now - bornAt < COMPLETION_GRACE_MS) return false
			armed = false
			notifiedStint = true
			return true
		},

		noteForeground() {
			armed = false
			pendingPromptUntil = 0
			notifiedStint = false
		},
	}
}
