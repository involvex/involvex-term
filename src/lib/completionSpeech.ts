/**
 * Opt-in spoken readout for background-pane completion (FEAT-007).
 * Uses the Web Speech API when available; no native dependency.
 */

export interface SpeechSynthesisLike {
	speak(utterance: {text: string}): void
	cancel?(): void
}

export interface SpeakCompletionOpts {
	/** Must be true — speech is off by default. */
	enabled: boolean
	/** Injected for tests; defaults to `window.speechSynthesis` in the browser. */
	speech?: SpeechSynthesisLike | null
	/** Build the utterance; defaults to `SpeechSynthesisUtterance` when present. */
	createUtterance?: (text: string) => {text: string}
}

/**
 * Speak a short completion phrase for a background pane.
 * Returns true only when speech was actually requested.
 */
export function speakBackgroundCompletion(
	label: string,
	opts: SpeakCompletionOpts,
): boolean {
	if (!opts.enabled) return false
	const speech =
		opts.speech !== undefined
			? opts.speech
			: typeof globalThis !== 'undefined' &&
				  'speechSynthesis' in globalThis &&
				  (globalThis as {speechSynthesis?: SpeechSynthesisLike})
						.speechSynthesis
				? (globalThis as {speechSynthesis: SpeechSynthesisLike}).speechSynthesis
				: null
	if (!speech) return false

	const text = `${label || 'Background pane'} finished`
	const utterance = opts.createUtterance
		? opts.createUtterance(text)
		: typeof SpeechSynthesisUtterance !== 'undefined'
			? new SpeechSynthesisUtterance(text)
			: {text}

	try {
		speech.cancel?.()
		speech.speak(utterance)
		return true
	} catch {
		return false
	}
}
