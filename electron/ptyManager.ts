import type * as Pty from 'node-pty'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import os from 'node:os'
import path from 'node:path'
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

/**
 * Hard ceiling on concurrent shells. Each live pty pins a ConPTY pair plus a
 * full shell process (pwsh7 ≈ 100–200MB); beyond ~a dozen the spawn storm
 * OOMs the app (seen: 5 tabs × 2–3 panes → 13 pwsh → 728MB crash dump).
 * The renderer enforces a lower soft budget with a toast; this is the last
 * line of defense that turns a silent crash into a readable spawn error.
 */
export const MAX_LIVE_PTYS = 24

/** Live pty count — used by the spawn guard and diagnostics. */
export function ptyCount(): number {
	return entries.size
}

/**
 * Test seam: lets tests substitute a fake node-pty so the registry invariants
 * can be exercised without spawning real shells. Production leaves this null.
 */
let ptyOverride: typeof Pty | null = null

export function setPtyModule(mod: typeof Pty | null): void {
	ptyOverride = mod
}

/** Live entry ids — used by tests and the killAll teardown. */
export function ptyIds(): string[] {
	return [...entries.keys()]
}

function lazyPty(): typeof Pty | null {
	if (ptyOverride) return ptyOverride
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

/**
 * node-pty's useConptyDll loads conpty\\conpty.dll next to conpty.node
 * (build/Release). electron-rebuild does not copy it from prebuilds — do that
 * here so SSH VT input works without breaking spawn when the DLL is missing.
 */
function ensureBundledConptyDll(): boolean {
	if (process.platform !== 'win32') return false
	try {
		const ptyRoot = path.dirname(require.resolve('node-pty/package.json'))
		const releaseDir = path.join(ptyRoot, 'build', 'Release')
		const destDir = path.join(releaseDir, 'conpty')
		const destDll = path.join(destDir, 'conpty.dll')
		if (fs.existsSync(destDll)) return true

		const arch = process.arch === 'arm64' ? 'win32-arm64' : 'win32-x64'
		const srcDir = path.join(ptyRoot, 'prebuilds', arch, 'conpty')
		const srcDll = path.join(srcDir, 'conpty.dll')
		if (!fs.existsSync(srcDll)) return false

		fs.mkdirSync(destDir, {recursive: true})
		for (const name of fs.readdirSync(srcDir)) {
			fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name))
		}
		return fs.existsSync(destDll)
	} catch (e) {
		console.warn('[ptyManager] could not stage conpty.dll:', e)
		return false
	}
}

/** @deprecated Prefer resolveProfile + pickProfile; kept for callers. */
export function resolveShell(): {shell: string; args: string[]} {
	const profiles = defaultProfiles()
	const id = defaultProfileId(profiles)
	const r = resolveProfile(pickProfile(profiles, id, id))
	return {shell: r.shell, args: r.args}
}

/**
 * Never pass an invalid cwd to node-pty: Windows reports it as
 * "Cannot create process, error code: 267" (ERROR_DIRECTORY).
 */
export function resolveSpawnCwd(cwd: string): string {
	let home = cwd || os.homedir()
	try {
		if (!fs.existsSync(home) || !fs.statSync(home).isDirectory()) {
			home = os.homedir()
		}
	} catch {
		home = os.homedir()
	}
	return home
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
		/** Extra env merged after TERM/COLORTERM (e.g. agent env hooks). */
		extraEnv?: Record<string, string>
	},
): PtyEntry {
	const mod = lazyPty()
	const profiles = opts?.profiles?.length ? opts.profiles : defaultProfiles()
	const fallback = opts?.defaultProfileId || defaultProfileId(profiles)
	const profile = pickProfile(profiles, opts?.profileId, fallback)
	// `resolveProfile` reports whether the shell it resolved actually exists,
	// but nothing checked it: a profile pointing at a missing binary produced a
	// spawn ENOENT that surfaced as a dead pane with no explanation. Fall back
	// to the first profile that does resolve, so a stale or hand-edited
	// settings file degrades to a working shell instead of an empty pane.
	let resolved = resolveProfile(profile)
	if (!resolved.available) {
		const alt = profiles.find(p => resolveProfile(p).available)
		if (alt) {
			resolved = resolveProfile(alt)
			console.warn(
				`[pty] profile "${profile.id}" (${profile.kind}) is unavailable; using "${alt.id}"`,
			)
		}
	}
	const {shell, args} = resolved
	const home = resolveSpawnCwd(cwd)
	if (!mod)
		throw new Error(
			'node-pty native module unavailable. Run: bun run rebuild (requires Python 3.11 + VS Build Tools).',
		)
	// Re-spawns reuse their pane id (killed below), so only brand-new ids
	// count against the budget.
	if (!entries.has(id) && entries.size >= MAX_LIVE_PTYS)
		throw new Error(
			`Too many shells open (${entries.size}/${MAX_LIVE_PTYS}). Close a pane or tab first.`,
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
	const useConptyDll = ensureBundledConptyDll()
	const extra = opts?.extraEnv ?? {}
	const pty = mod.spawn(finalShell, finalArgs, {
		name: 'xterm-256color',
		cols: cols || 80,
		rows: rows || 24,
		cwd: home,
		useConpty: true,
		// Prefer bundled ConPTY for SSH VT passthrough; fall back to inbox
		// conhost when the DLL could not be staged next to conpty.node.
		useConptyDll,
		env: {
			...process.env,
			TERM: 'xterm-256color',
			COLORTERM: 'truecolor',
			...extra,
		} as Record<string, string>,
	})
	const entry: PtyEntry = {id, pty, cwd: home, shell: finalShell}
	// A pane id can be re-spawned (renderer reload restores saved pane ids, and
	// session restore reuses them). Kill whatever is registered under this id
	// first: leaving it alive would keep its onData attached and streaming into
	// the same `pty:data-<id>` channel, so two shells would write into one xterm,
	// and the orphan would be unreachable from `entries` forever.
	// Done after `mod.spawn` so a failed spawn leaves the existing pty running.
	killPty(id)
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

/**
 * Drop an entry without signalling the process. For the natural-exit path,
 * where node-pty has already torn the process down, so kill() would be a
 * pointless syscall (and can throw on Windows).
 */
export function forgetPty(id: string): void {
	entries.delete(id)
}

/** Terminate every live pty — on quit, and when the renderer dies. */
export function killAllPtys(): void {
	for (const id of [...entries.keys()]) killPty(id)
}

export function setCwd(id: string, cwd: string): void {
	const e = entries.get(id)
	if (e) e.cwd = cwd
}
