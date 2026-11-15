import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Renderer-facing Explorer context-menu state. Registry is the source of
// truth (no settings-schema field). Mirrors packages/cli contextMenu +
// modernContextMenu — kept local so the ESM-bundled main process has no
// cross-package import.
export const CONTEXT_MENU_KEY = 'InvolvexTerm'
export const CONTEXT_MENU_LABEL = 'Open in involvex-term'
export const SPARSE_PACKAGE_FAMILY = 'dev.involvex.term.explorer'
export const SPARSE_MSIX_NAME = 'InvolvexTermExplorerCommand.msix'
export const SPARSE_DLL_NAME = 'InvolvexTermExplorerCommand.dll'

const ROOTS = [
	`HKCU\\Software\\Classes\\Directory\\shell\\${CONTEXT_MENU_KEY}`,
	`HKCU\\Software\\Classes\\Directory\\Background\\shell\\${CONTEXT_MENU_KEY}`,
	`HKCU\\Software\\Classes\\Drive\\shell\\${CONTEXT_MENU_KEY}`,
]

export interface ModernContextMenuStatus {
	supported: boolean
	installed: boolean
	msixPath: string | null
	dllPath: string | null
	detail: string | null
}

export interface ContextMenuStatus {
	supported: boolean
	installed: boolean
	exe: string | null
	roots: Array<{key: string; installed: boolean; command: string | null}>
	modern: ModernContextMenuStatus
	/** Set when classic install succeeded but modern registration failed. */
	modernError?: string | null
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

function ps(command: string): {
	status: number | null
	stdout: string
	stderr: string
} {
	try {
		const r = spawnSync(
			'powershell.exe',
			[
				'-NoProfile',
				'-NonInteractive',
				'-ExecutionPolicy',
				'Bypass',
				'-Command',
				command,
			],
			{encoding: 'utf8', shell: false},
		)
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

function parseDefault(stdout: string): string | null {
	for (const line of stdout.split('\n')) {
		const m = line.match(/^\s*\(.+\)\s+REG(?:_EXPAND)?_SZ\s+(.+)/)
		if (m) return m[1].trim()
	}
	return null
}

function buildCommand(exe: string): string {
	return `"${exe}" nt -d "%V"`
}

function modernStatus(exeDir: string | null): ModernContextMenuStatus {
	if (process.platform !== 'win32') {
		return {
			supported: false,
			installed: false,
			msixPath: null,
			dllPath: null,
			detail: 'Windows-only',
		}
	}
	const msixPath = exeDir ? path.join(exeDir, SPARSE_MSIX_NAME) : null
	const dllPath = exeDir ? path.join(exeDir, SPARSE_DLL_NAME) : null
	const r = ps(
		`Get-AppxPackage -Name '${SPARSE_PACKAGE_FAMILY}' | Select-Object -ExpandProperty PackageFullName`,
	)
	const name = r.stdout.trim()
	const installed = r.status === 0 && name.length > 0
	return {
		supported: true,
		installed,
		msixPath,
		dllPath,
		detail: installed
			? name
			: msixPath && !fs.existsSync(msixPath)
				? 'sparse package not bundled'
				: 'not installed',
	}
}

function installModern(exeDir: string): void {
	const msixPath = path.join(exeDir, SPARSE_MSIX_NAME)
	const dllPath = path.join(exeDir, SPARSE_DLL_NAME)
	if (!fs.existsSync(msixPath)) {
		throw new Error(`Sparse package missing: ${msixPath}`)
	}
	if (!fs.existsSync(dllPath)) {
		throw new Error(`Explorer command DLL missing: ${dllPath}`)
	}
	try {
		uninstallModern()
	} catch {
		/* ignore */
	}
	const escapedMsix = msixPath.replace(/'/g, "''")
	const escapedDir = exeDir.replace(/'/g, "''")
	const r = ps(
		`Add-AppxPackage -Path '${escapedMsix}' -ExternalLocation '${escapedDir}' -ErrorAction Stop`,
	)
	if (r.status !== 0) {
		throw new Error(
			(r.stderr || r.stdout || 'Add-AppxPackage failed').trim() +
				' (unsigned packages need Developer Mode or a trusted signing cert)',
		)
	}
}

function uninstallModern(): void {
	const r = ps(
		`$p = Get-AppxPackage -Name '${SPARSE_PACKAGE_FAMILY}'; if ($p) { Remove-AppxPackage -Package $p.PackageFullName }`,
	)
	if (r.status !== 0) {
		throw new Error(
			(r.stderr || r.stdout || 'Remove-AppxPackage failed').trim(),
		)
	}
}

export function contextMenuStatus(exe: string | null): ContextMenuStatus {
	const exeDir = exe ? path.dirname(exe) : null
	const modern = modernStatus(exeDir)
	if (process.platform !== 'win32') {
		return {supported: false, installed: false, exe, roots: [], modern}
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
		modern,
	}
}

export function installContextMenu(exe: string): ContextMenuStatus {
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
	let modernError: string | null = null
	try {
		installModern(path.dirname(exe))
	} catch (e) {
		modernError = e instanceof Error ? e.message : String(e)
	}
	return {...contextMenuStatus(exe), modernError}
}

export function uninstallContextMenu(): ContextMenuStatus {
	if (process.platform !== 'win32') throw new Error('Windows-only.')
	for (const key of ROOTS) {
		const r = spawnSync('reg', ['delete', key, '/f'], {
			encoding: 'utf8',
			shell: false,
		})
		if (r.status !== 0 && r.status !== 1)
			throw new Error(`reg delete ${key} failed`)
	}
	try {
		uninstallModern()
	} catch {
		/* classic already removed */
	}
	return contextMenuStatus(null)
}
