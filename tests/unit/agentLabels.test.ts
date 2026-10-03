import {describe, expect, it} from 'bun:test'
import {
	pruneAgentBindings,
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
