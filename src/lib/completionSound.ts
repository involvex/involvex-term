/**
 * Optional custom sound for background-pane completion (FEAT-017).
 * Plays via HTMLAudioElement; invalid/empty paths are ignored.
 */

export interface AudioLike {
	play(): Promise<void> | void
}

export interface PlayCompletionSoundOpts {
	/**
	 * Resolve a filesystem path to an audio src (data: or https:).
	 * Return null when the path is missing/unreadable — play is skipped.
	 */
	resolveSrc?: (filePath: string) => Promise<string | null> | string | null
	/** Injected for tests; defaults to `new Audio(src)`. */
	createAudio?: (src: string) => AudioLike
}

const AUDIO_EXT = /\.(wav|mp3|ogg|m4a|aac|webm|flac)$/i

/** True when the path looks like a local audio file we might play. */
export function isCompletionSoundPath(filePath: string): boolean {
	const trimmed = filePath.trim()
	if (!trimmed) return false
	return AUDIO_EXT.test(trimmed)
}

/**
 * Play a custom completion sound. Returns true only when play was started.
 * Empty paths, failed resolves, and play errors are ignored (return false).
 */
export async function playCompletionSound(
	filePath: string,
	opts: PlayCompletionSoundOpts = {},
): Promise<boolean> {
	const trimmed = filePath.trim()
	if (!trimmed) return false
	if (!isCompletionSoundPath(trimmed)) return false

	try {
		const resolve =
			opts.resolveSrc ??
			((p: string) => {
				// Without a resolver (tests / non-Electron), only accept already-usable srcs.
				if (/^(data:|https?:|file:)/i.test(p)) return p
				return null
			})
		const src = await resolve(trimmed)
		if (!src) return false

		const create =
			opts.createAudio ??
			((s: string) => {
				if (typeof Audio === 'undefined') throw new Error('no Audio')
				return new Audio(s)
			})
		const audio = create(src)
		await audio.play()
		return true
	} catch {
		return false
	}
}
