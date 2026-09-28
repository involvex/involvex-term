/**
 * Pure tests for agent-aware pane label matching (no Electron).
 * Run: bun scripts/test-agent-labels.mjs
 */
import assert from 'node:assert/strict'

/** @typedef {{ id: string, title: string, directory: string, updated: number, created: number }} Session */

function normAgentPath(p) {
	return p.replace(/[/\\]+$/, '').toLowerCase()
}

function sessionMatchesCwd(directory, cwd) {
	if (!cwd || !directory) return false
	const cwdN = normAgentPath(cwd)
	const d = normAgentPath(directory)
	if (!cwdN || !d) return false
	return d === cwdN || cwdN.startsWith(d + '\\') || cwdN.startsWith(d + '/')
}

function sessionActivity(updated, now, activeMs = 120_000) {
	if (!updated || updated <= 0) return 'idle'
	return now - updated <= activeMs ? 'active' : 'idle'
}

function assignPaneAgentLabels({panes, sessions, bindings, agentLabel, now}) {
	const out = new Map()
	const claimed = new Set()
	const sorted = [...sessions].sort((a, b) => b.updated - a.updated)
	const put = (paneId, s, bound, label) => {
		if (claimed.has(s.id) || out.has(paneId)) return
		claimed.add(s.id)
		out.set(paneId, {
			paneId,
			sessionId: s.id,
			title: s.title || '(untitled)',
			activity: sessionActivity(s.updated, now),
			directory: s.directory,
			agentLabel: label,
			bound,
		})
	}
	const newestMatching = cwd => {
		let best
		for (const s of sorted) {
			if (claimed.has(s.id)) continue
			if (!sessionMatchesCwd(s.directory, cwd)) continue
			if (!best || s.updated > best.updated) best = s
		}
		return best
	}
	for (const pane of panes) {
		const b = bindings[pane.paneId]
		if (!b?.sessionId) continue
		const s = sorted.find(x => x.id === b.sessionId)
		if (s) put(pane.paneId, s, true, b.agentLabel || agentLabel)
	}
	for (const pane of panes) {
		if (out.has(pane.paneId)) continue
		const b = bindings[pane.paneId]
		if (!b) continue
		const s = newestMatching(pane.cwd)
		if (s) put(pane.paneId, s, true, b.agentLabel || agentLabel)
	}
	for (const pane of panes) {
		if (out.has(pane.paneId)) continue
		const s = newestMatching(pane.cwd)
		if (s) put(pane.paneId, s, false, agentLabel)
	}
	return out
}

const now = 1_000_000
/** @type {Session[]} */
const sessions = [
	{
		id: 's1',
		title: 'Fix tabs',
		directory: 'C:\\repos\\app',
		updated: now - 10_000,
		created: now - 100_000,
	},
	{
		id: 's2',
		title: 'Old work',
		directory: 'C:\\repos\\other',
		updated: now - 400_000,
		created: now - 500_000,
	},
]

{
	const assigned = assignPaneAgentLabels({
		panes: [
			{paneId: 'p1', cwd: 'C:\\repos\\app'},
			{paneId: 'p2', cwd: 'C:\\repos\\other'},
			{paneId: 'p3', cwd: 'C:\\tmp'},
		],
		sessions,
		bindings: {},
		agentLabel: 'OC',
		now,
	})
	assert.equal(assigned.get('p1')?.title, 'Fix tabs')
	assert.equal(assigned.get('p1')?.activity, 'active')
	assert.equal(assigned.get('p2')?.title, 'Old work')
	assert.equal(assigned.get('p2')?.activity, 'idle')
	assert.equal(assigned.has('p3'), false)
}

{
	const assigned = assignPaneAgentLabels({
		panes: [
			{paneId: 'p1', cwd: 'C:\\repos\\app'},
			{paneId: 'p2', cwd: 'C:\\repos\\app'},
		],
		sessions,
		bindings: {
			p2: {
				sessionId: 's1',
				agentLabel: 'OC',
				agentName: 'OpenCode',
				launchedAt: now,
			},
		},
		agentLabel: 'OC',
		now,
	})
	assert.equal(assigned.get('p2')?.sessionId, 's1')
	assert.equal(assigned.get('p2')?.bound, true)
	// One session → only the bound pane claims it.
	assert.equal(assigned.has('p1'), false)
}

{
	const assigned = assignPaneAgentLabels({
		panes: [{paneId: 'p1', cwd: 'C:\\repos\\app\\src'}],
		sessions,
		bindings: {},
		agentLabel: 'OC',
		now,
	})
	assert.equal(assigned.get('p1')?.sessionId, 's1', 'nested cwd matches')
}

console.log('test-agent-labels: ok')
