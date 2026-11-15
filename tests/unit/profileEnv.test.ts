import {describe, expect, test} from 'bun:test'
import {envToText, textToEnv} from '../../src/lib/profileEnv'

describe('profile env text helpers', () => {
	test('round-trips KEY=value lines', () => {
		const env = {FOO: 'bar', PATH_EXTRA: 'C:\\tools'}
		expect(textToEnv(envToText(env))).toEqual(env)
	})

	test('skips blanks and comments', () => {
		expect(textToEnv('# comment\n\nFOO=1\n=bad\nNOEQ\nBAR=a=b')).toEqual({
			FOO: '1',
			BAR: 'a=b',
		})
	})

	test('empty text yields undefined', () => {
		expect(textToEnv('')).toBeUndefined()
		expect(textToEnv('   \n# only')).toBeUndefined()
		expect(envToText(undefined)).toBe('')
	})
})
