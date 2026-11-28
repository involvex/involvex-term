import {describe, expect, it} from 'bun:test'
import {speakBackgroundCompletion} from '../../src/lib/completionSpeech.ts'

describe('speakBackgroundCompletion', () => {
	it('does nothing when the setting is off', () => {
		const spoken: string[] = []
		const ok = speakBackgroundCompletion('Build', {
			enabled: false,
			speech: {
				speak(u) {
					spoken.push(u.text)
				},
			},
		})
		expect(ok).toBe(false)
		expect(spoken).toEqual([])
	})

	it('speaks when enabled and speech is available', () => {
		const spoken: string[] = []
		let cancelled = 0
		const ok = speakBackgroundCompletion('Build', {
			enabled: true,
			speech: {
				cancel() {
					cancelled += 1
				},
				speak(u) {
					spoken.push(u.text)
				},
			},
			createUtterance: text => ({text}),
		})
		expect(ok).toBe(true)
		expect(cancelled).toBe(1)
		expect(spoken).toEqual(['Build finished'])
	})

	it('returns false when speech is unavailable', () => {
		const ok = speakBackgroundCompletion('Pane', {
			enabled: true,
			speech: null,
		})
		expect(ok).toBe(false)
	})

	it('falls back to a default label when empty', () => {
		const spoken: string[] = []
		speakBackgroundCompletion('', {
			enabled: true,
			speech: {
				speak(u) {
					spoken.push(u.text)
				},
			},
			createUtterance: text => ({text}),
		})
		expect(spoken).toEqual(['Background pane finished'])
	})
})
