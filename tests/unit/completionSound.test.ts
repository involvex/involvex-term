import {describe, expect, it} from 'bun:test'
import {
	isCompletionSoundPath,
	playCompletionSound,
} from '../../src/lib/completionSound.ts'

describe('isCompletionSoundPath', () => {
	it('accepts common audio extensions', () => {
		expect(isCompletionSoundPath('C:\\sounds\\done.wav')).toBe(true)
		expect(isCompletionSoundPath('/tmp/ping.mp3')).toBe(true)
		expect(isCompletionSoundPath('notify.ogg')).toBe(true)
	})

	it('rejects empty and non-audio paths', () => {
		expect(isCompletionSoundPath('')).toBe(false)
		expect(isCompletionSoundPath('   ')).toBe(false)
		expect(isCompletionSoundPath('C:\\notes\\readme.txt')).toBe(false)
	})
})

describe('playCompletionSound', () => {
	it('ignores empty path', async () => {
		const ok = await playCompletionSound('', {
			createAudio: () => {
				throw new Error('should not create')
			},
		})
		expect(ok).toBe(false)
	})

	it('ignores invalid / non-audio path without resolving', async () => {
		let resolved = 0
		const ok = await playCompletionSound('C:\\tmp\\notes.txt', {
			resolveSrc: () => {
				resolved += 1
				return 'data:audio/wav;base64,AA=='
			},
			createAudio: () => {
				throw new Error('should not create')
			},
		})
		expect(ok).toBe(false)
		expect(resolved).toBe(0)
	})

	it('ignores when resolveSrc returns null', async () => {
		const ok = await playCompletionSound('/missing/done.wav', {
			resolveSrc: () => null,
			createAudio: () => {
				throw new Error('should not create')
			},
		})
		expect(ok).toBe(false)
	})

	it('plays when resolve and Audio succeed', async () => {
		const played: string[] = []
		const ok = await playCompletionSound('/tmp/done.wav', {
			resolveSrc: () => 'data:audio/wav;base64,AA==',
			createAudio: src => ({
				play() {
					played.push(src)
				},
			}),
		})
		expect(ok).toBe(true)
		expect(played).toEqual(['data:audio/wav;base64,AA=='])
	})

	it('ignores play() rejection', async () => {
		const ok = await playCompletionSound('/tmp/done.mp3', {
			resolveSrc: () => 'data:audio/mpeg;base64,AA==',
			createAudio: () => ({
				play() {
					return Promise.reject(new Error('NotAllowedError'))
				},
			}),
		})
		expect(ok).toBe(false)
	})
})
