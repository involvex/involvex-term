/** Parse / match settings hotkey strings like `Shift+Alt+D` or `Ctrl+Shift+T`. */

export interface ParsedHotkey {
	ctrl: boolean
	alt: boolean
	shift: boolean
	meta: boolean
	/** Normalized key: lowercase letter, `tab`, `arrowup`, `,`, `=`, etc. */
	key: string
}

export function parseHotkey(raw: string | undefined): ParsedHotkey | null {
	if (!raw?.trim()) return null
	const parts = raw
		.split('+')
		.map(p => p.trim())
		.filter(Boolean)
	if (parts.length === 0) return null
	const out: ParsedHotkey = {
		ctrl: false,
		alt: false,
		shift: false,
		meta: false,
		key: '',
	}
	for (const p of parts) {
		const low = p.toLowerCase()
		if (
			low === 'ctrl' ||
			low === 'control' ||
			low === 'cmdorcontrol' ||
			low === 'commandorcontrol'
		) {
			out.ctrl = true
		} else if (low === 'alt' || low === 'option') {
			out.alt = true
		} else if (low === 'shift') {
			out.shift = true
		} else if (
			low === 'meta' ||
			low === 'cmd' ||
			low === 'command' ||
			low === 'super'
		) {
			out.meta = true
		} else if (low === 'space') {
			out.key = ' '
		} else if (low === 'plus') {
			out.key = '='
		} else if (low === 'up') {
			out.key = 'arrowup'
		} else if (low === 'down') {
			out.key = 'arrowdown'
		} else if (low === 'left') {
			out.key = 'arrowleft'
		} else if (low === 'right') {
			out.key = 'arrowright'
		} else {
			out.key = low
		}
	}
	if (!out.key) return null
	return out
}

function eventKey(e: {key: string}): string {
	const k = e.key
	if (k === ' ') return ' '
	if (k.length === 1) return k.toLowerCase()
	return k.toLowerCase()
}

/** Match a KeyboardEvent (or similar) against a settings hotkey string. */
export function matchHotkey(
	e: {
		ctrlKey?: boolean
		metaKey?: boolean
		altKey?: boolean
		shiftKey?: boolean
		key: string
	},
	hotkey: string | undefined,
): boolean {
	const p = parseHotkey(hotkey)
	if (!p) return false
	// Settings "Ctrl" means CommandOrControl (Ctrl on Win/Linux, Meta on mac).
	const haveCtrl = !!(e.ctrlKey || e.metaKey)
	if (p.ctrl !== haveCtrl) return false
	if (p.alt !== !!e.altKey) return false
	if (p.shift !== !!e.shiftKey) return false
	if (p.meta && !p.ctrl && !e.metaKey) return false
	const key = eventKey(e)
	if (p.key === '=') return key === '=' || key === '+'
	return key === p.key
}

/** Actions whose chords are unreliable as Electron menu accelerators on Windows. */
export const PANE_HOTKEY_ACTIONS = [
	'split-pane',
	'split-pane-vertical',
	'close-pane',
] as const

export const PANE_HOTKEY_FALLBACKS: Record<string, string> = {
	'split-pane': 'Shift+Alt+D',
	'split-pane-vertical': 'Shift+Alt+V',
	'close-pane': 'Shift+Alt+C',
}
