import type {BrowserWindow, Input} from 'electron'
import type {AppSettings} from './settingsStore.js'

function accelFromSetting(
	hotkey: string | undefined,
	fallback: string,
): string {
	const h = (hotkey ?? fallback).trim()
	// Electron Menu expects 'CommandOrControl', map Ctrl->CommandOrControl for cross-platform
	return h
		.replace(/Ctrl\+/gi, 'CommandOrControl+')
		.replace(/Alt\+/gi, 'Alt+')
		.replace(/Shift\+/gi, 'Shift+')
}

export function actionForMenuId(menuId: string): string {
	return menuId.replace(/^tab:/, '')
}

interface ParsedHotkey {
	ctrl: boolean
	alt: boolean
	shift: boolean
	meta: boolean
	key: string
}

function parseHotkey(raw: string | undefined): ParsedHotkey | null {
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

function matchInput(input: Input, hotkey: string | undefined): boolean {
	const p = parseHotkey(hotkey)
	if (!p) return false
	const haveCtrl = !!(input.control || input.meta)
	if (p.ctrl !== haveCtrl) return false
	if (p.alt !== !!input.alt) return false
	if (p.shift !== !!input.shift) return false
	const key =
		input.key === ' '
			? ' '
			: input.key.length === 1
				? input.key.toLowerCase()
				: input.key.toLowerCase()
	if (p.key === '=') return key === '=' || key === '+'
	return key === p.key
}

/** Pane split/close chords — menu accelerators often lose Alt+Shift on Windows. */
const PANE_ACTIONS: Array<{action: string; fallback: string}> = [
	{action: 'split-pane', fallback: 'Shift+Alt+D'},
	{action: 'split-pane-vertical', fallback: 'Shift+Alt+V'},
	{action: 'close-pane', fallback: 'Shift+Alt+C'},
]

const beforeInputCleanups = new WeakMap<BrowserWindow, () => void>()

/**
 * Register before-input-event handlers for pane hotkeys so Alt+Shift chords
 * reach the app even when Windows language-switch steals menu accelerators.
 */
export function bindPaneHotkeys(
	win: BrowserWindow,
	settings: AppSettings,
): void {
	beforeInputCleanups.get(win)?.()
	const hk = settings.hotkeys as Record<string, string>
	const handler = (event: Electron.Event, input: Input): void => {
		if (input.type !== 'keyDown' || input.isAutoRepeat) return
		for (const {action, fallback} of PANE_ACTIONS) {
			if (matchInput(input, hk[action] || fallback)) {
				event.preventDefault()
				win.webContents.send('tab:action', action)
				return
			}
		}
	}
	win.webContents.on('before-input-event', handler)
	beforeInputCleanups.set(win, () => {
		win.webContents.removeListener('before-input-event', handler)
	})
}

export async function buildMenu(
	win: BrowserWindow,
	settings: AppSettings,
): Promise<void> {
	const {Menu} = await import('electron')
	const hk = settings.hotkeys as Record<string, string>
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: 'Terminal',
			submenu: [
				{
					id: 'tab:new',
					label: 'New Tab',
					accelerator: accelFromSetting(
						hk['new-tab'],
						'CommandOrControl+Shift+T',
					),
					click: () => win.webContents.send('tab:action', 'new-tab'),
				},
				{
					id: 'tab:duplicate',
					label: 'Duplicate Tab',
					accelerator: accelFromSetting(
						hk['duplicate-tab'],
						'CommandOrControl+Shift+D',
					),
					click: () => win.webContents.send('tab:action', 'duplicate-tab'),
				},
				{
					id: 'pane:split',
					label: 'Split Pane Horizontally',
					// Accelerator omitted — handled by before-input-event (Alt+Shift
					// is unreliable as a menu accelerator on Windows).
					accelerator: undefined,
					click: () => win.webContents.send('tab:action', 'split-pane'),
				},
				{
					id: 'pane:split-vertical',
					label: 'Split Pane Vertically',
					accelerator: undefined,
					click: () =>
						win.webContents.send('tab:action', 'split-pane-vertical'),
				},
				{
					id: 'pane:close',
					label: 'Close Pane',
					accelerator: undefined,
					click: () => win.webContents.send('tab:action', 'close-pane'),
				},
				{
					id: 'tab:close',
					label: 'Close Tab',
					accelerator: accelFromSetting(
						hk['close-tab'],
						'CommandOrControl+Shift+W',
					),
					click: () => win.webContents.send('tab:action', 'close-tab'),
				},
				{type: 'separator'},
				{
					id: 'tab:clear-buffer',
					label: 'Clear Buffer',
					accelerator: accelFromSetting(
						hk['clear-buffer'],
						'CommandOrControl+Shift+K',
					),
					click: () => win.webContents.send('tab:action', 'clear-buffer'),
				},
				{
					id: 'tab:mark-prompt',
					label: 'Mark Prompt',
					accelerator: accelFromSetting(
						hk['mark-prompt'],
						'CommandOrControl+Shift+M',
					),
					click: () => win.webContents.send('tab:action', 'mark-prompt'),
				},
				{
					id: 'tab:prev-mark',
					label: 'Previous Mark',
					accelerator: accelFromSetting(
						hk['prev-mark'],
						'CommandOrControl+Shift+Up',
					),
					click: () => win.webContents.send('tab:action', 'prev-mark'),
				},
				{
					id: 'tab:next-mark',
					label: 'Next Mark',
					accelerator: accelFromSetting(
						hk['next-mark'],
						'CommandOrControl+Shift+Down',
					),
					click: () => win.webContents.send('tab:action', 'next-mark'),
				},
				{type: 'separator'},
				{
					id: 'tab:settings',
					label: 'Settings',
					accelerator: accelFromSetting(hk['settings'], 'CommandOrControl+,'),
					click: () => win.webContents.send('tab:action', 'open-settings'),
				},
				{
					id: 'tab:palette',
					label: 'Command Palette...',
					accelerator: accelFromSetting(
						hk['palette'],
						'CommandOrControl+Shift+P',
					),
					click: () => win.webContents.send('tab:action', 'open-palette'),
				},
				{
					id: 'tab:opencode',
					label: 'Open Agent',
					accelerator: accelFromSetting(
						hk['opencode'],
						'CommandOrControl+Shift+O',
					),
					click: () => win.webContents.send('tab:action', 'open-opencode'),
				},
				{
					id: 'tab:check-updates',
					label: 'Check for Updates...',
					accelerator: accelFromSetting(
						hk['check-updates'],
						'CommandOrControl+Shift+U',
					),
					click: () => win.webContents.send('tab:action', 'check-updates'),
				},
				{type: 'separator'},
				{role: 'quit'},
			],
		},
		{
			label: 'View',
			submenu: [
				{
					id: 'tab:next',
					label: 'Next Tab',
					accelerator: accelFromSetting(hk['next-tab'], 'CommandOrControl+Tab'),
					click: () => win.webContents.send('tab:action', 'next-tab'),
				},
				{
					id: 'tab:prev',
					label: 'Previous Tab',
					accelerator: accelFromSetting(
						hk['prev-tab'],
						'CommandOrControl+Shift+Tab',
					),
					click: () => win.webContents.send('tab:action', 'prev-tab'),
				},
				{type: 'separator'},
				{
					id: 'tab:search',
					label: 'Find in Terminal...',
					accelerator: accelFromSetting(hk['find'], 'CommandOrControl+Shift+F'),
					click: () => win.webContents.send('tab:action', 'open-search'),
				},
				{type: 'separator'},
				{
					role: 'zoomIn',
					accelerator: accelFromSetting(hk['zoom-in'], 'CommandOrControl+='),
				},
				{
					role: 'zoomOut',
					accelerator: accelFromSetting(hk['zoom-out'], 'CommandOrControl+-'),
				},
				{
					role: 'resetZoom',
					accelerator: accelFromSetting(hk['zoom-reset'], 'CommandOrControl+0'),
				},
				{type: 'separator'},
				{role: 'toggleDevTools'},
				{role: 'togglefullscreen'},
			],
		},
	]
	const menu = Menu.buildFromTemplate(template)
	Menu.setApplicationMenu(menu)
	bindPaneHotkeys(win, settings)
}
