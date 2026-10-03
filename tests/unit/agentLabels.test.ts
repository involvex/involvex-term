import {describe, expect, it} from 'bun:test'
import {
	pruneAgentBindings,
	samePaneAgent,
	samePaneAgents,
	type PaneAgentInfo,
	type PaneLaunchBinding,
} from '../../src/lib/agentLabels.ts'
import type {OpencodeSession} from '../../src/types.ts'

const NOW = 1_000_000

function session(id: string): OpencodeSession {
	return {id, title: id, directory: 'C:\\repo', updated: NOW, created: NOW}
}

function binding(over: Partial<PaneLaunchBinding> = {}): PaneLaunchBinding {
	return {
		agentLabel: 'OC',
		agentName: 'OpenCode',
		launchedAt: NOW,
		...over,
	}
}

describe('pruneAgentBindings truncated vs complete lists', () => {
	it('drops id-bound sessions missing from a complete list', () => {
		const bindings = {p1: binding({sessionId: 'gone'})}
		const out = pruneAgentBindings(
			bindings,
			new Set(['p1']),
			[session('other')],
			NOW,
			false,
		)
		expect(out).toEqual({})
	})

	it('keeps id-bound sessions missing from a truncated list', () => {
		const bindings = {p1: binding({sessionId: 'old'})}
		const out = pruneAgentBindings(
			bindings,
			new Set(['p1']),
			[session('recent')],
			NOW,
			true,
		)
		expect(out).toEqual(bindings)
	})

	it('keeps id-bound sessions present in either list', () => {
		const bindings = {p1: binding({sessionId: 's1'})}
		for (const truncated of [false, true]) {
			const out = pruneAgentBindings(
				bindings,
				new Set(['p1']),
				[session('s1')],
				NOW,
				truncated,
			)
			expect(out).toEqual(bindings)
		}
	})

	it('drops bindings whose pane no longer exists in both modes', () => {
		const bindings = {p1: binding({sessionId: 's1'})}
		for (const truncated of [false, true]) {
			const out = pruneAgentBindings(
				bindings,
				new Set(['other-pane']),
				[session('s1')],
				NOW,
				truncated,
			)
			expect(out).toEqual({})
		}
	})

	it('keeps fresh launches without a session id, drops stale ones', () => {
		const fresh = {p1: binding({launchedAt: NOW - 60_000})}
		const stale = {p1: binding({launchedAt: NOW - 6 * 60_000})}
		for (const truncated of [false, true]) {
			expect(
				pruneAgentBindings(fresh, new Set(['p1']), [], NOW, truncated),
			).toEqual(fresh)
			expect(
				pruneAgentBindings(stale, new Set(['p1']), [], NOW, truncated),
			).toEqual({})
		}
	})
})

function info(over: Partial<PaneAgentInfo> = {}): PaneAgentInfo {
	return {
		paneId: 'p1',
		sessionId: 's1',
		title: 'Fix the thing',
		activity: 'active',
		directory: 'C:\\repo',
		agentLabel: 'OC',
		bound: false,
		...over,
	}
}

describe('samePaneAgent', () => {
	it('treats a fresh object with identical fields as equal', () => {
		// This is the poll-tick no-op the App guard relies on.
		expect(samePaneAgent(info(), info())).toBe(true)
	})

	it('detects each field independently', () => {
		const base = info()
		for (const over of [
			{paneId: 'other'},
			{sessionId: 'other'},
			{title: 'other'},
			{activity: 'idle' as const},
			{directory: 'C:\\elsewhere'},
			{agentLabel: 'XX'},
			{bound: true},
		]) {
			expect(samePaneAgent(base, info(over))).toBe(false)
		}
	})

	it('treats a missing side as unequal', () => {
		expect(samePaneAgent(info(), undefined)).toBe(false)
		expect(samePaneAgent(undefined, info())).toBe(false)
		expect(samePaneAgent(undefined, undefined)).toBe(true)
	})
})

describe('samePaneAgents', () => {
	it('treats an identical rebuild as equal', () => {
		expect(samePaneAgents({p1: info()}, {p1: info()})).toBe(true)
	})

	it('treats two empty maps as equal', () => {
		expect(samePaneAgents({}, {})).toBe(true)
	})

	it('detects a changed field on one pane', () => {
		expect(samePaneAgents({p1: info()}, {p1: info({title: 'new'})})).toBe(false)
	})

	it('detects an activity flip on an otherwise identical session', () => {
		// activity is derived from `now`, so it changes with time alone.
		expect(samePaneAgents({p1: info()}, {p1: info({activity: 'idle'})})).toBe(
			false,
		)
	})

	it('detects an added pane', () => {
		expect(
			samePaneAgents({p1: info()}, {p1: info(), p2: info({paneId: 'p2'})}),
		).toBe(false)
	})

	it('detects a removed pane', () => {
		expect(
			samePaneAgents({p1: info(), p2: info({paneId: 'p2'})}, {p1: info()}),
		).toBe(false)
	})

	it('detects a swapped session under the same pane', () => {
		expect(
			samePaneAgents(
				{p1: info()},
				{p1: info({sessionId: 's2', title: 'other'})},
			),
		).toBe(false)
	})
})
