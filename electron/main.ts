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
import {parseCliArgs, type CliCommand} from './cliArgs.js'
import {clearCwdPending, sniffCwd} from './cwdTracker.js'
import {buildEnvHooks} from './envHooks.js'
import {
	checkoutBranch,
	getGitDetails,
	getGitStatus,
	getRemoteUrl,
	invalidateGitCache,
	listBranches,
} from './gitEngine.js'
import {buildMenu} from './hotkeys.js'
import {getOpencodeStatus, opencodeAvailable} from './opencodeEngine.js'
import {
	initPluginHost,
	loadPlugins,
	notifyPtyData,
	notifyPtyExit,
	notifyPtySpawn,
	pluginCommandList,
	pluginsDir,
	pluginStatus,
	pluginStatusBarList,
	runPluginCommand,
	unloadPlugins,
} from './pluginManager.js'
import {getProcessList, killProcess} from './procEngine.js'
import {
	forgetPty,
	getPty,
	killAllPtys,
	killPty,
	ptyCount,
	resolveSpawnCwd,
	setCwd,
	spawnPty,
} from './ptyManager.js'
import {
	handleQuakeBlur,
	isQuakeActive,
	registerQuake,
	registerToggleApp,
	unregisterQuake,
	unregisterToggleApp,
} from './quake.js'
import {safeSend} from './safeSend.js'
import {
	currentFileRejectedReport,
	loadSession,
	loadSettings,
	parseImportedSettings,
	rejectedSettingsReport,
	saveSession,
	saveSettings,
	settingsFile,
} from './settingsStore.js'
import {
	bumpLocalUpdatedAt,
	cancelDeviceLogin,
	finishDeviceLogin,
	getSyncStatus,
	pullOnStartup,
	pullPortable,
	pushPortable,
	setSyncClientId,
	startDeviceLoginAsync,
	unlinkSync,
	validateSyncToken,
} from './settingsSync.js'
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

// wt-style CLI commands (`involvex-term sp -d .`). Queued until the renderer
// has bootstrapped its tabs and asks for them via `cli:pending`.
const pendingCli: CliCommand[] = []
let cliReady = false
{
	const first = parseCliArgs(process.argv.slice(app.isPackaged ? 1 : 2))
	if (first) pendingCli.push(first)
}

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
/** One chokidar watcher per repo root, shared by every pane inside it. */
const gitWatchers = new Map<string, {watcher: FSWatcher; panes: Set<string>}>()
/** Debounced git refresh per pane (a global timer starved all but one). */
const pendingGitRefresh = new Map<string, NodeJS.Timeout>()
/** Coalesce concurrent git refreshes for the same cwd (multi-pane repos). */
const inFlightGit = new Map<string, Promise<void>>()

/**
 * Serial spawn queue: session restore mounts every tab at once (5 tabs ×
 * 2–3 panes = 13 concurrent pwsh + ConPTY + git spawns), which OOM-crashed
 * the app. One shell at a time with a small gap keeps the storm sequential.
 */
let spawnQueue: Promise<unknown> = Promise.resolve()
let lastSpawnAt = 0
const SPAWN_SPACING_MS = 300

function enqueueSpawn<T>(work: () => Promise<T>): Promise<T> {
	const next = spawnQueue.then(async () => {
		const gap = SPAWN_SPACING_MS - (Date.now() - lastSpawnAt)
		if (gap > 0) await new Promise(r => setTimeout(r, gap))
		try {
			return await work()
		} finally {
			lastSpawnAt = Date.now()
		}
	})
	// A rejected spawn must not poison the queue for the panes behind it.
	spawnQueue = next.catch(() => undefined)
	return next
}

async function refreshGitForTab(tabId: string, cwd: string) {
	if (!win) return
	// Coalesce by repo path, not pane id: 5 tabs × 3 panes in one repo
	// must share a single git status instead of 15 concurrent git.exe
	// storms that freeze the app.
	const key = cwd.toLowerCase()
	const existing = inFlightGit.get(key)
	if (existing) {
		await existing
		return
	}
	const work = (async () => {
		if (!win) return
		const status = await withTimeout(getGitStatus(cwd), 8000, null)
		if (!status) return
		safeSend(win, `git:changed-${tabId}`, status)
		safeSend(win, 'git:changed', {tabId, ...status})
		ensureGitWatcher(tabId, status.repoRoot)
	})().finally(() => {
		inFlightGit.delete(key)
	})
	inFlightGit.set(key, work)
	await work
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: NodeJS.Timeout | null = null
	const timeout = new Promise<T>(resolve => {
		timer = setTimeout(() => resolve(fallback), ms)
	})
	return Promise.race([p, timeout]).finally(() => {
		if (timer) clearTimeout(timer)
	})
}

function scheduleGitRefresh(tabId: string, cwd: string) {
	const prev = pendingGitRefresh.get(tabId)
	if (prev) clearTimeout(prev)
	pendingGitRefresh.set(
		tabId,
		setTimeout(() => {
			pendingGitRefresh.delete(tabId)
			void refreshGitForTab(tabId, cwd)
		}, 250),
	)
}

function releaseGitWatcher(paneId: string) {
	for (const [root, entry] of gitWatchers) {
		if (!entry.panes.delete(paneId)) continue
		if (entry.panes.size === 0) {
			void entry.watcher.close().catch(() => undefined)
			gitWatchers.delete(root)
		}
		break
	}
}

/**
 * Release every per-pane resource keyed by pty id: debounced git refresh,
 * chokidar watcher, and the cwd-tracker's pending OSC chunk. Shared by the
 * `pty:kill` handler and the pty `onExit` handler so the two cannot drift —
 * a path that only one of them cleaned up is a leak.
 */
function releasePaneResources(id: string): void {
	clearCwdPending(id)
	const pending = pendingGitRefresh.get(id)
	if (pending) {
		clearTimeout(pending)
		pendingGitRefresh.delete(id)
	}
	releaseGitWatcher(id)
}

function ensureGitWatcher(paneId: string, repoRoot: string | null) {
	for (const [root, entry] of gitWatchers) {
		if (!entry.panes.has(paneId)) continue
		if (root === (repoRoot ?? '')) return
		releaseGitWatcher(paneId)
		break
	}
	if (!repoRoot) return
	const existing = gitWatchers.get(repoRoot)
	if (existing) {
		existing.panes.add(paneId)
		return
	}
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
		const panes = new Set([paneId])
		watcher.on('all', () => {
			invalidateGitCache(repoRoot)
			for (const id of panes) {
				const entry = getPty(id)
				if (entry) scheduleGitRefresh(id, entry.cwd)
			}
		})
		gitWatchers.set(repoRoot, {watcher, panes})
	} catch {
		/* watcher optional */
	}
}

function startSysLoop() {
	stopSysLoop()
	const tick = async () => {
		if (!win || win.isDestroyed()) return
		if (!settings.footer.showSys) return
		// No point burning WMI/CPU queries while hidden or minimized.
		try {
			if (!win.isVisible() || win.isMinimized()) return
		} catch {
			/* ignore visibility probe failures */
		}
		try {
			const stats = await getSysStats()
			safeSend(win, 'sys:tick', stats)
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

/** Re-apply menus/tray/quake/sys after settings change (import, sync pull, …). */
async function applyLoadedSettings(): Promise<void> {
	if (!win || win.isDestroyed()) return
	applyWindowMaterial(win, settings)
	safeSend(win, 'settings:changed', settings)
	await buildMenu(win, settings).catch(() => undefined)
	setupTray(win, iconPath(), settings, quitApp)
	registerQuake(win, () => settings)
	startSysLoop()
}

function registerIpc() {
	ipcMain.handle(
		'pty:spawn',
		async (
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
			return enqueueSpawn(async () => {
				const start = resolveSpawnCwd(
					(cwd && cwd.trim()) ||
						settings.terminal.startDir?.trim() ||
						os.homedir(),
				)
				const hooks = settings.agent?.envHooks ?? {
					enabled: false,
					includeGit: true,
				}
				let git = null as Awaited<ReturnType<typeof getGitStatus>> | null
				let remoteUrl: string | null = null
				if (hooks.enabled && hooks.includeGit) {
					try {
						// Best-effort with a timeout: a restore storm must not park
						// 13 concurrent git.exe probes behind one slow repo.
						git = await withTimeout(getGitStatus(start), 3000, null)
						if (git?.repoRoot) {
							remoteUrl = await withTimeout(
								getRemoteUrl(git.repoRoot).catch(() => null),
								3000,
								null,
							)
						}
					} catch {
						git = null
						remoteUrl = null
					}
				}
				const extraEnv = buildEnvHooks(hooks, {
					paneId: id,
					cwd: start,
					appVersion: app.getVersion(),
					git,
					remoteUrl,
				})
				const entry = spawnPty(id, start, cols, rows, {
					profileId,
					profiles: settings.terminal.profiles as never,
					defaultProfileId: settings.terminal.defaultProfileId,
					extraEnv,
				})
				entry.pty.onData((data: string) => {
					// sniffCwd's onChange fires per chunk that carried a prompt OSC
					// (7/633/9;9) — the renderer's completion signal. Same-cwd
					// re-prompts fire too, which is exactly what we want.
					let sawPrompt = false
					const cleaned = sniffCwd(id, data, (tabId, newCwd) => {
						sawPrompt = true
						setCwd(tabId, newCwd)
						scheduleGitRefresh(tabId, newCwd)
					})
					safeSend(win, `pty:data-${id}`, cleaned)
					if (sawPrompt)
						safeSend(win, `pty:prompt-${id}`, {
							// Regex test scans without copying; cleaned.trim()
							// allocated a full duplicate per prompt chunk.
							// eslint-disable-next-line no-control-regex
							hadOutput: /[^\s\x1b]/.test(cleaned),
						})
					notifyPtyData(id, cleaned)
				})
				entry.pty.onExit(() => {
					// A re-spawn under the same pane id supersedes the previous pty
					// (renderer reload / session restore). That predecessor is killed by
					// spawnPty, so ignore its exit: the replacement owns the pane now
					// and must not be told it exited, nor have "[process exited]"
					// written into the fresh shell by the renderer's onPtyExit.
					if (getPty(id) !== entry) return
					safeSend(win, `pty:exit-${id}`)
					notifyPtyExit(id)
					// Natural exit: node-pty already tore the process down, so just
					// forget the entry. Without this the PtyEntry (net.Socket +
					// ConPTY handle) is pinned for the life of the app, and the
					// per-pane git watcher / cwd-tracker row are never released —
					// ensureGitWatcher happily re-adds a dead pane id.
					forgetPty(id)
					releasePaneResources(id)
					console.log(`[pty] exit ${id} (live=${ptyCount()})`)
				})
				scheduleGitRefresh(id, entry.cwd)
				notifyPtySpawn({paneId: id, cwd: entry.cwd, shell: entry.shell})
				console.log(`[pty] spawn ${id} (${entry.shell}, live=${ptyCount()})`)
				return {id, cwd: entry.cwd, shell: entry.shell}
			})
		},
	)

	ipcMain.on('pty:write', (_e, {id, data}: {id: string; data: string}) => {
		getPty(id)?.pty.write(data)
	})
	ipcMain.on(
		'pty:resize',
		(_e, {id, cols, rows}: {id: string; cols: number; rows: number}) => {
			try {
				// Last line of defense: never shrink ConPTY into a collapsed
				// transient (window animate, grid unmeasured). A tiny ConPTY
				// rewraps the pwsh7 PSReadLine prompt mid-path and desyncs
				// xterm rows so typing lands mid-screen.
				getPty(id)?.pty.resize(Math.max(40, cols || 0), Math.max(10, rows || 0))
			} catch {
				/* noop */
			}
		},
	)
	ipcMain.on('pty:kill', (_e, {id}: {id: string}) => {
		killPty(id)
		releasePaneResources(id)
	})
	ipcMain.on('pty:cwd-seed', (_e, {id, cwd}: {id: string; cwd: string}) => {
		setCwd(id, cwd)
		scheduleGitRefresh(id, cwd)
	})

	ipcMain.handle('git:get', async (_e, {cwd}: {cwd: string}) =>
		getGitStatus(cwd),
	)
	// Lazy enrichment: stash + ahead/behind (2 extra spawns). Called only
	// when the footer git menu opens — never on the per-prompt hot path.
	ipcMain.handle('git:getDetails', async (_e, {cwd}: {cwd: string}) =>
		getGitDetails(cwd),
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

	ipcMain.handle('proc:list', async () => getProcessList())
	ipcMain.handle('proc:kill', async (_e, {pid}: {pid: number}) => {
		// Defense in depth: validate at the IPC boundary too, so a future
		// caller of the channel can't smuggle non-integer pids past typing.
		const id = typeof pid === 'number' ? pid : Number(pid)
		if (!Number.isInteger(id) || id <= 0)
			return {ok: false, error: 'Invalid pid'}
		return killProcess(id)
	})

	ipcMain.handle('opencode:available', () => opencodeAvailable())

	ipcMain.handle(
		'opencode:status',
		(_e, {cwd, limit}: {cwd?: string; limit?: number} = {}) =>
			getOpencodeStatus(cwd, limit),
	)

	ipcMain.handle('agent:which', async (_e, {binary}: {binary: string}) => {
		const name = String(binary ?? '').trim()
		if (!name || /[\r\n"]/.test(name)) return false
		try {
			const {execFile} = await import('node:child_process')
			const {promisify} = await import('node:util')
			const execFileAsync = promisify(execFile)
			if (process.platform === 'win32') {
				await execFileAsync('where.exe', [name])
			} else {
				await execFileAsync('which', [name])
			}
			return true
		} catch {
			return false
		}
	})

	ipcMain.handle(
		'dialog:saveText',
		async (
			_e,
			{
				content,
				defaultPath,
				title,
			}: {content: string; defaultPath?: string; title?: string},
		) => {
			if (!win || win.isDestroyed()) return {ok: false, error: 'no window'}
			const {canceled, filePath} = await dialog.showSaveDialog(win, {
				title: title || 'Export text',
				defaultPath: defaultPath || 'terminal.txt',
				filters: [
					{name: 'Text', extensions: ['txt', 'log']},
					{name: 'All files', extensions: ['*']},
				],
			})
			if (canceled || !filePath) return {ok: false, error: 'canceled'}
			try {
				fs.writeFileSync(filePath, content ?? '', 'utf8')
				return {ok: true, path: filePath}
			} catch (e) {
				return {ok: false, error: e instanceof Error ? e.message : String(e)}
			}
		},
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

	ipcMain.handle('cli:pending', () => {
		cliReady = true
		return pendingCli.splice(0)
	})
	ipcMain.handle('app:info', () => ({
		name: app.getName(),
		version: app.getVersion(),
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
		platform: `${process.platform} ${process.arch}`,
	}))
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
	ipcMain.handle(
		'shell:contextMenu',
		(_e, {action}: {action: 'status' | 'install' | 'uninstall'}) => {
			// Lazy import keeps startup fast on non-Windows platforms.
			return import('./contextMenu.js').then(m => {
				const exe = app.isPackaged ? process.execPath : null
				if (action === 'status') return m.contextMenuStatus(exe)
				if (action === 'install') {
					if (!exe) throw new Error('Only available in packaged builds.')
					m.installContextMenu(exe)
					return m.contextMenuStatus(exe)
				}
				// Explicit, not fall-through: this branch used to be the implicit
				// else, so any unrecognised action (typo, version skew, missing
				// field) silently *removed* the Explorer context menu entry.
				if (action !== 'uninstall') {
					throw new Error(`Unknown context menu action: ${String(action)}`)
				}
				m.uninstallContextMenu()
				return m.contextMenuStatus(exe)
			})
		},
	)

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
			bumpLocalUpdatedAt()
			await applyLoadedSettings()
			// Read the 'import' bucket, not the shared one: the save above
			// reports its own (empty) result and would clear the import's.
			const report = rejectedSettingsReport('import')
			return {
				ok: true,
				settings,
				rejected: report.paths,
				rejectedTotal: report.total,
			}
		} catch (e) {
			return {ok: false, error: e instanceof Error ? e.message : String(e)}
		}
	})

	ipcMain.handle('sync:status', () => getSyncStatus())
	ipcMain.handle('sync:validate', () => validateSyncToken())
	ipcMain.handle('sync:setClientId', (_e, clientId: string) =>
		setSyncClientId(typeof clientId === 'string' ? clientId : ''),
	)
	ipcMain.handle('sync:loginStart', async () => {
		try {
			const device = await startDeviceLoginAsync()
			return {
				ok: true as const,
				userCode: device.userCode,
				verificationUri: device.verificationUri,
				verificationUriComplete: device.verificationUriComplete,
				expiresIn: device.expiresIn,
			}
		} catch (e) {
			return {
				ok: false as const,
				error: e instanceof Error ? e.message : String(e),
			}
		}
	})
	ipcMain.handle('sync:loginFinish', async () => finishDeviceLogin())
	ipcMain.handle('sync:loginCancel', () => {
		cancelDeviceLogin()
		return getSyncStatus()
	})
	ipcMain.handle('sync:logout', () => unlinkSync())
	ipcMain.handle('sync:push', async (_e, opts?: {force?: boolean}) => {
		const result = await pushPortable(settings, {force: opts?.force === true})
		return result
	})
	ipcMain.handle('sync:pull', async () => {
		const result = await pullPortable(settings)
		if (result.ok) {
			settings = saveSettings(result.settings)
			await applyLoadedSettings()
			return {ok: true as const, settings, status: result.status}
		}
		return result
	})

	ipcMain.handle('update:check', () => checkForUpdates())
	ipcMain.handle('update:download', () => downloadUpdate())
	ipcMain.handle('update:install', () => installUpdate())
	ipcMain.handle('update:status', () => getUpdateStatus())

	ipcMain.handle('clipboard:write', (_e, {text}: {text: string}) => {
		clipboard.writeText(text ?? '')
	})
	ipcMain.handle('clipboard:read', () => clipboard.readText())
	// Image paste probe: foreground TUIs with native image paste (e.g.
	// opencode) read the clipboard themselves when they see the Ctrl+V
	// keypress — the emulator only needs to forward it, so this reports
	// image presence without staging any files.
	ipcMain.handle('clipboard:has-image', async () => {
		try {
			const items = await clipboard.read()
			return items.some(item => item.types.some(t => t.startsWith('image/')))
		} catch {
			return false
		}
	})

	ipcMain.handle('settings:get', () => {
		// The banner names settings.json, so the report must describe that file
		// and nothing else - a value only a `save` or an `import` rejected was
		// never in it. `currentFileRejectedReport` also re-reads the file, so a
		// report cannot outlive the save that corrected the file it describes.
		const report = currentFileRejectedReport()
		return {
			settings,
			rejected: report.paths,
			rejectedTotal: report.total,
		}
	})
	ipcMain.handle('settings:set', async (_e, next: typeof settings) => {
		// Only the write decides whether this save succeeded.
		//
		// `saveSettings` throws when the write fails (read-only file, disk
		// full, permissions). That used to reject the IPC promise and the
		// renderer discarded it, so a failed save looked exactly like a
		// successful one and the change silently reappeared on the next
		// launch.
		const pluginsToggled = next.plugins?.enabled !== settings.plugins?.enabled
		let saved: typeof settings
		try {
			saved = saveSettings(next)
		} catch (err) {
			return {
				ok: false as const,
				error: err instanceof Error ? err.message : String(err),
			}
		}
		settings = saved
		bumpLocalUpdatedAt()

		// Everything past this point happens after the file is written, so a
		// failure here says nothing about persistence. Reporting it as a
		// failed save would roll the renderer's UI back to the previous
		// settings while the file holds the new ones - the app disagreeing
		// with its own disk, which is the exact problem this handler exists
		// to remove. Apply failures are logged instead, and the renderer can
		// still re-read the file.
		try {
			if (pluginsToggled) await applyPluginsEnabled()
			if (win) await applyLoadedSettings()
		} catch (e) {
			console.warn('[settings:set] saved, but applying the result failed:', e)
		}
		return {ok: true as const, settings: saved}
	})

	ipcMain.handle('plugin:list', () => ({
		commands: pluginCommandList(),
		statusBar: pluginStatusBarList(),
		status: pluginStatus(settings.plugins.enabled),
	}))
	ipcMain.handle('plugin:runCommand', (_e, {id}: {id: string}) =>
		runPluginCommand(id),
	)
	ipcMain.handle('plugin:openDir', async () => {
		fs.mkdirSync(pluginsDir(), {recursive: true})
		return shell.openPath(pluginsDir())
	})
	ipcMain.handle('plugin:reload', async () => {
		if (settings.plugins.enabled) await loadPlugins(app.getVersion())
		return pluginStatus(settings.plugins.enabled)
	})
	ipcMain.handle('window:toggle-app', () => {
		if (!win || win.isDestroyed()) return
		if (win.isVisible()) {
			if (!win.isMaximized()) win.hide()
		} else {
			try {
				if (win.isMaximized()) win.unmaximize()
				win.show()
				win.focus()
			} catch {
				/* noop */
			}
		}
	})
}

async function applyPluginsEnabled(): Promise<void> {
	if (settings.plugins.enabled) await loadPlugins(app.getVersion())
	else await unloadPlugins()
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
		const w = chokidar.watch(settingsFile(), {ignoreInitial: true})
		w.on('all', () => {
			try {
				settings = loadSettings()
				safeSend(win, 'settings:changed', settings)
				if (win) void buildMenu(win, settings).catch(() => undefined)
				if (win) setupTray(win, iconPath(), settings, quitApp)
				if (win) registerQuake(win, () => settings)
				if (win) registerToggleApp(win, () => settings)
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
		safeSend(win, 'main-process-message', new Date().toLocaleString())
	})
	// A dead renderer never runs its effect cleanups, so no ptyKill is issued
	// and every pane's pty would survive with nothing left able to reach it.
	// Tear them all down; a reload re-spawns from the session snapshot.
	win.webContents.on('render-process-gone', () => {
		killAllPtys()
	})
	if (VITE_DEV_SERVER_URL) win.loadURL(VITE_DEV_SERVER_URL)
	else win.loadFile(path.join(RENDERER_DIST, 'index.html'))
	void buildMenu(win, settings).catch(() => undefined)
	setupTray(win, iconPath(), settings, quitApp)
	registerQuake(win, () => settings)
	registerToggleApp(win, () => settings)
	bindUpdaterWindow(win)
	startSysLoop()
	if (settings.window.checkUpdatesOnStartup) scheduleStartupUpdateCheck()
	void pullOnStartup(settings).then(async merged => {
		if (!merged) return
		settings = saveSettings(merged)
		await applyLoadedSettings()
	})
	initPluginHost({
		settingsSnapshot: () => ({
			version: app.getVersion(),
			theme: {bg: settings.theme.bg, fg: settings.theme.fg},
		}),
		onChanged: () => {
			if (!win || win.isDestroyed()) return
			safeSend(win, 'plugin:changed', {
				commands: pluginCommandList(),
				statusBar: pluginStatusBarList(),
			})
		},
	})
	if (settings.plugins.enabled) void loadPlugins(app.getVersion())
}

function quitApp(): void {
	isQuitting = true
	destroyTray()
	unregisterQuake()
	unregisterToggleApp()
	app.quit()
}

app.on('will-quit', () => {
	unregisterQuake()
	unregisterToggleApp()
	// Teardown lives here rather than in quitApp because this is the one choke
	// point every exit path reaches — quitApp, window-all-closed, and the OS
	// closing the last window all funnel through it. Without it ConPTY is never
	// closed and conhost plus detached grandchildren outlive the app.
	killAllPtys()
	void unloadPlugins()
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
	app.on('second-instance', (_e, argv) => {
		const cmd = parseCliArgs(argv.slice(app.isPackaged ? 1 : 2))
		if (cmd) {
			if (win && !win.isDestroyed() && cliReady) {
				safeSend(win, 'cli:command', cmd)
			} else pendingCli.push(cmd)
		}
		if (!win || win.isDestroyed()) return
		if (win.isMinimized()) win.restore()
		win.show()
		win.focus()
	})
	registerIpc()
	watchSettingsFile()
	app.whenReady().then(createWindow)
}
