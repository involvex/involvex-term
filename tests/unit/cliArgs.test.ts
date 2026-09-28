import {describe, expect, it} from 'bun:test'
import {parseCliArgs} from '../../electron/cliArgs.ts'

describe('parseCliArgs', () => {
	it('ignores normal launches', () => {
		expect(parseCliArgs([])).toBeNull()
		expect(parseCliArgs(['--flag'])).toBeNull()
	})

	it('parses split with direction and dir', () => {
		expect(parseCliArgs(['sp', '-V', '-d', 'C:\\x'])).toEqual({
			kind: 'split',
			direction: 'vertical',
			dir: 'C:\\x',
			profile: undefined,
		})
	})

	it('parses nt/st as new tab', () => {
		expect(parseCliArgs(['nt', '-p', 'pwsh'])).toEqual({
			kind: 'new-tab',
			dir: undefined,
			profile: 'pwsh',
		})
		expect(parseCliArgs(['st'])?.kind).toBe('new-tab')
	})
})
