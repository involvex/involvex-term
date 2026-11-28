import {afterEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	MAX_COMPLETION_SOUND_BYTES,
	mimeForAudioPath,
	readLocalAudioDataUrl,
} from '../../electron/localAudio.ts'

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-term-audio-'))

afterEach(() => {
	fs.rmSync(scratch, {recursive: true, force: true})
	fs.mkdirSync(scratch, {recursive: true})
})

describe('localAudio', () => {
	it('maps common extensions to MIME types', () => {
		expect(mimeForAudioPath('a.wav')).toBe('audio/wav')
		expect(mimeForAudioPath('b.MP3')).toBe('audio/mpeg')
		expect(mimeForAudioPath('c.txt')).toBe(null)
	})

	it('returns null for missing or non-audio paths', () => {
		expect(readLocalAudioDataUrl('')).toBe(null)
		expect(readLocalAudioDataUrl(path.join(scratch, 'missing.wav'))).toBe(null)
		const txt = path.join(scratch, 'notes.txt')
		fs.writeFileSync(txt, 'nope')
		expect(readLocalAudioDataUrl(txt)).toBe(null)
	})

	it('reads a small wav as a data URL', () => {
		const wav = path.join(scratch, 'ping.wav')
		fs.writeFileSync(wav, Buffer.from([0, 1, 2, 3]))
		const url = readLocalAudioDataUrl(wav)
		expect(url).toBe('data:audio/wav;base64,AAECAw==')
	})

	it('ignores oversized files', () => {
		const big = path.join(scratch, 'huge.wav')
		// Avoid allocating 2MB+ in the test process: stub via open+truncate.
		const fd = fs.openSync(big, 'w')
		fs.ftruncateSync(fd, MAX_COMPLETION_SOUND_BYTES + 1)
		fs.closeSync(fd)
		expect(readLocalAudioDataUrl(big)).toBe(null)
	})
})
