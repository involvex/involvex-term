/* eslint-disable no-control-regex */
import {setCwd} from './ptyManager.js'

// OSC 7: ESC ] 7 ; file://hostname/path ST  (ST = BEL \x07 or ESC \)
// OSC 633: VS Code style fallback.
// OSC 9;9: Windows Terminal / ConEmu "current directory" (plain path,
// optionally quoted) — what WT-style pwsh `prompt` functions emit.
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/g
const OSC633_RE = /\x1b\]633;P;Cwd=([^\x07\x1b]*)(?:\x07|\x1b\\)/g
const OSC9_9_RE = /\x1b\]9;9;([^\x07\x1b]*)(?:\x07|\x1b\\)/g

function normalizeWinPath(s: string): string {
	if (process.platform !== 'win32') return s
	// Normalize all separators first: handles /C:/..., /C:\...,
	// C%3A%5C... (our pwsh hook emits %5C-escaped backslashes) uniformly.
	s = s.replace(/\//g, '\\')
	// Strip stray leading backslash before drive letter: \C:\x -> C:\x
	return s.replace(/^\\([A-Za-z]:\\)/, '$1')
}

function decodeOscPath(p: string): string {
	let s: string
	try {
		s = decodeURIComponent(p.trim())
	} catch {
		s = p.trim()
	}
	return normalizeWinPath(s)
}

function decodeOsc9Path(p: string): string {
	return normalizeWinPath(p.trim().replace(/^"(.*)"$/, '$1'))
}

const OSC_STARTS = ['7;file://', '633;P;Cwd=', '9;9;']
const MAX_PENDING = 4096
const pending = new Map<string, string>()

export function clearCwdPending(tabId: string): void {
	pending.delete(tabId)
}

/** Index of an unterminated cwd OSC at the end of `data`, or -1. */
function incompleteTailStart(data: string): number {
	const i = data.lastIndexOf('\x1b]')
	if (i < 0 || data.length - i > MAX_PENDING) return -1
	const body = data.slice(i + 2)
	if (/\x07|\x1b\\/.test(body)) return -1
	const ok = OSC_STARTS.some(s => s.startsWith(body) || body.startsWith(s))
	return ok ? i : -1
}

/**
 * Scan pty output for cwd OSCs, update cwd, return cleaned output.
 * A sequence split across chunks is held back and completed by the next one.
 */
export function sniffCwd(
	tabId: string,
	data: string,
	onChange?: (tabId: string, cwd: string) => void,
): string {
	// Fast path: bulk output (cat/build logs) never contains ESC ].
	// Skip pending bookkeeping + regex work entirely in that case.
	const hasPending = pending.has(tabId)
	if (!hasPending && !data.includes('\x1b]')) return data
	const combined = (pending.get(tabId) ?? '') + data
	const cut = incompleteTailStart(combined)
	if (cut >= 0) pending.set(tabId, combined.slice(cut))
	else pending.delete(tabId)
	return sniffComplete(
		tabId,
		cut >= 0 ? combined.slice(0, cut) : combined,
		onChange,
	)
}

function sniffComplete(
	tabId: string,
	data: string,
	onChange?: (tabId: string, cwd: string) => void,
): string {
	// Fast path (belt & braces — sniffCwd already checked): no OSC
	// introducer means no cwd and nothing to strip.
	if (!data.includes('\x1b]')) return data
	let cwd: string | null = null
	let at = -1
	const patterns: Array<[RegExp, (raw: string) => string]> = [
		[OSC7_RE, decodeOscPath],
		[OSC633_RE, decodeOscPath],
		[OSC9_9_RE, decodeOsc9Path],
	]
	for (const [re, decode] of patterns) {
		re.lastIndex = 0
		let m: RegExpExecArray | null
		while ((m = re.exec(data)) !== null) {
			const next = decode(m[1] ?? '')
			if (next && m.index >= at) {
				cwd = next
				at = m.index
			}
		}
	}
	if (cwd) {
		setCwd(tabId, cwd)
		onChange?.(tabId, cwd)
	}
	// Strip OSC sequences so xterm doesn't render garbage
	return data
		.replace(/\x1b\]7;file:\/\/[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
		.replace(/\x1b\]633;P;Cwd=[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
		.replace(/\x1b\]9;9;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
}
