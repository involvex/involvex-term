import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type ProfileKind = 'pwsh' | 'powershell' | 'cmd' | 'wsl' | 'custom'

export interface ShellProfile {
	id: string
	name: string
	kind: ProfileKind
	/** Absolute path for `custom` (and optional override for builtins). */
	command?: string
	args?: string[]
}

/**
 * PowerShell init via `-NoExit -Command` BEFORE the first prompt —
 * wraps the user's `prompt` and emits OSC 7 with the CWD.
 */
export const PWSH_OSC7_INIT =
	'$__it_pb=(Get-Item function:prompt -EA SilentlyContinue).ScriptBlock;' +
	'function global:prompt{' +
	"try{[Console]::Write([char]27+']7;file://localhost/'+[uri]::EscapeDataString($PWD.Path)+[char]7)}catch{};" +
	"if($__it_pb){&$__it_pb}else{'PS '+$PWD.Path+'> '}}"

/** cmd.exe: emit Windows Terminal OSC 9;9 (cwd) in every prompt. */
export const CMD_OSC9_PROMPT = 'prompt $E]9;9;$P$E\\$P$G'

/**
 * WSL bash: PROMPT_COMMAND emits OSC 9;9 with the Windows-form path. The
 * script travels base64-encoded so the wsl.exe command line needs no quoting.
 */
const WSL_OSC9_SCRIPT =
	`PROMPT_COMMAND='printf "\\033]9;9;%s\\033\\\\" "$(wslpath -w "$PWD")"'; ` +
	'export PROMPT_COMMAND'
export const WSL_OSC9_ARGS = [
	'-e',
	'bash',
	'-c',
	`eval $(echo ${Buffer.from(WSL_OSC9_SCRIPT).toString('base64')}|base64 -d);exec bash -i`,
]

const WIN = process.platform === 'win32'
const SYSTEM_ROOT = process.env['SystemRoot'] ?? 'C:\\Windows'

function exists(p: string): boolean {
	try {
		return fs.existsSync(p)
	} catch {
		return false
	}
}

function findPwsh7(): string | null {
	const candidates = [
		'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
		'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe',
		path.join(
			os.homedir(),
			'AppData',
			'Local',
			'Microsoft',
			'WindowsApps',
			'pwsh.exe',
		),
	]
	return candidates.find(exists) ?? null
}

function findWindowsPowerShell(): string {
	return path.join(
		SYSTEM_ROOT,
		'System32',
		'WindowsPowerShell',
		'v1.0',
		'powershell.exe',
	)
}

function findCmd(): string {
	return path.join(SYSTEM_ROOT, 'System32', 'cmd.exe')
}

function findWsl(): string | null {
	const p = path.join(SYSTEM_ROOT, 'System32', 'wsl.exe')
	return exists(p) ? p : null
}

/** Built-in profile catalog (may include entries whose binary is missing). */
export function builtinProfiles(): ShellProfile[] {
	if (!WIN) {
		const shell = process.env['SHELL'] || '/bin/bash'
		return [
			{
				id: 'default',
				name: path.basename(shell),
				kind: 'custom',
				command: shell,
				args: ['--login'],
			},
		]
	}
	return [
		{id: 'pwsh', name: 'PowerShell 7', kind: 'pwsh'},
		{id: 'powershell', name: 'Windows PowerShell', kind: 'powershell'},
		{id: 'cmd', name: 'Command Prompt', kind: 'cmd'},
		{id: 'wsl', name: 'WSL', kind: 'wsl'},
	]
}

export function defaultProfiles(): ShellProfile[] {
	return builtinProfiles()
}

/** First available builtin id (prefers pwsh). */
export function defaultProfileId(
	profiles: ShellProfile[] = defaultProfiles(),
): string {
	for (const id of ['pwsh', 'powershell', 'cmd', 'default', 'wsl']) {
		const p = profiles.find(x => x.id === id)
		if (p && resolveProfile(p).available) return id
	}
	return profiles[0]?.id ?? 'powershell'
}

export function resolveProfile(profile: ShellProfile): {
	shell: string
	args: string[]
	available: boolean
} {
	const extra = Array.isArray(profile.args) ? profile.args : []
	if (profile.kind === 'custom') {
		const shell = (profile.command ?? '').trim()
		return {
			shell: shell || (WIN ? findCmd() : process.env['SHELL'] || '/bin/bash'),
			args: extra.length ? extra : WIN ? [] : ['--login'],
			available: shell ? exists(shell) : true,
		}
	}
	if (!WIN) {
		const shell = process.env['SHELL'] || '/bin/bash'
		return {shell, args: ['--login'], available: true}
	}
	if (profile.kind === 'pwsh') {
		const shell =
			(profile.command && exists(profile.command)
				? profile.command
				: findPwsh7()) ?? ''
		return {
			shell: shell || findWindowsPowerShell(),
			args: ['-NoLogo', '-NoExit', '-Command', PWSH_OSC7_INIT, ...extra],
			available: Boolean(shell),
		}
	}
	if (profile.kind === 'powershell') {
		const shell =
			profile.command && exists(profile.command)
				? profile.command
				: findWindowsPowerShell()
		return {
			shell,
			args: ['-NoLogo', '-NoExit', '-Command', PWSH_OSC7_INIT, ...extra],
			available: exists(shell),
		}
	}
	if (profile.kind === 'cmd') {
		const shell =
			profile.command && exists(profile.command) ? profile.command : findCmd()
		return {
			shell,
			args: extra.length ? extra : ['/k', CMD_OSC9_PROMPT],
			available: exists(shell),
		}
	}
	const shell =
		profile.command && exists(profile.command) ? profile.command : findWsl()
	const customCmd = extra.some(a => ['-e', '--exec', '--', '-u'].includes(a))
	return {
		shell: shell ?? findCmd(),
		args: shell && !customCmd ? [...extra, ...WSL_OSC9_ARGS] : extra,
		available: Boolean(shell),
	}
}

export function pickProfile(
	profiles: ShellProfile[],
	profileId: string | undefined,
	fallbackId: string,
): ShellProfile {
	const id = profileId || fallbackId
	return (
		profiles.find(p => p.id === id) ??
		profiles.find(p => p.id === fallbackId) ??
		profiles[0] ?? {
			id: 'powershell',
			name: 'Windows PowerShell',
			kind: 'powershell',
		}
	)
}
