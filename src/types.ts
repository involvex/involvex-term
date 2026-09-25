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

export interface AppSettings {
	theme: {bg: string; fg: string; fontFamily: string; fontSize: number}
	footer: {
		showGit: boolean
		showSys: boolean
		showCpu: boolean
		showMem: boolean
		modulesOrder: string[]
		refreshMs: number
	}
	hotkeys: Record<string, string>
	tabs: {confirmClose: boolean; restoreSession: boolean}
	terminal: {startDir: string}
	window: {
		width: number
		height: number
		x: number | null
		y: number | null
		maximized: boolean
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
