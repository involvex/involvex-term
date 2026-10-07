import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import type * as Pty from 'node-pty'
import path from 'node:path'

// ptyManager reads os.homedir() at call time (not import time), but resolveSpawnCwd
// still touches the real filesystem, so keep every spawn pointed at a real dir.
const cwd = process.cwd()

interface FakePty {
	spawned: number
	killed: number
}

let fake: FakePty

function makeFakeModule(): typeof Pty {
	const mod = {
		spawn(): Pty.IPty {
			fake.spawned++
			return {
				pid: fake.spawned,
				kill() {
					fake.killed++
				},
				onData() {
					return {dispose() {}}
				},
				onExit() {
					return {dispose() {}}
				},
			} as unknown as Pty.IPty
		},
	}
	return mod as unknown as typeof Pty
}

const {
	forgetPty,
	getPty,
	killAllPtys,
	killPty,
	ptyIds,
	setPtyModule,
	spawnPty,
} = await import('../../electron/ptyManager.ts')

describe('ptyManager pane-id reuse', () => {
	beforeEach(() => {
		fake = {spawned: 0, killed: 0}
		setPtyModule(makeFakeModule())
	})

	afterEach(() => {
		for (const id of ptyIds()) killPty(id)
		setPtyModule(null)
	})

	it('kills the previous pty when a pane id is re-spawned', () => {
		const first = spawnPty('pane-1', cwd, 80, 24)
		expect(fake.killed).toBe(0)

		const second = spawnPty('pane-1', cwd, 80, 24)

		// The predecessor must be terminated, not silently overwritten.
		expect(fake.spawned).toBe(2)
		expect(fake.killed).toBe(1)
		// Exactly one live entry, and it is the replacement.
		expect(ptyIds()).toEqual(['pane-1'])
		expect(getPty('pane-1')).toBe(second)
		expect(getPty('pane-1')).not.toBe(first)
	})

	it('keeps distinct pane ids independent', () => {
		spawnPty('pane-a', cwd, 80, 24)
		spawnPty('pane-b', cwd, 80, 24)

		expect(fake.killed).toBe(0)
		expect(ptyIds().sort()).toEqual(['pane-a', 'pane-b'])
	})

	it('leaves the existing pty running when the replacement fails to spawn', () => {
		spawnPty('pane-1', cwd, 80, 24)
		const original = getPty('pane-1')

		setPtyModule({
			spawn() {
				throw new Error('spawn failed')
			},
		} as unknown as typeof Pty)
		expect(() => spawnPty('pane-1', cwd, 80, 24)).toThrow('spawn failed')

		// A failed spawn must not take the working shell down with it.
		expect(fake.killed).toBe(0)
		expect(getPty('pane-1')).toBe(original)
	})

	it('killPty is idempotent', () => {
		spawnPty('pane-1', cwd, 80, 24)
		killPty('pane-1')
		killPty('pane-1')

		expect(fake.killed).toBe(1)
		expect(ptyIds()).toEqual([])
	})

	it('forgetPty drops a naturally-exited entry without signalling it', () => {
		spawnPty('pane-1', cwd, 80, 24)
		forgetPty('pane-1')

		// The process is already gone, so kill() must not be attempted.
		expect(fake.killed).toBe(0)
		expect(getPty('pane-1')).toBeUndefined()
		expect(ptyIds()).toEqual([])
	})

	it('forgetPty on an unknown id is a no-op', () => {
		expect(() => forgetPty('nope')).not.toThrow()
		expect(ptyIds()).toEqual([])
	})

	it('killAllPtys terminates every live pty', () => {
		spawnPty('pane-a', cwd, 80, 24)
		spawnPty('pane-b', cwd, 80, 24)
		spawnPty('pane-c', cwd, 80, 24)

		killAllPtys()

		expect(fake.killed).toBe(3)
		expect(ptyIds()).toEqual([])
	})

	it('killAllPtys with nothing live does not throw', () => {
		expect(() => killAllPtys()).not.toThrow()
		expect(fake.killed).toBe(0)
	})
})

describe('spawnPty profile availability', () => {
	beforeEach(() => {
		fake = {spawned: 0, killed: 0}
		setPtyModule(makeFakeModule())
	})

	afterEach(() => {
		for (const id of ptyIds()) killPty(id)
		setPtyModule(null)
	})

	// A real, existing shell, by ABSOLUTE path: resolveProfile's `available`
	// is fs.existsSync, which resolves a bare name like "cmd.exe" against the
	// process cwd rather than PATH, so a bare name would read as missing and
	// leave the fallback with nothing to fall back to.
	const REAL =
		process.platform === 'win32'
			? path.join(
					process.env.SystemRoot ?? 'C:\\Windows',
					'System32',
					'cmd.exe',
				)
			: '/bin/sh'

	it('falls back when the chosen profile points at a missing binary', () => {
		// The regression: resolveProfile computes `available` and nothing read
		// it, so a stale or hand-edited profile spawned a nonexistent path and
		// surfaced as a dead pane with no explanation.
		const entry = spawnPty('pane-missing', cwd, 80, 24, {
			profileId: 'gone',
			profiles: [
				{id: 'gone', name: 'Gone', kind: 'custom', command: '/nope/not-here'},
				{id: 'ok', name: 'Ok', kind: 'custom', command: REAL},
			],
			defaultProfileId: 'gone',
		})

		expect(entry.shell).toBe(REAL)
	})

	it('prefers the requested profile when it does resolve', () => {
		const entry = spawnPty('pane-ok', cwd, 80, 24, {
			profileId: 'ok',
			profiles: [
				{id: 'gone', name: 'Gone', kind: 'custom', command: '/nope/not-here'},
				{id: 'ok', name: 'Ok', kind: 'custom', command: REAL},
			],
			defaultProfileId: 'gone',
		})

		expect(entry.shell).toBe(REAL)
	})

	it('does not touch the profile list when everything resolves', () => {
		// Regression guard on the fallback itself: resolving twice must not
		// change which shell wins.
		const entry = spawnPty('pane-first', cwd, 80, 24, {
			profileId: 'ok',
			profiles: [
				{id: 'ok', name: 'Ok', kind: 'custom', command: REAL},
				{id: 'ok2', name: 'Ok2', kind: 'custom', command: REAL},
			],
			defaultProfileId: 'ok',
		})

		expect(entry.shell).toBe(REAL)
		expect(fake.spawned).toBe(1)
	})
})

describe('ptyManager live-pty budget', () => {
	beforeEach(() => {
		fake = {spawned: 0, killed: 0}
		setPtyModule(makeFakeModule())
	})

	afterEach(() => {
		for (const id of ptyIds()) killPty(id)
		setPtyModule(null)
	})

	it('refuses brand-new ids once the budget is exhausted', async () => {
		const {MAX_LIVE_PTYS, ptyCount} =
			await import('../../electron/ptyManager.ts')
		expect(MAX_LIVE_PTYS).toBeGreaterThan(0)
		for (let i = 0; i < MAX_LIVE_PTYS; i++) {
			spawnPty(`pane-budget-${i}`, cwd, 80, 24)
		}
		expect(ptyCount()).toBe(MAX_LIVE_PTYS)
		expect(() => spawnPty('pane-over-budget', cwd, 80, 24)).toThrow(
			/Too many shells open/,
		)
		// The rejected spawn must not register a half-entry.
		expect(ptyCount()).toBe(MAX_LIVE_PTYS)
	})

	it('lets a pane id re-spawn even at the budget ceiling', async () => {
		const {MAX_LIVE_PTYS} = await import('../../electron/ptyManager.ts')
		for (let i = 0; i < MAX_LIVE_PTYS; i++) {
			spawnPty(`pane-reuse-${i}`, cwd, 80, 24)
		}
		// Reload/session-restore reuses ids; that must keep working when full.
		expect(() => spawnPty('pane-reuse-0', cwd, 80, 24)).not.toThrow()
	})

	it('frees budget on kill so new panes can spawn again', async () => {
		const {MAX_LIVE_PTYS, ptyCount} =
			await import('../../electron/ptyManager.ts')
		for (let i = 0; i < MAX_LIVE_PTYS; i++) {
			spawnPty(`pane-free-${i}`, cwd, 80, 24)
		}
		killPty('pane-free-0')
		expect(ptyCount()).toBe(MAX_LIVE_PTYS - 1)
		expect(() => spawnPty('pane-freed-slot', cwd, 80, 24)).not.toThrow()
	})
})
