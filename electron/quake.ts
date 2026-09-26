import type {BrowserWindow, Rectangle} from 'electron'
import {globalShortcut, screen} from 'electron'
import type {AppSettings} from './settingsStore.js'

// Quake-style dropdown: the single main window toggles between its normal
// bounds and a top-docked dropdown on the display containing the cursor.
// One window = one pty set, so tabs/shells survive summoning.

let quakeActive = false
let returnState: {
	bounds: Rectangle
	maximized: boolean
	visible: boolean
} | null = null
let registeredAccel: string | null = null
let lastFailKey: string | null = null

export function isQuakeActive(): boolean {
	return quakeActive
}

function toAccel(hotkey: string): string {
	return hotkey
		.trim()
		.replace(/Ctrl\+/gi, 'CommandOrControl+')
		.replace(/Cmd\+/gi, 'CommandOrControl+')
		.replace(/Alt\+/gi, 'Alt+')
		.replace(/Shift\+/gi, 'Shift+')
		.replace(/Win\+/gi, 'Super+')
		.replace(/Meta\+/gi, 'Super+')
}

/** Electron + Windows often reject bare `` ` ``; try Grave / alternatives. */
function accelCandidates(primary: string): string[] {
	const base = toAccel(primary || 'Alt+`')
	const out: string[] = []
	const add = (a: string) => {
		if (a && !out.includes(a)) out.push(a)
	}
	add(base)
	// `` Ctrl+` `` → Ctrl+Grave (more reliable on Win)
	add(base.replace(/\+`$/, '+Grave'))
	add(base.replace(/\+`$/, '+Oem_3'))
	// Fallbacks if the preferred combo is stolen (Windows Terminal, etc.)
	add('Alt+`')
	add('Alt+Grave')
	add('CommandOrControl+Shift+`')
	add('CommandOrControl+Shift+Grave')
	add('Super+`')
	add('Super+Grave')
	return out
}

function clampHeight(pct: number): number {
	return Math.min(90, Math.max(20, Math.round(pct) || 50))
}

function applyDropdownGeometry(win: BrowserWindow, heightPct: number): void {
	const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
	const area = display.workArea
	const height = Math.max(
		200,
		Math.round((area.height * clampHeight(heightPct)) / 100),
	)
	if (win.isMaximized()) win.unmaximize()
	win.setAlwaysOnTop(true)
	win.setVisibleOnAllWorkspaces(true, {skipTransformProcessType: true})
	win.setBounds({x: area.x, y: area.y, width: area.width, height})
}

function enterQuake(win: BrowserWindow, s: AppSettings): void {
	returnState = {
		bounds: {...win.getBounds()},
		maximized: win.isMaximized(),
		visible: win.isVisible(),
	}
	applyDropdownGeometry(win, s.quake.heightPercent)
	if (!win.isVisible()) win.show()
	win.focus()
	quakeActive = true
}

function dismissQuake(win: BrowserWindow, hide: boolean): void {
	const ret = returnState
	quakeActive = false
	returnState = null
	try {
		win.setAlwaysOnTop(false)
		win.setVisibleOnAllWorkspaces(false)
	} catch {
		/* noop */
	}
	if (hide || !ret?.visible) {
		try {
			win.hide()
		} catch {
			/* noop */
		}
		return
	}
	try {
		if (ret.maximized) win.maximize()
		else win.setBounds(ret.bounds)
		if (!win.isVisible()) win.show()
		win.focus()
	} catch {
		/* noop */
	}
}

function toggleQuake(win: BrowserWindow, getSettings: () => AppSettings): void {
	if (quakeActive) dismissQuake(win, false)
	else enterQuake(win, getSettings())
}

export function handleQuakeBlur(
	win: BrowserWindow,
	getSettings: () => AppSettings,
): void {
	if (quakeActive && getSettings().quake.hideOnFocusLoss) {
		dismissQuake(win, true)
	}
}

export function registerQuake(
	win: BrowserWindow,
	getSettings: () => AppSettings,
): void {
	if (registeredAccel) {
		try {
			globalShortcut.unregister(registeredAccel)
		} catch {
			/* noop */
		}
		registeredAccel = null
	}
	const s = getSettings()
	if (quakeActive) {
		if (!s.quake.enabled) {
			dismissQuake(win, false)
			return
		}
		try {
			applyDropdownGeometry(win, s.quake.heightPercent)
		} catch {
			/* noop */
		}
	}
	if (!s.quake.enabled) {
		lastFailKey = null
		return
	}

	const wanted = s.quake.hotkey || 'Alt+`'
	const candidates = accelCandidates(wanted)
	const failKey = candidates.join('|')
	for (const accel of candidates) {
		try {
			if (globalShortcut.register(accel, () => toggleQuake(win, getSettings))) {
				registeredAccel = accel
				lastFailKey = null
				if (accel !== toAccel(wanted) && accel !== wanted) {
					console.warn(
						`[quake] "${wanted}" unavailable — using ${accel} instead`,
					)
				}
				return
			}
		} catch {
			/* try next */
		}
	}

	if (lastFailKey !== failKey) {
		lastFailKey = failKey
		console.error(
			`[quake] global shortcut denied or invalid for "${wanted}" ` +
				`(tried: ${candidates.join(', ')}). Another app may own it ` +
				`(Windows Terminal, PowerToys, …) — pick a free hotkey in Settings.`,
		)
	}
}

export function unregisterQuake(): void {
	if (registeredAccel) {
		try {
			globalShortcut.unregister(registeredAccel)
		} catch {
			/* noop */
		}
		registeredAccel = null
	}
	quakeActive = false
	returnState = null
}
