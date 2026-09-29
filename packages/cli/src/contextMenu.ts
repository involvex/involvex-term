// Windows Explorer "Open in involvex-term" — classic per-user (HKCU) verbs.
// Shows under "Show more options" on Windows 11 (modern top-level needs MSIX,
// tracked as a follow-up). No admin required. No new dependencies: reg.exe only.
import {spawnSync} from 'node:child_process'

export const CONTEXT_MENU_KEY = 'InvolvexTerm'
export const CONTEXT_MENU_LABEL = 'Open in involvex-term'

export function contextMenuRoots(): string[] {
	return [
		`HKCU\\Software\\Classes\\Directory\\shell\\${CONTEXT_MENU_KEY}`,
		`HKCU\\Software\\Classes\\Directory\\Background\\shell\\${CONTEXT_MENU_KEY}`,
		`HKCU\\Software\\Classes\\Drive\\shell\\${CONTEXT_MENU_KEY}`,
	]
}

/** `"<exe>" nt -d "%V"` — %V (not %1) is correct for Background/drive verbs. */
export function buildContextMenuCommand(exe: string): string {
	return `"${exe}" nt -d "%V"`
}

export function buildContextMenuIcon(exe: string): string {
	return `"${exe}",0`
}

export type RegRunner = (args: string[]) => {
	status: number | null
	stdout: string
	stderr: string
}

export const defaultRegRunner: RegRunner = args => {
	try {
		const r = spawnSync('reg', args, {encoding: 'utf8', shell: false})
		return {
			status: r.status,
			stdout: typeof r.stdout === 'string' ? r.stdout : '',
			stderr: typeof r.stderr === 'string' ? r.stderr : '',
		}
	} catch (e) {
		return {
			status: 1,
			stdout: '',
			stderr: e instanceof Error ? e.message : String(e),
		}
	}
}

/**
 * Parse `reg query <key> /ve` stdout → the default value, or null.
 * The value name is localized (`(Default)` en-US, `(Standard)` de-DE, …),
 * so match the type + data instead: /ve output carries exactly one value.
 */
export function parseRegDefault(stdout: string): string | null {
	for (const line of stdout.split('\n')) {
		// e.g. `    (Default)    REG_SZ    Open in involvex-term`
		const m = line.match(/^\s*\(.+\)\s+REG_(?:EXPAND_)?SZ\s+(.+)/)
		if (m) return m[1].trim()
	}
	return null
}

/** Parse `reg query <key> /v Icon` stdout → the value, or null. */
export function parseRegValue(stdout: string, name: string): string | null {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const re = new RegExp(`^\\s*${escaped}\\s+REG(?:_EXPAND)?_SZ\\s+(.+)`, 'mi')
	const m = stdout.match(re)
	return m ? m[1].trim() : null
}

export interface ContextMenuRootStatus {
	key: string
	installed: boolean
	command: string | null
}

export interface ContextMenuStatus {
	supported: boolean
	installed: boolean
	exe: string | null
	roots: ContextMenuRootStatus[]
}

function queryKey(
	run: RegRunner,
	key: string,
	extraArgs: string[],
): string | null {
	const r = run(['query', key, ...extraArgs])
	if (r.status !== 0) return null
	if (extraArgs[0] === '/ve') return parseRegDefault(r.stdout)
	return parseRegValue(r.stdout, String(extraArgs[1] ?? ''))
}

export function getStatus(
	exe: string | null,
	run: RegRunner = defaultRegRunner,
	platform: NodeJS.Platform = process.platform,
): ContextMenuStatus {
	if (platform !== 'win32') {
		return {supported: false, installed: false, exe, roots: []}
	}
	const expected = exe ? buildContextMenuCommand(exe) : null
	const roots = contextMenuRoots().map(key => {
		const command = queryKey(run, `${key}\\command`, ['/ve'])
		const installed =
			command !== null && (expected === null || command === expected)
		return {key, installed, command}
	})
	return {
		supported: true,
		installed: roots.length > 0 && roots.every(r => r.installed),
		exe,
		roots,
	}
}

export function install(
	exe: string,
	run: RegRunner = defaultRegRunner,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform !== 'win32') throw new Error('Context menu is Windows-only.')
	if (!exe) throw new Error('App executable path is required.')
	const command = buildContextMenuCommand(exe)
	const icon = buildContextMenuIcon(exe)
	for (const key of contextMenuRoots()) {
		const steps: string[][] = [
			['add', key, '/ve', '/t', 'REG_SZ', '/d', CONTEXT_MENU_LABEL, '/f'],
			['add', key, '/v', 'Icon', '/t', 'REG_SZ', '/d', icon, '/f'],
			['add', `${key}\\command`, '/ve', '/t', 'REG_SZ', '/d', command, '/f'],
		]
		for (const args of steps) {
			const r = run(args)
			if (r.status !== 0) {
				throw new Error(
					`reg ${args.join(' ')} failed: ${r.stderr || r.stdout}`.trim(),
				)
			}
		}
	}
}

export function uninstall(
	run: RegRunner = defaultRegRunner,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform !== 'win32') throw new Error('Context menu is Windows-only.')
	for (const key of contextMenuRoots()) {
		const r = run(['delete', key, '/f'])
		// 1 = key did not exist — treat as success (idempotent uninstall).
		if (r.status !== 0 && r.status !== 1) {
			throw new Error(
				`reg delete ${key} failed: ${r.stderr || r.stdout}`.trim(),
			)
		}
	}
}
