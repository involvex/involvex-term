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

export interface ProcInfo {
	pid: number
	name: string
	cpu: number
	mem: number
	memRssMB: number
	path: string
	parentPid?: number
	started?: string
	diskReadKBs: number
	diskWriteKBs: number
	diskTotalKBs: number
	ioSupported: boolean
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
	sessions: OpencodeSession[]
	/** True when the fetch hit its limit — absent ids prove nothing. */
	truncated: boolean
}

export interface BranchList {
	current: string
	local: string[]
	remote: string[]
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

export interface QuickCommand {
	id: string
	label: string
	command: string
	sendEnter: boolean
}

export interface AgentTool {
	id: string
	name: string
	label: string
	binary: string
	command: string
	continueCommand?: string
	sessionProvider: 'opencode' | 'none'
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
		showCwd: boolean
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
		quickCommands: QuickCommand[]
	}
	agent: {
		activeId: string
		tools: AgentTool[]
		/** Optional AI-agnostic env injected on PTY spawn (no in-app chat). */
		envHooks: {
			enabled: boolean
			includeGit: boolean
		}
		/** Show OpenCode session titles on tab/pane chrome (default on). */
		showPaneLabels: boolean
	}
	/** Local plugins loaded from ~/.involvex-term/plugins (opt-in). */
	plugins: {enabled: boolean}
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
	/** When true, close requires confirm and bulk-close skips this tab. */
	pinned?: boolean
	/** Optional accent color (#rrggbb). */
	color?: string
	/** Pane tree JSON (validated/normalized on load). */
	root: unknown
}

export interface SessionState {
	version: 1
	tabs: SessionTab[]
}

export interface SyncStatus {
	linked: boolean
	login?: string
	gistId?: string
	gistUrl?: string
	lastSyncedAt?: number
	localUpdatedAt: number
	clientIdConfigured: boolean
}

export type SyncTokenState = 'signed-out' | 'valid' | 'invalid' | 'unknown'

export interface SyncValidation {
	state: SyncTokenState
	login?: string
	message?: string
}

export type CliCommand =
	| {
			kind: 'split'
			direction: 'horizontal' | 'vertical'
			dir?: string
			profile?: string
	  }
	| {kind: 'new-tab'; dir?: string; profile?: string}

export interface PluginCommand {
	id: string
	title: string
	hint?: string
}
export interface PluginStatusBarSegment {
	id: string
	text: string
	title?: string
}
export interface PluginStatus {
	dir: string
	enabled: boolean
	loaded: Array<{name: string; commands: string[]}>
	errors: Array<{name: string; error: string}>
}
export interface PluginListResult {
	commands: PluginCommand[]
	statusBar: PluginStatusBarSegment[]
	status: PluginStatus
}
export interface PluginChangedMsg {
	commands: PluginCommand[]
	statusBar: PluginStatusBarSegment[]
}

export interface AppInfo {
	name: string
	version: string
	electron: string
	chrome: string
	node: string
	platform: string
}

/**
 * Result of reading settings, including any values that failed validation.
 *
 * `rejected` is a capped sample: a settings file can contain an unbounded
 * number of bad values, so main ships at most `REJECTED_LIMIT` of them.
 * `rejectedTotal` is the true count, which is what the UI should show — using
 * `rejected.length` would understate a truncated list as if it were complete.
 */
export interface SettingsLoadResult {
	settings: AppSettings
	/** Dotted paths from settings.json that were invalid and reset to defaults. */
	rejected: string[]
	/** Total rejected paths, which may exceed `rejected.length`. */
	rejectedTotal?: number
}

/**
 * Result of persisting settings.
 *
 * A discriminated result rather than a rejected promise: the write failing is
 * an ordinary outcome (read-only file, disk full), not an exception, and the
 * renderer has to be able to tell the user rather than drop it.
 */
export type SettingsSaveResult =
	{ok: true; settings: AppSettings} | {ok: false; error: string}

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
	/** Fresh shell prompt detected via OSC 7/633/9;9 (cwd sequences). */
	onPtyPrompt: (
		id: string,
		cb: (info: {hadOutput: boolean}) => void,
	) => () => void
	gitGet: (cwd: string) => Promise<GitStatus>
	/** Stash + ahead/behind enrichment (extra spawns) — menu-open only. */
	gitGetDetails: (cwd: string) => Promise<GitStatus>
	gitBranches: (cwd: string) => Promise<BranchList>
	gitCheckout: (
		cwd: string,
		branch: string,
	) => Promise<{ok: boolean; error?: string; branch?: string}>
	gitRemoteUrl: (cwd: string, remote?: string) => Promise<string | null>
	onGitChanged: (
		cb: (msg: {tabId: string} & Partial<GitStatus>) => void,
	) => () => void
	onGitChangedFor: (
		tabId: string,
		cb: (status: GitStatus) => void,
	) => () => void
	sysGet: () => Promise<SysStats>
	onSysTick: (cb: (stats: SysStats) => void) => () => void
	procList: () => Promise<ProcInfo[]>
	procKill: (pid: number) => Promise<{ok: boolean; error?: string}>
	ptyCwd: (ids: string[]) => Promise<Array<{id: string; cwd: string | null}>>
	sessionGet: () => Promise<SessionState | null>
	sessionSave: (state: SessionState) => Promise<unknown>
	/** Fire-and-forget (safe to call during page unload). */
	sessionSaveSync: (state: SessionState) => void
	clipboardWrite: (text: string) => Promise<void>
	clipboardRead: () => Promise<string>
	clipboardHasImage: () => Promise<boolean>
	settingsGet: () => Promise<SettingsLoadResult>
	settingsSet: (next: AppSettings) => Promise<SettingsSaveResult>
	onSettingsChanged: (cb: (s: AppSettings) => void) => () => void
	onTabAction: (cb: (action: string) => void) => () => void
	opencodeAvailable: () => Promise<boolean>
	opencodeStatus: (cwd?: string, limit?: number) => Promise<OpencodeStatus>
	agentWhich: (binary: string) => Promise<boolean>
	dialogSaveText: (opts: {
		content: string
		defaultPath?: string
		title?: string
	}) => Promise<{ok: boolean; path?: string; error?: string}>
	dialogConfirm: (opts: {
		message: string
		detail?: string
		title?: string
		buttons?: [string, string]
	}) => Promise<boolean>
	pluginList: () => Promise<PluginListResult>
	onPluginChanged: (cb: (msg: PluginChangedMsg) => void) => () => void
	runPluginCommand: (id: string) => Promise<boolean>
	pluginOpenDir: () => Promise<string>
	pluginReload: () => Promise<unknown>
	cliPending: () => Promise<CliCommand[]>
	onCliCommand: (cb: (cmd: CliCommand) => void) => () => void
	appInfo: () => Promise<AppInfo>
	openExternal: (url: string) => Promise<void>
	openPath: (filePath: string) => Promise<string>
	showItemInFolder: (filePath: string) => Promise<void>
	contextMenu: (action: 'status' | 'install' | 'uninstall') => Promise<{
		supported: boolean
		installed: boolean
		exe: string | null
		roots: Array<{key: string; installed: boolean; command: string | null}>
	}>
	settingsExport: () => Promise<{ok: boolean; path?: string; error?: string}>
	settingsImport: () => Promise<{
		ok: boolean
		settings?: AppSettings
		/**
		 * Paths from the imported file that were not applied: either invalid,
		 * or stripped because an imported profile may not choose a command.
		 * Capped sample — see `SettingsLoadResult.rejectedTotal`.
		 */
		rejected?: string[]
		/** Total rejected paths, which may exceed `rejected.length`. */
		rejectedTotal?: number
		error?: string
	}>
	syncStatus: () => Promise<SyncStatus>
	syncValidate: () => Promise<SyncValidation>
	syncSetClientId: (clientId: string) => Promise<SyncStatus>
	syncLoginStart: () => Promise<{
		ok: boolean
		userCode?: string
		verificationUri?: string
		verificationUriComplete?: string
		expiresIn?: number
		error?: string
	}>
	syncLoginFinish: () => Promise<{
		ok: boolean
		error?: string
		status: SyncStatus
	}>
	syncLoginCancel: () => Promise<SyncStatus>
	syncLogout: () => Promise<SyncStatus>
	syncPush: (opts?: {force?: boolean}) => Promise<{
		ok: boolean
		needsConfirm?: boolean
		remoteUpdatedAt?: number
		error?: string
		status: SyncStatus
	}>
	syncPull: () => Promise<{
		ok: boolean
		settings?: AppSettings
		error?: string
		status: SyncStatus
	}>
	updateCheck: () => Promise<UpdateStatus>
	updateDownload: () => Promise<UpdateStatus>
	updateInstall: () => Promise<void>
	updateStatus: () => Promise<UpdateStatus>
	onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void
	windowToggleApp: () => void
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
