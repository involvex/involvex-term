export interface GitStatus {
	cwd: string
	repoRoot: string | null
	branch: string
	isDirty: boolean
	staged: number
	unstaged: number
	untracked: number
	ahead: number
	behind: number
	stashCount: number
}

export interface SysStats {
	cpuPercent: number
	memUsedGB: number
	memTotalGB: number
	memPercent: number
	uptimeSec: number
}

export interface OpencodeSession {
	id: string
	title: string
	directory: string
	updated: number
	created: number
}

export interface OpencodeStatus {
	available: boolean
	sessionCount: number
	latest: OpencodeSession | null
	projectMatch: boolean
}

export interface ShellProfile {
	id: string
	name: string
	kind: 'pwsh' | 'powershell' | 'cmd' | 'wsl' | 'custom'
	command?: string
	args?: string[]
}

export interface CommandSnippet {
	id: string
	name: string
	command: string
	sendEnter: boolean
}

export interface UpdateStatus {
	state:
		| 'idle'
		| 'checking'
		| 'available'
		| 'not-available'
		| 'downloading'
		| 'downloaded'
		| 'error'
	version?: string
	currentVersion: string
	message?: string
	percent?: number
}

export interface AppSettings {
	theme: {
		bg: string
		fg: string
		fontFamily: string
		fontSize: number
		fontFallback: string
	}
	footer: {
		showGit: boolean
		showSys: boolean
		showCpu: boolean
		showMem: boolean
		showOpencode: boolean
		modulesOrder: string[]
		refreshMs: number
	}
	hotkeys: Record<string, string>
	tabs: {confirmClose: boolean; restoreSession: boolean}
	terminal: {
		startDir: string
		defaultProfileId: string
		profiles: ShellProfile[]
		completionBell: boolean
		scrollback: number
		scrollbar: boolean
		snippets: CommandSnippet[]
	}
	startup: {
		mode: 'session' | 'new'
		profileId: string
	}
	window: {
		width: number
		height: number
		x: number | null
		y: number | null
		maximized: boolean
		acrylic: boolean
		checkUpdatesOnStartup: boolean
	}
	tray: {enabled: boolean; minimizeToTray: boolean; closeToTray: boolean}
	quake: {
		enabled: boolean
		hotkey: string
		heightPercent: number
		hideOnFocusLoss: boolean
	}
}

export interface SessionTab {
	title: string
	/** User-pinned title; when set, auto git titles are skipped. */
	customTitle?: string
	/** Pane tree JSON (validated/normalized on load). */
	root: unknown
}

export interface SessionState {
	version: 1
	tabs: SessionTab[]
}

export interface TermApiShape {
	ptySpawn: (args: {
		id: string
		cwd?: string
		cols: number
		rows: number
		profileId?: string
	}) => Promise<{id: string; cwd: string; shell: string}>
	ptyWrite: (id: string, data: string) => void
	ptyResize: (id: string, cols: number, rows: number) => void
	ptyKill: (id: string) => void
	ptySeedCwd: (id: string, cwd: string) => void
	onPtyData: (id: string, cb: (data: string) => void) => () => void
	onPtyExit: (id: string, cb: () => void) => () => void
	gitGet: (cwd: string) => Promise<GitStatus>
	onGitChanged: (
		cb: (msg: {tabId: string} & Partial<GitStatus>) => void,
	) => () => void
	onGitChangedFor: (
		tabId: string,
		cb: (status: GitStatus) => void,
	) => () => void
	sysGet: () => Promise<SysStats>
	onSysTick: (cb: (stats: SysStats) => void) => () => void
	ptyCwd: (ids: string[]) => Promise<Array<{id: string; cwd: string | null}>>
	sessionGet: () => Promise<SessionState | null>
	sessionSave: (state: SessionState) => Promise<unknown>
	/** Fire-and-forget (safe to call during page unload). */
	sessionSaveSync: (state: SessionState) => void
	clipboardWrite: (text: string) => Promise<void>
	clipboardRead: () => Promise<string>
	settingsGet: () => Promise<AppSettings>
	settingsSet: (next: AppSettings) => Promise<AppSettings>
	onSettingsChanged: (cb: (s: AppSettings) => void) => () => void
	onTabAction: (cb: (action: string) => void) => () => void
	opencodeAvailable: () => Promise<boolean>
	opencodeStatus: (cwd?: string) => Promise<OpencodeStatus>
	dialogConfirm: (opts: {
		message: string
		detail?: string
		title?: string
		buttons?: [string, string]
	}) => Promise<boolean>
	openExternal: (url: string) => Promise<void>
	openPath: (filePath: string) => Promise<string>
	showItemInFolder: (filePath: string) => Promise<void>
	settingsExport: () => Promise<{ok: boolean; path?: string; error?: string}>
	settingsImport: () => Promise<{
		ok: boolean
		settings?: AppSettings
		error?: string
	}>
	updateCheck: () => Promise<UpdateStatus>
	updateDownload: () => Promise<UpdateStatus>
	updateInstall: () => Promise<void>
	updateStatus: () => Promise<UpdateStatus>
	onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void
}

declare global {
	interface Window {
		termApi?: TermApiShape
	}
}

export function termApi(): TermApiShape | undefined {
	return window.termApi
}

export function isElectron(): boolean {
	return typeof window.termApi !== 'undefined'
}
