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
let statusCache: {at: number; cwd: string; value: OpencodeStatus} | null = null
const STATUS_TTL_MS = 4000

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
export async function getOpencodeStatus(cwd?: string): Promise<OpencodeStatus> {
	const now = Date.now()
	const cwdKey = cwd ?? ''
	if (
		statusCache &&
		now - statusCache.at < STATUS_TTL_MS &&
		statusCache.cwd === cwdKey
	)
		return statusCache.value
	const available = await opencodeAvailable()
	if (!available) {
		return {
			available: false,
			sessionCount: 0,
			latest: null,
			projectMatch: false,
			sessions: [],
		}
	}
	try {
		const {stdout} = await execFileAsync(
			'opencode',
			['session', 'list', '--format', 'json', '-n', '30'],
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
		}
		statusCache = {at: Date.now(), cwd: cwdKey, value}
		return value
	} catch {
		return {
			available: true,
			sessionCount: 0,
			latest: null,
			projectMatch: false,
			sessions: [],
		}
	}
}
