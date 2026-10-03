import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import type * as Pty from 'node-pty'

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
