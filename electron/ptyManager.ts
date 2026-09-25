import type * as Pty from 'node-pty'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import os from 'node:os'
import {
	defaultProfileId,
	defaultProfiles,
	pickProfile,
	resolveProfile,
	type ShellProfile,
} from './shellProfiles.js'

// Main process is bundled as ESM — bare `require` is undefined there.
const require = createRequire(import.meta.url)

export {PWSH_OSC7_INIT} from './shellProfiles.js'

export interface PtyEntry {
	id: string
	pty: Pty.IPty
	cwd: string
	shell: string
}

const entries = new Map<string, PtyEntry>()

function lazyPty(): typeof Pty | null {
	try {
		return require('node-pty') as typeof Pty
	} catch (e) {
		console.error(
			'[ptyManager] node-pty not available (needs electron-rebuild):',
			e,
		)
		return null
	}
}

/** @deprecated Prefer resolveProfile + pickProfile; kept for callers. */
export function resolveShell(): {shell: string; args: string[]} {
	const profiles = defaultProfiles()
	const id = defaultProfileId(profiles)
	const r = resolveProfile(pickProfile(profiles, id, id))
	return {shell: r.shell, args: r.args}
}

export function spawnPty(
	id: string,
	cwd: string,
	cols: number,
	rows: number,
	opts?: {
		profileId?: string
		profiles?: ShellProfile[]
		defaultProfileId?: string
	},
): PtyEntry {
	const mod = lazyPty()
	const profiles = opts?.profiles?.length ? opts.profiles : defaultProfiles()
	const fallback = opts?.defaultProfileId || defaultProfileId(profiles)
	const profile = pickProfile(profiles, opts?.profileId, fallback)
	const {shell, args} = resolveProfile(profile)
	// Never pass an invalid cwd to node-pty: Windows reports it as
	// "Cannot create process, error code: 267" (ERROR_DIRECTORY).
	let home = cwd || os.homedir()
	try {
		if (!fs.existsSync(home) || !fs.statSync(home).isDirectory()) {
			home = os.homedir()
		}
	} catch {
		home = os.homedir()
	}
	if (!mod)
		throw new Error(
			'node-pty native module unavailable. Run: bun run rebuild (requires Python 3.11 + VS Build Tools).',
		)
	const envOverride =
		process.env['INVOLVEX_SHELL'] ?? process.env['INVOVEX_SHELL']
	const useEnv =
		!opts?.profileId && Boolean(envOverride && fs.existsSync(envOverride!))
	const finalShell = useEnv ? envOverride! : shell
	const finalArgs = useEnv
		? /pwsh|powershell/i.test(envOverride!)
			? args
			: []
		: args
	const pty = mod.spawn(finalShell, finalArgs, {
		name: 'xterm-256color',
		cols: cols || 80,
		rows: rows || 24,
		cwd: home,
		env: {
			...process.env,
			TERM: 'xterm-256color',
			COLORTERM: 'truecolor',
		} as Record<string, string>,
	})
	const entry: PtyEntry = {id, pty, cwd: home, shell: finalShell}
	entries.set(id, entry)
	return entry
}

export function getPty(id: string): PtyEntry | undefined {
	return entries.get(id)
}

export function killPty(id: string): void {
	const e = entries.get(id)
	if (!e) return
	try {
		e.pty.kill()
	} catch {
		/* noop */
	}
	entries.delete(id)
}

export function setCwd(id: string, cwd: string): void {
	const e = entries.get(id)
	if (e) e.cwd = cwd
}
