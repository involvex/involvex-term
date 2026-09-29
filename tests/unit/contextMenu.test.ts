import {describe, expect, test} from 'bun:test'
import {
	buildContextMenuCommand,
	buildContextMenuIcon,
	CONTEXT_MENU_LABEL,
	contextMenuRoots,
	getStatus,
	install,
	parseRegDefault,
	parseRegValue,
	uninstall,
	type RegRunner,
} from '../../packages/cli/src/contextMenu'

describe('context menu command builder', () => {
	test('uses nt -d "%V" verb', () => {
		expect(buildContextMenuCommand('C:\\app\\involvex-term.exe')).toBe(
			'"C:\\app\\involvex-term.exe" nt -d "%V"',
		)
	})

	test('quotes exe paths with spaces', () => {
		const exe =
			'C:\\Users\\me\\AppData\\Local\\Programs\\involvex-term\\involvex-term.exe'
		expect(buildContextMenuCommand(exe)).toBe(`"${exe}" nt -d "%V"`)
		expect(buildContextMenuIcon(exe)).toBe(`"${exe}",0`)
	})

	test('covers folder, background, and drive', () => {
		const roots = contextMenuRoots()
		expect(roots).toHaveLength(3)
		expect(roots.some(k => k.includes('Directory\\shell'))).toBe(true)
		expect(roots.some(k => k.includes('Directory\\Background\\shell'))).toBe(
			true,
		)
		expect(roots.some(k => k.includes('Drive\\shell'))).toBe(true)
	})

	test('label is stable', () => {
		expect(CONTEXT_MENU_LABEL).toBe('Open in involvex-term')
	})
})

describe('reg output parsing', () => {
	test('parses (Default) REG_SZ', () => {
		const out =
			'\r\nHKEY_CURRENT_USER\\foo\r\n    (Default)    REG_SZ    Open in involvex-term\r\n'
		expect(parseRegDefault(out)).toBe('Open in involvex-term')
	})

	test('parses localized default names (de-DE "(Standard)")', () => {
		const out =
			'\r\nHKEY_CURRENT_USER\\foo\r\n    (Standard)    REG_SZ    "C:\\app\\x.exe" nt -d "%V"\r\n'
		expect(parseRegDefault(out)).toBe('"C:\\app\\x.exe" nt -d "%V"')
	})

	test('returns null when missing', () => {
		expect(
			parseRegDefault(
				'ERROR: The system was unable to find the specified registry key.',
			),
		).toBeNull()
	})

	test('parses named Icon value', () => {
		const out = '    Icon    REG_SZ    "C:\\app\\x.exe",0\r\n'
		expect(parseRegValue(out, 'Icon')).toBe('"C:\\app\\x.exe",0')
	})
})

function runnerWith(
	map: Map<string, {status: number; stdout: string; stderr?: string}>,
): {
	run: RegRunner
	calls: string[][]
} {
	const calls: string[][] = []
	const run: RegRunner = args => {
		calls.push(args)
		const key = args.join('|')
		const hit = map.get(key)
		if (hit)
			return {status: hit.status, stdout: hit.stdout, stderr: hit.stderr ?? ''}
		return {status: 1, stdout: '', stderr: ''}
	}
	return {run, calls}
}

describe('install / uninstall / status', () => {
	test('install writes label, icon, and command for each root', () => {
		const {run, calls} = runnerWith(new Map())
		// default stub returns status 1 → override to success
		const ok: RegRunner = args => {
			calls.push(args)
			return {status: 0, stdout: '', stderr: ''}
		}
		install('C:\\app\\involvex-term.exe', ok)
		// 3 roots × 3 writes
		expect(calls).toHaveLength(9)
		const cmds = calls.filter(c => c[0] === 'add' && c[1].endsWith('\\command'))
		expect(cmds).toHaveLength(3)
		for (const c of cmds) {
			const d = c[c.indexOf('/d') + 1]
			expect(d).toBe('"C:\\app\\involvex-term.exe" nt -d "%V"')
		}
		void run
	})

	test('uninstall deletes each root', () => {
		const calls: string[][] = []
		const ok: RegRunner = args => {
			calls.push(args)
			return {status: 0, stdout: '', stderr: ''}
		}
		uninstall(ok)
		expect(calls).toHaveLength(3)
		expect(calls.every(c => c[0] === 'delete')).toBe(true)
	})

	test('status reports installed only when all commands match', () => {
		const exe = 'C:\\app\\involvex-term.exe'
		const expected = `"${exe}" nt -d "%V"`
		const map = new Map<string, {status: number; stdout: string}>()
		for (const k of contextMenuRoots()) {
			map.set(`query|${k}\\command|/ve`, {
				status: 0,
				stdout: `    (Default)    REG_SZ    ${expected}\r\n`,
			})
		}
		const {run} = runnerWith(map)
		const st = getStatus(exe, run)
		expect(st.supported).toBe(true)
		expect(st.installed).toBe(true)
	})

	test('status is unsupported off Windows', () => {
		const st = getStatus(null, undefined, 'linux')
		expect(st.supported).toBe(false)
		expect(st.installed).toBe(false)
	})
})
