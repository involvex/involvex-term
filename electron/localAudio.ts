import fs from 'node:fs'
import path from 'node:path'

/** Cap so a huge file cannot inflate the renderer via data URL. */
export const MAX_COMPLETION_SOUND_BYTES = 2 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
	'.wav': 'audio/wav',
	'.mp3': 'audio/mpeg',
	'.ogg': 'audio/ogg',
	'.m4a': 'audio/mp4',
	'.aac': 'audio/aac',
	'.webm': 'audio/webm',
	'.flac': 'audio/flac',
}

export function mimeForAudioPath(filePath: string): string | null {
	const ext = path.extname(filePath).toLowerCase()
	return MIME_BY_EXT[ext] ?? null
}

/**
 * Read a local audio file as a data URL for HTMLAudioElement under
 * webSecurity. Returns null when missing, too large, or not an audio type.
 */
export function readLocalAudioDataUrl(filePath: string): string | null {
	const trimmed = filePath.trim()
	if (!trimmed) return null
	const mime = mimeForAudioPath(trimmed)
	if (!mime) return null
	try {
		const st = fs.statSync(trimmed)
		if (!st.isFile() || st.size <= 0 || st.size > MAX_COMPLETION_SOUND_BYTES)
			return null
		const buf = fs.readFileSync(trimmed)
		return `data:${mime};base64,${buf.toString('base64')}`
	} catch {
		return null
	}
}
