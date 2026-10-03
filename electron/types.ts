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
	/** I/O rate in KB/s since previous snapshot. */
	diskReadKBs: number
	diskWriteKBs: number
	diskTotalKBs: number
	/** True when the OS backend provided IO counters for this row. */
	ioSupported: boolean
}

export type FooterModuleId = 'git' | 'sys'

/** Persisted session: tab split-trees with per-pane cwds. `root` is opaque
 * JSON here — structurally validated/normalized on the renderer side. */
export interface SessionTab {
	title: string
	/** User-pinned title; when set, auto git titles are skipped. */
	customTitle?: string
	/** When true, close requires confirm and bulk-close skips this tab. */
	pinned?: boolean
	/** Optional accent color (#rrggbb). */
	color?: string
	root: unknown
}

export interface SessionState {
	version: 1
	tabs: SessionTab[]
}
