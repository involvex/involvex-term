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

		// `normalizeWinPath` is deliberately platform-conditional (it turns the
		// URL path `/C:/repos/app` into `C:\repos\app`), so the expected value
		// legitimately differs off Windows. Asserting the Windows form
		// unconditionally made this suite Linux-only-red.
		expect(capturedCwd).toBe(
			process.platform === 'win32' ? 'C:\\repos\\app' : '/C:/repos/app',
		)
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

	it('reassembles a sequence split across chunks', () => {
		const seen: string[] = []
		const cb = (_id: string, cwd: string) => seen.push(cwd)
		const a = sniffCwd('tab-4', 'hi\x1b]9;9;C:\\spl', cb)
		expect(a).toBe('hi')
		expect(seen).toEqual([])
		const b = sniffCwd('tab-4', 'it\x1b\\ok', cb)
		expect(b).toBe('ok')
		expect(seen).toEqual(['C:\\split'])
	})

	it('does not hold back unrelated escape sequences', () => {
		expect(sniffCwd('tab-5', 'x\x1b]0;title')).toBe('x\x1b]0;title')
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
