import {describe, expect, it} from 'bun:test'
import {
	BASH_OSC7_MARKER,
	BASH_OSC7_SCRIPT,
	linuxOsc7Spawn,
	resolveProfile,
	type ShellProfile,
} from '../../electron/shellProfiles.ts'

describe('linuxOsc7Spawn', () => {
	it('injects bash OSC7 via login -c and keeps a login flag', () => {
		const {args, env} = linuxOsc7Spawn('/bin/bash', ['--login'])
		expect(env).toBeUndefined()
		expect(args).toContain('--login')
		expect(args).toContain('-c')
		const scriptArg = args[args.indexOf('-c') + 1] ?? ''
		expect(scriptArg).toContain('base64')
		expect(BASH_OSC7_SCRIPT).toContain(BASH_OSC7_MARKER)
		expect(BASH_OSC7_SCRIPT).toContain('PROMPT_COMMAND')
		expect(BASH_OSC7_SCRIPT).toContain('exec bash -i')
	})

	it('injects zsh OSC7 via ZDOTDIR and -l -i', () => {
		const {args, env} = linuxOsc7Spawn('/usr/bin/zsh', ['--login'])
		expect(args).toContain('-l')
		expect(args).toContain('-i')
		expect(env?.['ZDOTDIR']).toBeTruthy()
		expect(env!['ZDOTDIR']).toContain('involvex-term-zsh-osc7')
	})

	it('leaves unknown shells on plain login args', () => {
		const {args, env} = linuxOsc7Spawn('/usr/bin/fish', ['--login'])
		expect(env).toBeUndefined()
		expect(args).toEqual(['--login'])
	})
})

describe('resolveProfile Linux OSC7', () => {
	it('wires the default custom bash profile for OSC7 when not on Windows', () => {
		if (process.platform === 'win32') return
		const profile: ShellProfile = {
			id: 'default',
			name: 'bash',
			kind: 'custom',
			command: '/bin/bash',
			args: ['--login'],
		}
		const resolved = resolveProfile(profile)
		expect(resolved.args).toContain('--login')
		expect(resolved.args).toContain('-c')
		const c = resolved.args[resolved.args.indexOf('-c') + 1] ?? ''
		expect(c).toContain('base64')
	})
})
