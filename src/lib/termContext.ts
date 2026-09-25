import type {Terminal} from '@xterm/xterm'
import {termApi} from '../types'
import {openTarget, trimTrail} from './termLinks'

export type HitKind = 'url' | 'email' | 'path' | 'text'

export interface ContextHit {
	kind: HitKind
	text: string
}

const URL_RE = /https?:\/\/[^\s"'<>]+/gi
const MAIL_RE =
	/mailto:[^\s"'<>]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const WIN_PATH_RE = /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|*?]+/g
const UNIX_PATH_RE = /(?:\/[\w.-]+){2,}(?:\/[\w.-]*)*/g
const FILE_URI_RE = /file:\/\/[^\s"'<>]+/gi

export function classifyText(raw: string): ContextHit | null {
	const text = trimTrail(raw.trim())
	if (!text) return null
	if (/^https?:\/\//i.test(text)) return {kind: 'url', text}
	if (/^mailto:/i.test(text) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
		return {
			kind: 'email',
			text: text.startsWith('mailto:') ? text : `mailto:${text}`,
		}
	if (
		/^file:\/\//i.test(text) ||
		/^[A-Za-z]:[\\/]/.test(text) ||
		/^\\\\[^\\]+\\/.test(text) ||
		/^\/[\w.-]+/.test(text)
	)
		return {kind: 'path', text}
	return {kind: 'text', text}
}

function matchAt(text: string, col1: number, re: RegExp): string | null {
	re.lastIndex = 0
	let m: RegExpExecArray | null
	while ((m = re.exec(text))) {
		const start = m.index + 1
		const cleaned = trimTrail(m[0])
		const end = m.index + cleaned.length
		if (col1 >= start && col1 <= end) return cleaned
	}
	return null
}

/** Map viewport mouse event → 1-based column + absolute buffer row. */
export function bufferCoordsFromMouse(
	term: Terminal,
	e: MouseEvent,
): {col: number; row: number} | null {
	const screen =
		(term.element?.querySelector('.xterm-screen') as HTMLElement | null) ??
		term.element
	if (!screen) return null
	const rect = screen.getBoundingClientRect()
	const x = e.clientX - rect.left
	const y = e.clientY - rect.top
	if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
	const col = Math.max(
		1,
		Math.min(term.cols, Math.floor((x / rect.width) * term.cols) + 1),
	)
	const rowInView = Math.max(
		0,
		Math.min(term.rows - 1, Math.floor((y / rect.height) * term.rows)),
	)
	return {col, row: term.buffer.active.viewportY + rowInView}
}

/** Prefer selection if click is inside it; else token under cursor. */
export function resolveContextHit(
	term: Terminal,
	e: MouseEvent,
): ContextHit | null {
	const sel = term.getSelection()?.trim()
	if (sel && term.hasSelection()) {
		const hit = classifyText(sel)
		if (hit) return hit
	}

	const coords = bufferCoordsFromMouse(term, e)
	if (!coords) return null
	const line = term.buffer.active.getLine(coords.row)
	if (!line) return null
	const text = line.translateToString(true)

	const url = matchAt(text, coords.col, URL_RE)
	if (url) return {kind: 'url', text: trimTrail(url)}

	const mail = matchAt(text, coords.col, MAIL_RE)
	if (mail) {
		const t = trimTrail(mail)
		return {
			kind: 'email',
			text: t.startsWith('mailto:') ? t : `mailto:${t}`,
		}
	}

	const fileUri = matchAt(text, coords.col, FILE_URI_RE)
	if (fileUri) return {kind: 'path', text: trimTrail(fileUri)}

	const win = matchAt(text, coords.col, WIN_PATH_RE)
	if (win) return {kind: 'path', text: trimTrail(win)}

	const unix = matchAt(text, coords.col, UNIX_PATH_RE)
	if (unix) return {kind: 'path', text: trimTrail(unix)}

	// Fallback: expand contiguous non-whitespace under cursor
	const idx = coords.col - 1
	if (idx < 0 || idx >= text.length || /\s/.test(text[idx] ?? '')) return null
	let a = idx
	let b = idx
	while (a > 0 && !/\s/.test(text[a - 1]!)) a -= 1
	while (b < text.length - 1 && !/\s/.test(text[b + 1]!)) b += 1
	return classifyText(text.slice(a, b + 1))
}

export function pathForReveal(raw: string): string {
	const t = trimTrail(raw.trim())
	if (/^file:\/\//i.test(t)) {
		try {
			const u = new URL(t)
			let p = decodeURIComponent(u.pathname)
			if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
			return p
		} catch {
			return t
		}
	}
	return t
}

export async function openHit(hit: ContextHit): Promise<void> {
	if (hit.kind === 'email') {
		const api = termApi()
		if (api) await api.openExternal(hit.text)
		else window.open(hit.text, '_blank')
		return
	}
	await openTarget(hit.text)
}

export async function revealHit(hit: ContextHit): Promise<void> {
	if (hit.kind !== 'path') return
	const api = termApi()
	const p = pathForReveal(hit.text)
	if (api?.showItemInFolder) await api.showItemInFolder(p)
	else await openTarget(p)
}

export async function copyText(text: string): Promise<void> {
	const api = termApi()
	if (api) await api.clipboardWrite(text)
	else await navigator.clipboard?.writeText(text)
}
