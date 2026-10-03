import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

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
	/** Most relevant session (cwd match preferred, else latest). */
	latest: OpencodeSession | null
	/** True when `latest` belongs to the active cwd / project. */
	projectMatch: boolean
	/** Recent sessions (newest first), for the picker. */
	sessions: OpencodeSession[]
	/**
	 * True when the fetch hit `limit` — the list may be incomplete and
	 * absent ids prove nothing (callers must not prune bindings on it).
	 */
	truncated: boolean
}

function normPath(p: string): string {
	return p.replace(/[/\\]+$/, '').toLowerCase()
}

function parseSessions(stdout: string): OpencodeSession[] {
	try {
		const raw = JSON.parse(stdout) as unknown
		if (!Array.isArray(raw)) return []
		return raw
			.map(row => {
				if (!row || typeof row !== 'object') return null
				const r = row as Record<string, unknown>
				const id = typeof r.id === 'string' ? r.id : ''
				if (!id) return null
				return {
					id,
					title: typeof r.title === 'string' ? r.title : '(untitled)',
					directory: typeof r.directory === 'string' ? r.directory : '',
					updated: typeof r.updated === 'number' ? r.updated : 0,
					created: typeof r.created === 'number' ? r.created : 0,
				}
			})
			.filter((s): s is OpencodeSession => s !== null)
	} catch {
		return []
	}
}

let availCache: {at: number; value: boolean} | null = null
const AVAIL_TTL_MS = 60_000
/** Keyed by cwd + limit: footer poll (10) and picker fetch (30) coexist. */
const statusCache = new Map<string, {at: number; value: OpencodeStatus}>()
const STATUS_TTL_MS = 4000

/** Footer poll depth. The picker fetches deeper on open (see PICKER_LIMIT). */
export const FOOTER_LIMIT = 10
/** Full list for the session picker. */
export const PICKER_LIMIT = 30

async function opencodeAvailable(): Promise<boolean> {
	const now = Date.now()
	if (availCache && now - availCache.at < AVAIL_TTL_MS) return availCache.value
	try {
		if (process.platform === 'win32') {
			await execFileAsync('where.exe', ['opencode'])
		} else {
			await execFileAsync('which', ['opencode'])
		}
		availCache = {at: now, value: true}
		return true
	} catch {
		availCache = {at: now, value: false}
		return false
	}
}

export {opencodeAvailable}

function sessionMatchesCwd(s: OpencodeSession, cwdN: string): boolean {
	if (!cwdN || !s.directory) return false
	const d = normPath(s.directory)
	return d === cwdN || cwdN.startsWith(d + '\\') || cwdN.startsWith(d + '/')
}

/** List recent OpenCode sessions; optionally prefer ones under `cwd`. */
export async function getOpencodeStatus(
	cwd?: string,
	limit = FOOTER_LIMIT,
): Promise<OpencodeStatus> {
	const now = Date.now()
	const depth = Math.min(50, Math.max(1, Math.floor(limit) || FOOTER_LIMIT))
	const cwdKey = cwd ?? ''
	const cacheKey = `${cwdKey}\n${depth}`
	const hit = statusCache.get(cacheKey)
	if (hit && now - hit.at < STATUS_TTL_MS) return hit.value
	const available = await opencodeAvailable()
	if (!available) {
		return {
			available: false,
			sessionCount: 0,
			latest: null,
			projectMatch: false,
			sessions: [],
			truncated: false,
		}
	}
	try {
		const {stdout} = await execFileAsync(
			'opencode',
			['session', 'list', '--format', 'json', '-n', String(depth)],
			{
				timeout: 15_000,
				windowsHide: true,
				maxBuffer: 2 * 1024 * 1024,
			},
		)
		const sessions = parseSessions(stdout).sort((a, b) => b.updated - a.updated)
		const cwdN = cwd ? normPath(cwd) : ''
		const match = cwdN
			? sessions.find(s => sessionMatchesCwd(s, cwdN))
			: undefined
		const latest = match ?? sessions[0] ?? null
		const value = {
			available: true,
			sessionCount: sessions.length,
			latest,
			projectMatch: Boolean(match),
			sessions,
			truncated: sessions.length >= depth,
		}
		statusCache.set(cacheKey, {at: Date.now(), value})
		return value
	} catch {
		return {
			available: true,
			sessionCount: 0,
			latest: null,
			projectMatch: false,
			sessions: [],
			truncated: false,
		}
	}
}
