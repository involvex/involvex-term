// `involvex-term doctor` — common-issue checks with remediation hints.
// Report-only by default; --fix performs only safe fixes (create config dir,
// repair stale cli.json exe path). Never rewrites settings.json.
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type DoctorSeverity = 'pass' | 'warn' | 'fail' | 'skip'

export interface DoctorCheck {
	id: string
	label: string
	status: DoctorSeverity
	detail: string
	hint?: string
	fixed?: boolean
}

export interface DoctorOptions {
	fix?: boolean
	verbose?: boolean
}

export interface DoctorDeps {
	existsSync?: (p: string) => boolean
	readFileSync?: (p: string) => string
	writeFileSync?: (p: string, data: string) => void
	mkdirSync?: (p: string) => void
	which?: (cmd: string) => boolean
	fetchLatestTag?: () => Promise<string | null>
	checkNetwork?: () => Promise<{ok: boolean; ms?: number}>
	statfsFreeBytes?: (p: string) => number | null
	contextMenuStatus?: () => {supported: boolean; installed: boolean} | null
	resolveExe?: () => string | null
	readConfig?: () => {exe?: string; version?: string}
	writeConfig?: (cfg: {exe?: string; version?: string}) => void
	platform?: NodeJS.Platform
	versions?: {node: string; bun?: string}
	configDir?: string
	configFile?: string
	settingsFile?: string
	homeDir?: string
}

const WIN = process.platform === 'win32'

function defaultWhich(cmd: string): boolean {
	try {
		const probe = WIN ? 'where.exe' : 'which'
		return spawnSync(probe, [cmd], {stdio: 'ignore', shell: WIN}).status === 0
	} catch {
		return false
	}
}

function defaultExists(p: string): boolean {
	try {
		return fs.existsSync(p)
	} catch {
		return false
	}
}

async function defaultCheckNetwork(): Promise<{ok: boolean; ms?: number}> {
	try {
		const t0 = Date.now()
		const ctrl = new AbortController()
		const t = setTimeout(() => ctrl.abort(), 8000)
		try {
			const res = await fetch(
				'https://api.github.com/repos/involvex/involvex-term/releases/latest',
				{
					method: 'HEAD',
					headers: {'user-agent': 'involvex-term-cli-doctor'},
					signal: ctrl.signal,
				},
			)
			return {ok: res.ok, ms: Date.now() - t0}
		} finally {
			clearTimeout(t)
		}
	} catch {
		return {ok: false}
	}
}

function freeBytesOf(p: string): number | null {
	try {
		// Node ≥22: fs.statfsSync. Guard for older runtimes.
		const st = (
			fs as unknown as {
				statfsSync?: (x: string) => {bavail: number; bsize: number}
			}
		).statfsSync
		if (typeof st !== 'function') return null
		const s = st(p)
		return s.bavail * s.bsize
	} catch {
		return null
	}
}

const SHELL_CANDIDATES: Array<{id: string; paths: string[]}> = [
	{
		id: 'pwsh (PowerShell 7)',
		paths: [
			'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
			path.join(
				os.homedir(),
				'AppData',
				'Local',
				'Microsoft',
				'WindowsApps',
				'pwsh.exe',
			),
		],
	},
	{
		id: 'Windows PowerShell',
		paths: ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'],
	},
	{id: 'cmd', paths: ['C:\\Windows\\System32\\cmd.exe']},
	{id: 'wsl', paths: ['C:\\Windows\\System32\\wsl.exe']},
]

export function shellAvailability(
	exists: (p: string) => boolean = defaultExists,
	platform: NodeJS.Platform = process.platform,
	which: (cmd: string) => boolean = defaultWhich,
): Array<{id: string; available: boolean}> {
	if (platform !== 'win32') {
		const shell = process.env['SHELL'] || '/bin/bash'
		return [{id: shell, available: exists(shell) || which(shell)}]
	}
	return SHELL_CANDIDATES.map(c => ({
		id: c.id,
		available: c.paths.some(p => exists(p)),
	}))
}

export async function runDoctor(
	opts: DoctorOptions = {},
	deps: DoctorDeps = {},
): Promise<DoctorCheck[]> {
	const exists = deps.existsSync ?? defaultExists
	const which = deps.which ?? defaultWhich
	const platform = deps.platform ?? process.platform
	const home = deps.homeDir ?? os.homedir()
	const configDir = deps.configDir ?? path.join(home, '.involvex-term')
	const settingsFile =
		deps.settingsFile ?? path.join(configDir, 'settings.json')
	const versions = deps.versions ?? {
		node: process.version,
		bun:
			typeof (globalThis as {Bun?: {version?: string}}).Bun?.version ===
			'string'
				? (globalThis as {Bun?: {version?: string}}).Bun!.version
				: undefined,
	}
	const checks: DoctorCheck[] = []

	// 1 — runtime
	checks.push({
		id: 'runtime',
		label: 'OS + runtime',
		status: 'pass',
		detail: `${platform} ${process.arch} · node ${versions.node}${versions.bun ? ` · bun ${versions.bun}` : ''}`,
	})

	// 2 — app installation
	const resolveExe = deps.resolveExe
	const readConfig = deps.readConfig
	let exe: string | null = null
	if (resolveExe) {
		try {
			exe = resolveExe()
		} catch {
			exe = null
		}
	}
	if (!resolveExe) {
		checks.push({
			id: 'app',
			label: 'App installed',
			status: 'skip',
			detail: 'exe resolution unavailable in this context',
		})
	} else if (exe && exists(exe)) {
		const ver = readConfig?.().version
		checks.push({
			id: 'app',
			label: 'App installed',
			status: 'pass',
			detail: `${exe}${ver ? ` (${ver})` : ''}`,
		})
	} else {
		checks.push({
			id: 'app',
			label: 'App installed',
			status: 'fail',
			detail: exe ? `configured path missing: ${exe}` : 'not found',
			hint: 'Run: bunx @involvex/term install (or set INVOLVEX_TERM_EXE)',
		})
		if (opts.fix && deps.writeConfig && deps.readConfig) {
			// Safe fix: drop the stale exe pointer so the next resolve re-discovers it.
			try {
				const cfg = deps.readConfig()
				if (cfg.exe && !exists(cfg.exe)) {
					deps.writeConfig({version: cfg.version})
					const last = checks[checks.length - 1]!
					last.fixed = true
					last.detail += ' · stale cli.json exe cleared'
				}
			} catch {
				/* best-effort */
			}
		}
	}

	// 3 — config dir + settings.json (never overwrite corrupt settings)
	const readFile =
		deps.readFileSync ?? ((p: string) => fs.readFileSync(p, 'utf8'))
	let dirOk = exists(configDir)
	if (!dirOk && opts.fix) {
		try {
			;(deps.mkdirSync ?? ((p: string) => fs.mkdirSync(p, {recursive: true})))(
				configDir,
			)
			dirOk = exists(configDir)
			checks.push({
				id: 'config-dir',
				label: 'Config dir writable',
				status: dirOk ? 'pass' : 'fail',
				detail: configDir,
				fixed: dirOk,
			})
		} catch (e) {
			checks.push({
				id: 'config-dir',
				label: 'Config dir writable',
				status: 'fail',
				detail: e instanceof Error ? e.message : String(e),
				hint: `Create it manually: ${configDir}`,
			})
		}
	} else {
		checks.push({
			id: 'config-dir',
			label: 'Config dir writable',
			status: dirOk ? 'pass' : 'fail',
			detail: configDir,
			hint: dirOk ? undefined : `Create it: ${configDir}`,
		})
	}
	if (exists(settingsFile)) {
		try {
			const raw = readFile(settingsFile)
			JSON.parse(raw)
			checks.push({
				id: 'settings',
				label: 'settings.json valid',
				status: 'pass',
				detail: settingsFile,
			})
		} catch {
			checks.push({
				id: 'settings',
				label: 'settings.json valid',
				status: 'fail',
				detail: `${settingsFile} is not valid JSON — kept as-is`,
				hint: 'Restore from backup or delete it to regenerate defaults (export first if possible)',
			})
		}
	} else {
		checks.push({
			id: 'settings',
			label: 'settings.json valid',
			status: 'warn',
			detail: 'missing — defaults will be created on launch',
		})
	}

	// 4 — shells
	const shells = shellAvailability(exists, platform, which)
	const missing = shells.filter(s => !s.available)
	checks.push({
		id: 'shells',
		label: 'Shell profiles',
		status:
			missing.length === 0
				? 'pass'
				: missing.length < shells.length
					? 'warn'
					: 'fail',
		detail: shells.map(s => `${s.available ? '✓' : '✗'} ${s.id}`).join(' · '),
		hint:
			missing.length > 0 && platform === 'win32'
				? 'Install PowerShell 7 (winget install Microsoft.PowerShell)'
				: undefined,
	})

	// 5 — opencode on PATH (footer agent status depends on it)
	const hasOc = which('opencode')
	checks.push({
		id: 'opencode',
		label: 'opencode on PATH',
		status: hasOc ? 'pass' : 'warn',
		detail: hasOc ? 'found' : 'not found — agent footer shows unavailable',
		hint: hasOc ? undefined : 'Install OpenCode and ensure it is on PATH',
	})

	// 6 — context menu (Windows only)
	if (platform !== 'win32') {
		checks.push({
			id: 'context-menu',
			label: 'Explorer context menu',
			status: 'skip',
			detail: 'Windows-only',
		})
	} else if (deps.contextMenuStatus) {
		try {
			const cm = deps.contextMenuStatus()
			if (!cm) {
				checks.push({
					id: 'context-menu',
					label: 'Explorer context menu',
					status: 'skip',
					detail: 'status unavailable',
				})
			} else {
				checks.push({
					id: 'context-menu',
					label: 'Explorer context menu',
					status: cm.installed ? 'pass' : 'warn',
					detail: cm.installed
						? 'installed (folder · background · drive)'
						: 'not installed',
					hint: cm.installed
						? undefined
						: 'Run: involvex-term context-menu install',
				})
			}
		} catch (e) {
			checks.push({
				id: 'context-menu',
				label: 'Explorer context menu',
				status: 'warn',
				detail: e instanceof Error ? e.message : String(e),
			})
		}
	} else {
		checks.push({
			id: 'context-menu',
			label: 'Explorer context menu',
			status: 'skip',
			detail: 'status unavailable',
		})
	}

	// 7 — network
	const net = await (deps.checkNetwork ?? defaultCheckNetwork)()
	checks.push({
		id: 'network',
		label: 'GitHub releases reachable',
		status: net.ok ? 'pass' : 'warn',
		detail: net.ok
			? `ok${net.ms != null && opts.verbose ? ` (${net.ms}ms)` : ''}`
			: 'unreachable — install/upgrade will fail (proxy/offline?)',
	})

	// 8 — disk
	const freeFn = deps.statfsFreeBytes ?? freeBytesOf
	const free = freeFn(home)
	if (free == null) {
		checks.push({
			id: 'disk',
			label: 'Disk space',
			status: 'skip',
			detail: 'unavailable on this runtime',
		})
	} else {
		const gb = free / 1024 ** 3
		checks.push({
			id: 'disk',
			label: 'Disk space',
			status: gb < 2 ? 'warn' : 'pass',
			detail: `${gb.toFixed(1)} GB free on home`,
			hint:
				gb < 2
					? 'Free disk space; updates need room for the installer'
					: undefined,
		})
	}

	return checks
}

export function doctorFailed(checks: DoctorCheck[]): boolean {
	return checks.some(c => c.status === 'fail')
}

export function formatDoctor(checks: DoctorCheck[], verbose = false): string {
	const icon = {pass: '✓', warn: '!', fail: '✗', skip: '-'} as const
	return checks
		.map(c => {
			const head = `${icon[c.status]} [${c.id}] ${c.label}: ${c.detail}${c.fixed ? ' (fixed)' : ''}`
			const tail =
				verbose && c.hint
					? `\n    → ${c.hint}`
					: !verbose && c.hint && (c.status === 'fail' || c.status === 'warn')
						? `\n    → ${c.hint}`
						: ''
			return head + tail
		})
		.join('\n')
}
