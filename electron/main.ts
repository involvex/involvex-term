import chokidar, {type FSWatcher} from 'chokidar'
import type {BrowserWindowConstructorOptions, Event} from 'electron'
import {
	app,
	BrowserWindow,
	clipboard,
	dialog,
	ipcMain,
	screen,
	shell,
} from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {sniffCwd} from './cwdTracker.js'
import {
	checkoutBranch,
	getGitStatus,
	getRemoteUrl,
	invalidateGitCache,
	listBranches,
} from './gitEngine.js'
import {buildMenu} from './hotkeys.js'
import {getOpencodeStatus, opencodeAvailable} from './opencodeEngine.js'
import {getPty, killPty, setCwd, spawnPty} from './ptyManager.js'
import {
	handleQuakeBlur,
	isQuakeActive,
	registerQuake,
	unregisterQuake,
} from './quake.js'
import {
	loadSession,
	loadSettings,
	parseImportedSettings,
	saveSession,
	saveSettings,
	SETTINGS_FILE,
} from './settingsStore.js'
import {getSysStats} from './sysEngine.js'
import {destroyTray, setupTray} from './tray.js'
import {
	bindUpdaterWindow,
	checkForUpdates,
	downloadUpdate,
	getUpdateStatus,
	installUpdate,
	scheduleStartupUpdateCheck,
} from './updater.js'

// Isolate Chromium profile under ~/.involvex-term so dev + packaged builds
// and multiple instances don't fight over the default Electron userData cache.
const USER_DATA = path.join(os.homedir(), '.involvex-term', 'electron')
try {
	fs.mkdirSync(USER_DATA, {recursive: true})
	app.setPath('userData', USER_DATA)
} catch {
	/* keep Electron default */
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
	app.quit()
}

let isQuitting = false

function iconPath(): string {
	const custom = path.join(process.env.VITE_PUBLIC, 'icon.png')
	try {
		if (fs.existsSync(custom)) return custom
	} catch {
		/* fall through */
	}
	return path.join(process.env.VITE_PUBLIC, 'electron-vite.svg')
}

function persistWindowBounds(): void {
	if (!win || win.isDestroyed()) return
	// Quake dropdown geometry is transient — never persist it as the
	// normal window bounds.
	if (isQuakeActive()) return
	try {
		const maximized = win.isMaximized()
		const b = win.getBounds()
		settings = saveSettings({
			...settings,
			window: {
				...settings.window,
				width: b.width,
				height: b.height,
				x: maximized ? settings.window.x : b.x,
				y: maximized ? settings.window.y : b.y,
				maximized,
			},
		})
	} catch {
		/* noop */
	}
}

function onScreen(x: number | null, y: number | null): boolean {
	if (x == null || y == null) return false
	try {
		return screen.getAllDisplays().some(d => {
			const a = d.bounds
			return x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height
		})
	} catch {
		return false
	}
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, 'public')
	: RENDERER_DIST

let win: BrowserWindow | null = null
let settings = loadSettings()
let sysTimer: NodeJS.Timeout | null = null
const gitWatchers = new Map<string, FSWatcher>()
let pendingGitRefresh: NodeJS.Timeout | null = null

async function refreshGitForTab(tabId: string, cwd: string) {
	if (!win) return
	const status = await getGitStatus(cwd)
	win.webContents.send(`git:changed-${tabId}`, status)
	win.webContents.send('git:changed', {tabId, ...status})
	ensureGitWatcher(tabId, status.repoRoot)
}

function scheduleGitRefresh(tabId: string, cwd: string) {
	if (pendingGitRefresh) clearTimeout(pendingGitRefresh)
	pendingGitRefresh = setTimeout(() => void refreshGitForTab(tabId, cwd), 250)
}

function ensureGitWatcher(tabId: string, repoRoot: string | null) {
	const prev = gitWatchers.get(tabId)
	const prevRoot = (prev as unknown as {__root?: string} | undefined)?.__root
	if (prev && prevRoot === (repoRoot ?? '')) return
	if (prev) {
		void prev.close().catch(() => undefined)
		gitWatchers.delete(tabId)
	}
	if (!repoRoot) return
	try {
		const watcher = chokidar.watch(
			[
				path.join(repoRoot, '.git', 'HEAD'),
				path.join(repoRoot, '.git', 'index'),
				path.join(repoRoot, '.git', 'refs'),
			],
			{
				ignoreInitial: true,
				depth: 4,
			},
		)
		;(watcher as unknown as {__root?: string}).__root = repoRoot
		watcher.on('all', () => {
			invalidateGitCache(repoRoot)
			const entry = getPty(tabId)
			if (entry) void refreshGitForTab(tabId, entry.cwd)
		})
		gitWatchers.set(tabId, watcher)
	} catch {
		/* watcher optional */
	}
}

function startSysLoop() {
	stopSysLoop()
	const tick = async () => {
		if (!win) return
		if (!settings.footer.showSys) return
		try {
			const stats = await getSysStats()
			win.webContents.send('sys:tick', stats)
		} catch {
			/* noop */
		}
	}
	void tick()
	sysTimer = setInterval(
		() => void tick(),
		Math.max(500, settings.footer.refreshMs || 1500),
	)
}

function stopSysLoop() {
	if (sysTimer) clearInterval(sysTimer)
	sysTimer = null
}

function registerIpc() {
	ipcMain.handle(
		'pty:spawn',
		(
			_e,
			{
				id,
				cwd,
				cols,
				rows,
				profileId,
			}: {
				id: string
				cwd?: string
				cols: number
				rows: number
				profileId?: string
			},
		) => {
			const start =
				(cwd && cwd.trim()) ||
				settings.terminal.startDir?.trim() ||
				os.homedir()
			const entry = spawnPty(id, start, cols, rows, {
				profileId,
				profiles: settings.terminal.profiles as never,
				defaultProfileId: settings.terminal.defaultProfileId,
			})
			entry.pty.onData((data: string) => {
				const cleaned = sniffCwd(id, data, (tabId, newCwd) => {
					setCwd(tabId, newCwd)
					scheduleGitRefresh(tabId, newCwd)
				})
				win?.webContents.send(`pty:data-${id}`, cleaned)
			})
			entry.pty.onExit(() => {
				win?.webContents.send(`pty:exit-${id}`)
			})
			scheduleGitRefresh(id, entry.cwd)
			return {id, cwd: entry.cwd, shell: entry.shell}
		},
	)

	ipcMain.on('pty:write', (_e, {id, data}: {id: string; data: string}) => {
		getPty(id)?.pty.write(data)
	})
	ipcMain.on(
		'pty:resize',
		(_e, {id, cols, rows}: {id: string; cols: number; rows: number}) => {
			try {
				getPty(id)?.pty.resize(Math.max(2, cols), Math.max(1, rows))
			} catch {
				/* noop */
			}
		},
	)
	ipcMain.on('pty:kill', (_e, {id}: {id: string}) => {
		killPty(id)
		const w = gitWatchers.get(id)
		if (w) {
			void w.close().catch(() => undefined)
			gitWatchers.delete(id)
		}
	})
	ipcMain.on('pty:cwd-seed', (_e, {id, cwd}: {id: string; cwd: string}) => {
		setCwd(id, cwd)
		scheduleGitRefresh(id, cwd)
	})

	ipcMain.handle('git:get', async (_e, {cwd}: {cwd: string}) =>
		getGitStatus(cwd),
	)
	ipcMain.handle('git:branches', async (_e, {cwd}: {cwd: string}) =>
		listBranches(cwd),
	)
	ipcMain.handle(
		'git:checkout',
		async (_e, {cwd, branch}: {cwd: string; branch: string}) =>
			checkoutBranch(cwd, branch),
	)
	ipcMain.handle(
		'git:remoteUrl',
		async (_e, {cwd, remote}: {cwd: string; remote?: string} = {cwd: ''}) =>
			getRemoteUrl(cwd, remote || 'origin'),
	)

	// Live cwd per pty (tracked via OSC7) — used for session snapshots.
	ipcMain.handle('pty:cwd', (_e, {ids}: {ids: string[]}) =>
		(Array.isArray(ids) ? ids : []).map(id => ({
			id,
			cwd: getPty(id)?.cwd ?? null,
		})),
	)

	ipcMain.handle('session:get', () => loadSession())
	const onSessionSave = (
		_e: unknown,
		state: {tabs?: Array<{title: string; root: unknown}>},
	) => saveSession({version: 1, tabs: state?.tabs ?? []})
	ipcMain.handle('session:save', onSessionSave)
	// Fire-and-forget variant for unload/shutdown flushes.
	ipcMain.on('session:save', onSessionSave as never)

	ipcMain.handle('sys:get', async () => getSysStats())

	ipcMain.handle('opencode:available', () => opencodeAvailable())

	ipcMain.handle('opencode:status', (_e, {cwd}: {cwd?: string} = {}) =>
		getOpencodeStatus(cwd),
	)

	ipcMain.handle(
		'dialog:confirm',
		async (
			_e,
			opts: {
				message: string
				detail?: string
				title?: string
				buttons?: [string, string]
			} = {
				message: 'Confirm?',
			},
		) => {
			if (!win || win.isDestroyed()) return false
			const buttons = opts.buttons ?? ['OK', 'Cancel']
			const {response} = await dialog.showMessageBox(win, {
				type: 'question',
				buttons,
				defaultId: opts.buttons ? 0 : 1,
				cancelId: 1,
				title: opts.title ?? 'involvex-term',
				message: opts.message,
				detail: opts.detail,
				noLink: true,
			})
			return response === 0
		},
	)

	ipcMain.handle('shell:openExternal', async (_e, {url}: {url: string}) => {
		const u = String(url ?? '').trim()
		if (!/^https?:\/\//i.test(u) && !/^mailto:/i.test(u)) return
		await shell.openExternal(u)
	})
	ipcMain.handle('shell:openPath', async (_e, {path: p}: {path: string}) => {
		const target = String(p ?? '').trim()
		if (!target) return 'empty path'
		return shell.openPath(target)
	})
	ipcMain.handle('shell:showItemInFolder', (_e, {path: p}: {path: string}) => {
		const target = String(p ?? '').trim()
		if (!target) return
		shell.showItemInFolder(target)
	})

	ipcMain.handle('settings:export', async () => {
		if (!win || win.isDestroyed()) return {ok: false, error: 'no window'}
		const {canceled, filePath} = await dialog.showSaveDialog(win, {
			title: 'Export settings',
			defaultPath: 'involvex-term-settings.json',
			filters: [{name: 'JSON', extensions: ['json']}],
		})
		if (canceled || !filePath) return {ok: false, error: 'canceled'}
		try {
			fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8')
			return {ok: true, path: filePath}
		} catch (e) {
			return {ok: false, error: e instanceof Error ? e.message : String(e)}
		}
	})

	ipcMain.handle('settings:import', async () => {
		if (!win || win.isDestroyed()) return {ok: false, error: 'no window'}
		const {canceled, filePaths} = await dialog.showOpenDialog(win, {
			title: 'Import settings',
			filters: [{name: 'JSON', extensions: ['json']}],
			properties: ['openFile'],
		})
		if (canceled || !filePaths[0]) return {ok: false, error: 'canceled'}
		try {
			const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'))
			settings = saveSettings(parseImportedSettings(raw))
			win.webContents.send('settings:changed', settings)
			await buildMenu(win, settings).catch(() => undefined)
			setupTray(win, iconPath(), settings, quitApp)
			registerQuake(win, () => settings)
			applyWindowMaterial(win, settings)
			startSysLoop()
			return {ok: true, settings}
		} catch (e) {
			return {ok: false, error: e instanceof Error ? e.message : String(e)}
		}
	})

	ipcMain.handle('update:check', () => checkForUpdates())
	ipcMain.handle('update:download', () => downloadUpdate())
	ipcMain.handle('update:install', () => installUpdate())
	ipcMain.handle('update:status', () => getUpdateStatus())

	ipcMain.handle('clipboard:write', (_e, {text}: {text: string}) => {
		clipboard.writeText(text ?? '')
	})
	ipcMain.handle('clipboard:read', () => clipboard.readText())

	ipcMain.handle('settings:get', () => settings)
	ipcMain.handle('settings:set', async (_e, next: typeof settings) => {
		settings = saveSettings(next)
		if (win) {
			applyWindowMaterial(win, settings)
			win.webContents.send('settings:changed', settings)
			await buildMenu(win, settings).catch(() => undefined)
			setupTray(win, iconPath(), settings, quitApp)
			registerQuake(win, () => settings)
			startSysLoop()
		}
		return settings
	})
}

/** Windows 11 mica/acrylic on the frame (title bar). Needs restart for some hosts. */
function applyWindowMaterial(browser: BrowserWindow, s: typeof settings): void {
	if (process.platform !== 'win32') return
	try {
		browser.setBackgroundMaterial(s.window.acrylic ? 'mica' : 'none')
	} catch {
		/* unsupported OS build */
	}
}

function watchSettingsFile() {
	try {
		const w = chokidar.watch(SETTINGS_FILE, {ignoreInitial: true})
		w.on('all', () => {
			try {
				settings = loadSettings()
				win?.webContents.send('settings:changed', settings)
				if (win) void buildMenu(win, settings).catch(() => undefined)
				if (win) setupTray(win, iconPath(), settings, quitApp)
				if (win) registerQuake(win, () => settings)
				startSysLoop()
			} catch {
				/* noop */
			}
		})
	} catch {
		/* optional */
	}
}

function createWindow() {
	const w = settings.window
	const bounds: BrowserWindowConstructorOptions = {
		width: w.width,
		height: w.height,
		show: false,
	}
	if (onScreen(w.x, w.y)) {
		bounds.x = w.x ?? undefined
		bounds.y = w.y ?? undefined
	}
	win = new BrowserWindow({
		...bounds,
		title: 'involvex-term',
		icon: iconPath(),
		backgroundColor: settings.theme.bg || '#1e1e1e',
		...(process.platform === 'win32' && w.acrylic
			? {backgroundMaterial: 'mica' as const}
			: {}),
		webPreferences: {preload: path.join(__dirname, 'preload.mjs')},
	})
	applyWindowMaterial(win, settings)

	if (w.maximized) win.maximize()
	win.once('ready-to-show', () => win?.show())

	let saveTimer: NodeJS.Timeout | null = null
	const scheduleSave = () => {
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(persistWindowBounds, 500)
	}
	win.on('resize', scheduleSave)
	win.on('move', scheduleSave)

	win.on('minimize', () => {
		if (settings.tray.enabled && settings.tray.minimizeToTray) win?.hide()
	})
	win.on('close', (e: Event) => {
		if (!isQuitting && settings.tray.enabled && settings.tray.closeToTray) {
			e.preventDefault()
			persistWindowBounds()
			win?.hide()
		} else {
			persistWindowBounds()
		}
	})
	win.on('show', () => {
		if (win) setupTray(win, iconPath(), settings, quitApp)
	})
	win.on('hide', () => {
		if (win) setupTray(win, iconPath(), settings, quitApp)
	})
	win.on('blur', () => {
		if (win) handleQuakeBlur(win, () => settings)
	})

	win.webContents.on('did-finish-load', () => {
		win?.webContents.send('main-process-message', new Date().toLocaleString())
	})
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL)
	else win.loadFile(path.join(RENDERER_DIST, 'index.html'))
	void buildMenu(win, settings).catch(() => undefined)
	setupTray(win, iconPath(), settings, quitApp)
	registerQuake(win, () => settings)
	bindUpdaterWindow(win)
	startSysLoop()
	if (settings.window.checkUpdatesOnStartup) scheduleStartupUpdateCheck()
}

function quitApp(): void {
	isQuitting = true
	destroyTray()
	unregisterQuake()
	app.quit()
}

app.on('will-quit', () => {
	unregisterQuake()
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
		win = null
	}
})
app.on('activate', () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

if (gotLock) {
	app.on('second-instance', () => {
		if (!win || win.isDestroyed()) return
		if (win.isMinimized()) win.restore()
		win.show()
		win.focus()
	})
	registerIpc()
	watchSettingsFile()
	app.whenReady().then(createWindow)
}
