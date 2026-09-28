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

	it('extracts and strips Windows Terminal OSC 9;9 (quoted path)', () => {
		let capturedCwd = ''
		const output = sniffCwd(
			'tab-2',
			'a\x1b]9;9;"C:\\Users\\me\\100% done"\x1b\\PS C:\\> ',
			(_id, cwd) => {
				capturedCwd = cwd
			},
		)

		expect(capturedCwd).toBe('C:\\Users\\me\\100% done')
		expect(output).toBe('aPS C:\\> ')
	})

	it('uses the last cwd sequence when OSC 7 and OSC 9;9 both appear', () => {
		let capturedCwd = ''
		sniffCwd(
			'tab-3',
			'\x1b]9;9;C:\\old\x07\x1b]7;file://localhost/C:/new\x07',
			(_id, cwd) => {
				capturedCwd = cwd
			},
		)
		expect(capturedCwd.endsWith('new')).toBe(true)
	})
})
