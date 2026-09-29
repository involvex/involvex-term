import {spawnSync} from 'node:child_process'

// Renderer-facing Explorer context-menu state. Registry is the source of
// truth (no settings-schema field). Mirrors packages/cli/src/contextMenu.ts —
// kept local so the ESM-bundled main process has no cross-package import.
export const CONTEXT_MENU_KEY = 'InvolvexTerm'
export const CONTEXT_MENU_LABEL = 'Open in involvex-term'

const ROOTS = [
	`HKCU\\Software\\Classes\\Directory\\shell\\${CONTEXT_MENU_KEY}`,
	`HKCU\\Software\\Classes\\Directory\\Background\\shell\\${CONTEXT_MENU_KEY}`,
	`HKCU\\Software\\Classes\\Drive\\shell\\${CONTEXT_MENU_KEY}`,
]

export interface ContextMenuStatus {
	supported: boolean
	installed: boolean
	exe: string | null
	roots: Array<{key: string; installed: boolean; command: string | null}>
}

function reg(args: string[]): {status: number | null; stdout: string} {
	try {
		const r = spawnSync('reg', args, {encoding: 'utf8', shell: false})
		return {
			status: r.status,
			stdout: typeof r.stdout === 'string' ? r.stdout : '',
		}
	} catch {
		return {status: 1, stdout: ''}
	}
}

function parseDefault(stdout: string): string | null {
	// Value name is localized ((Default) en-US, (Standard) de-DE, …) —
	// /ve output carries exactly one value, so match type + data.
	for (const line of stdout.split('\n')) {
		const m = line.match(/^\s*\(.+\)\s+REG(?:_EXPAND)?_SZ\s+(.+)/)
		if (m) return m[1].trim()
	}
	return null
}

function buildCommand(exe: string): string {
	return `"${exe}" nt -d "%V"`
}

export function contextMenuStatus(exe: string | null): ContextMenuStatus {
	if (process.platform !== 'win32') {
		return {supported: false, installed: false, exe, roots: []}
	}
	const expected = exe ? buildCommand(exe) : null
	const roots = ROOTS.map(key => {
		const r = reg(['query', `${key}\\command`, '/ve'])
		const command = r.status === 0 ? parseDefault(r.stdout) : null
		return {
			key,
			command,
			installed:
				command !== null && (expected === null || command === expected),
		}
	})
	return {
		supported: true,
		installed: roots.length > 0 && roots.every(r => r.installed),
		exe,
		roots,
	}
}

export function installContextMenu(exe: string): void {
	if (process.platform !== 'win32') throw new Error('Windows-only.')
	if (!exe) throw new Error('App executable path is required.')
	const command = buildCommand(exe)
	const icon = `"${exe}",0`
	for (const key of ROOTS) {
		const steps: string[][] = [
			['add', key, '/ve', '/t', 'REG_SZ', '/d', CONTEXT_MENU_LABEL, '/f'],
			['add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', icon, '/f'],
			['add', `${key}\\command`, '/ve', '/t', 'REG_SZ', '/d', command, '/f'],
		]
		for (const args of steps) {
			const r = spawnSync('reg', args, {encoding: 'utf8', shell: false})
			if (r.status !== 0) throw new Error(`reg ${args.join(' ')} failed`)
		}
	}
}

export function uninstallContextMenu(): void {
	if (process.platform !== 'win32') throw new Error('Windows-only.')
	for (const key of ROOTS) {
		const r = spawnSync('reg', ['delete', key, '/f'], {
			encoding: 'utf8',
			shell: false,
		})
		// 1 = key did not exist — idempotent uninstall.
		if (r.status !== 0 && r.status !== 1)
			throw new Error(`reg delete ${key} failed`)
	}
}
