/**
 * Machine-local shell memory: recent directories, recent commands, and an
 * optional clipboard ring. Lives beside settings.json — never in gist sync.
 */
import fs from 'node:fs'
import path from 'node:path'
import {settingsDir} from './settingsStore.js'

export const RECENT_DIRS_CAP = 15
export const RECENT_COMMANDS_CAP = 50
export const CLIPBOARD_RING_CAP = 50

export interface ShellMemoryState {
	version: 1
	recentDirs: string[]
	recentCommands: string[]
	/** Only written when the user opts into clipboard persist. */
	clipboardRing?: string[]
}

let dirs: string[] = []
let commands: string[] = []
/** Session clipboard ring (newest first). */
let clips: string[] = []
/** Index for Ctrl+Shift+V cycling; -1 means “next cycle starts at 0”. */
let clipCycle = -1
let persistClips = false
let loaded = false

export function shellMemoryFile(): string {
	return path.join(settingsDir(), 'shell-memory.json')
}

function writeAtomic(file: string, data: unknown): void {
	const tmp = `${file}.${process.pid}.tmp`
	try {
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
		fs.renameSync(tmp, file)
	} catch (err) {
		try {
			fs.unlinkSync(tmp)
		} catch {
			/* nothing to clean up */
		}
		throw err
	}
}

function normalizePathKey(p: string): string {
	const t = p.trim()
	if (!t) return ''
	if (process.platform === 'win32') return t.replace(/\//g, '\\').toLowerCase()
	return t
}

function persist(): void {
	try {
		if (!fs.existsSync(settingsDir()))
			fs.mkdirSync(settingsDir(), {recursive: true})
		const state: ShellMemoryState = {
			version: 1,
			recentDirs: dirs,
			recentCommands: commands,
		}
		if (persistClips) state.clipboardRing = clips
		writeAtomic(shellMemoryFile(), state)
	} catch {
		/* best-effort */
	}
}

/** Load from disk once (or after setSettingsHome in tests). */
export function loadShellMemory(): void {
	dirs = []
	commands = []
	clips = []
	clipCycle = -1
	loaded = true
	try {
		const file = shellMemoryFile()
		if (!fs.existsSync(file)) return
		const raw = JSON.parse(
			fs.readFileSync(file, 'utf-8'),
		) as Partial<ShellMemoryState>
		if (Array.isArray(raw.recentDirs)) {
			dirs = raw.recentDirs
				.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
				.slice(0, RECENT_DIRS_CAP)
		}
		if (Array.isArray(raw.recentCommands)) {
			commands = raw.recentCommands
				.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
				.slice(0, RECENT_COMMANDS_CAP)
		}
		if (persistClips && Array.isArray(raw.clipboardRing)) {
			clips = raw.clipboardRing
				.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
				.slice(0, CLIPBOARD_RING_CAP)
		}
	} catch {
		/* corrupt file — start empty */
	}
}

function ensureLoaded(): void {
	if (!loaded) loadShellMemory()
}

/** When false, clipboard stays in memory only and is not written to disk. */
export function setClipboardPersist(enabled: boolean): void {
	ensureLoaded()
	const was = persistClips
	persistClips = enabled === true
	if (was && !persistClips) {
		// Drop persisted clips from disk but keep the session ring.
		persist()
	} else if (!was && persistClips) {
		persist()
	}
}

export function getClipboardPersist(): boolean {
	return persistClips
}

/** Record a cwd when OSC reports a change. Dedupes + caps; persists. */
export function recordRecentDir(cwd: string): void {
	ensureLoaded()
	const next = cwd.trim()
	if (!next) return
	const key = normalizePathKey(next)
	dirs = [next, ...dirs.filter(d => normalizePathKey(d) !== key)].slice(
		0,
		RECENT_DIRS_CAP,
	)
	persist()
}

/** Existing paths only, newest first. */
export function listRecentDirs(): string[] {
	ensureLoaded()
	const kept: string[] = []
	let changed = false
	for (const d of dirs) {
		try {
			if (fs.existsSync(d) && fs.statSync(d).isDirectory()) kept.push(d)
			else changed = true
		} catch {
			changed = true
		}
	}
	if (changed) {
		dirs = kept.slice(0, RECENT_DIRS_CAP)
		persist()
	}
	return kept.slice(0, RECENT_DIRS_CAP)
}

export function recordRecentCommand(command: string): void {
	ensureLoaded()
	const next = command.trim()
	if (!next) return
	// Skip pure control / empty after trim
	let onlyControls = true
	for (let i = 0; i < next.length; i++) {
		const c = next.charCodeAt(i)
		if (c > 0x1f) {
			onlyControls = false
			break
		}
	}
	if (onlyControls) return
	commands = [next, ...commands.filter(c => c !== next)].slice(
		0,
		RECENT_COMMANDS_CAP,
	)
	persist()
}

export function listRecentCommands(): string[] {
	ensureLoaded()
	return commands.slice(0, RECENT_COMMANDS_CAP)
}

function pushClip(text: string): void {
	const next = text
	if (!next || !next.trim()) return
	if (clips[0] === next) return
	clips = [next, ...clips.filter(c => c !== next)].slice(0, CLIPBOARD_RING_CAP)
	clipCycle = -1
	if (persistClips) persist()
}

/** Push text the app copied or pasted into the ring. */
export function recordClipboard(text: string): void {
	ensureLoaded()
	pushClip(text)
}

export function listClipboardRing(): string[] {
	ensureLoaded()
	return clips.slice(0, CLIPBOARD_RING_CAP)
}

/**
 * Advance the ring and return the next older clip (or null if empty).
 * First press after a new push returns clips[0]; later presses walk older.
 */
export function cycleClipboard(): string | null {
	ensureLoaded()
	if (clips.length === 0) return null
	clipCycle = Math.min(clipCycle + 1, clips.length - 1)
	return clips[clipCycle] ?? null
}

/** Reset cycle cursor after a normal paste of the system clipboard. */
export function resetClipboardCycle(): void {
	clipCycle = -1
}

/** Test seam: wipe in-memory state without touching disk. */
export function resetShellMemoryForTests(): void {
	dirs = []
	commands = []
	clips = []
	clipCycle = -1
	persistClips = false
	loaded = false
}
