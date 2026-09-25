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

async function opencodeAvailable(): Promise<boolean> {
	try {
		if (process.platform === 'win32') {
			await execFileAsync('where.exe', ['opencode'])
		} else {
			await execFileAsync('which', ['opencode'])
		}
		return true
	} catch {
		return false
	}
}

export {opencodeAvailable}

/** List recent OpenCode sessions; optionally prefer ones under `cwd`. */
export async function getOpencodeStatus(cwd?: string): Promise<OpencodeStatus> {
	const available = await opencodeAvailable()
	if (!available) {
		return {
			available: false,
			sessionCount: 0,
			latest: null,
			projectMatch: false,
		}
	}
	try {
		const {stdout} = await execFileAsync(
			'opencode',
			['session', 'list', '--format', 'json', '-n', '20'],
			{
				timeout: 15_000,
				windowsHide: true,
				maxBuffer: 2 * 1024 * 1024,
			},
		)
		const sessions = parseSessions(stdout).sort((a, b) => b.updated - a.updated)
		const cwdN = cwd ? normPath(cwd) : ''
		const match = cwdN
			? sessions.find(
					s =>
						s.directory &&
						(normPath(s.directory) === cwdN ||
							cwdN.startsWith(normPath(s.directory) + '\\') ||
							cwdN.startsWith(normPath(s.directory) + '/')),
				)
			: undefined
		const latest = match ?? sessions[0] ?? null
		return {
			available: true,
			sessionCount: sessions.length,
			latest,
			projectMatch: Boolean(match),
		}
	} catch {
		return {
			available: true,
			sessionCount: 0,
			latest: null,
			projectMatch: false,
		}
	}
}
