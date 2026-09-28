/** Match OpenCode sessions to panes for agent-aware chrome labels. */

import type {OpencodeSession} from '../types'

export type AgentActivity = 'active' | 'idle'

/** How long after `session.updated` we treat a session as actively busy. */
export const AGENT_ACTIVE_MS = 120_000

export interface PaneLaunchBinding {
	/** Set when continuing a specific session (`opencode -s <id>`). */
	sessionId?: string
	agentLabel: string
	agentName: string
	launchedAt: number
}

export interface PaneAgentInfo {
	paneId: string
	sessionId: string
	title: string
	activity: AgentActivity
	directory: string
	/** Short badge text (e.g. OC). */
	agentLabel: string
	/** True when assigned via launch/continue, not cwd alone. */
	bound: boolean
}

export function normAgentPath(p: string): string {
	return p.replace(/[/\\]+$/, '').toLowerCase()
}

export function sessionMatchesCwd(
	directory: string,
	cwd: string | null | undefined,
): boolean {
	if (!cwd || !directory) return false
	const cwdN = normAgentPath(cwd)
	const d = normAgentPath(directory)
	if (!cwdN || !d) return false
	return d === cwdN || cwdN.startsWith(d + '\\') || cwdN.startsWith(d + '/')
}

export function shortAgentTitle(title: string, max = 28): string {
	const t = title.trim() || '(untitled)'
	return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function sessionActivity(
	updated: number,
	now = Date.now(),
): AgentActivity {
	if (!updated || updated <= 0) return 'idle'
	return now - updated <= AGENT_ACTIVE_MS ? 'active' : 'idle'
}

function findSession(
	sessions: OpencodeSession[],
	id: string,
): OpencodeSession | undefined {
	return sessions.find(s => s.id === id)
}

function newestMatching(
	sessions: OpencodeSession[],
	cwd: string | null | undefined,
	claimed: Set<string>,
): OpencodeSession | undefined {
	let best: OpencodeSession | undefined
	for (const s of sessions) {
		if (claimed.has(s.id)) continue
		if (!sessionMatchesCwd(s.directory, cwd)) continue
		if (!best || s.updated > best.updated) best = s
	}
	return best
}

/**
 * Assign at most one OpenCode session per pane and one pane per session.
 * Prefer explicit launch/continue bindings, then newest cwd match.
 */
export function assignPaneAgentLabels(opts: {
	panes: Array<{paneId: string; cwd?: string | null}>
	sessions: OpencodeSession[]
	bindings: Record<string, PaneLaunchBinding>
	agentLabel: string
	now?: number
}): Map<string, PaneAgentInfo> {
	const now = opts.now ?? Date.now()
	const out = new Map<string, PaneAgentInfo>()
	const claimed = new Set<string>()
	const sessions = [...opts.sessions].sort((a, b) => b.updated - a.updated)

	const put = (
		paneId: string,
		s: OpencodeSession,
		bound: boolean,
		agentLabel: string,
	) => {
		if (claimed.has(s.id) || out.has(paneId)) return
		claimed.add(s.id)
		out.set(paneId, {
			paneId,
			sessionId: s.id,
			title: s.title || '(untitled)',
			activity: sessionActivity(s.updated, now),
			directory: s.directory,
			agentLabel,
			bound,
		})
	}

	// Pass 1: explicit session id from continue/launch.
	for (const pane of opts.panes) {
		const b = opts.bindings[pane.paneId]
		if (!b?.sessionId) continue
		const s = findSession(sessions, b.sessionId)
		if (s) put(pane.paneId, s, true, b.agentLabel || opts.agentLabel)
	}

	// Pass 2: bound panes without id (fresh `opencode`) → newest cwd match.
	for (const pane of opts.panes) {
		if (out.has(pane.paneId)) continue
		const b = opts.bindings[pane.paneId]
		if (!b) continue
		const s = newestMatching(sessions, pane.cwd, claimed)
		if (s) put(pane.paneId, s, true, b.agentLabel || opts.agentLabel)
	}

	// Pass 3: unbound panes → cwd match to remaining sessions.
	for (const pane of opts.panes) {
		if (out.has(pane.paneId)) continue
		const s = newestMatching(sessions, pane.cwd, claimed)
		if (s) put(pane.paneId, s, false, opts.agentLabel)
	}

	return out
}

/** Drop bindings whose session vanished or whose pane no longer exists. */
export function pruneAgentBindings(
	bindings: Record<string, PaneLaunchBinding>,
	paneIds: Set<string>,
	sessions: OpencodeSession[],
	now = Date.now(),
): Record<string, PaneLaunchBinding> {
	const sessionIds = new Set(sessions.map(s => s.id))
	const next: Record<string, PaneLaunchBinding> = {}
	for (const [paneId, b] of Object.entries(bindings)) {
		if (!paneIds.has(paneId)) continue
		if (b.sessionId && !sessionIds.has(b.sessionId)) continue
		// Fresh launch without a listed session yet — keep briefly.
		if (!b.sessionId && now - b.launchedAt > 5 * 60_000) continue
		next[paneId] = b
	}
	return next
}
