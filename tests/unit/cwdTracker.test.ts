import {describe, expect, it} from 'bun:test'
import {sniffCwd} from '../../electron/cwdTracker.ts'

describe('CWD Tracker OSC7 sniffing', () => {
	it('extracts and strips OSC7 escape sequence', () => {
		let capturedCwd = ''
		const output = sniffCwd(
			'tab-1',
			'hello\x1b]7;file://localhost/C:/repos/app\x07world',
			(id, cwd) => {
				capturedCwd = cwd
			},
		)

		expect(capturedCwd).toBe('C:\\repos\\app')
		expect(output).not.toContain('\x1b]7;')
		expect(output).toContain('helloworld')
	})
})
