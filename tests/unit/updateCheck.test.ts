import {afterEach, describe, expect, test} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	UPDATE_CHECK_INTERVAL_MS,
	formatNudge,
	isCacheFresh,
	isNewer,
	maybeNotifyUpdate,
	readUpdateCache,
	refreshUpdateCache,
	writeUpdateCache,
} from '../../packages/cli/src/updateCheck'

let dirs: string[] = []

function tmpDir(): string {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-update-'))
	dirs.push(d)
	return d
}

afterEach(() => {
	for (const d of dirs) fs.rmSync(d, {recursive: true, force: true})
	dirs = []
})

const baseEnv = {}

describe('isNewer (moved, behavior preserved)', () => {
	test('newer tag wins, equal/older loses, unknown current always updates', () => {
		expect(isNewer('v0.8.1', 'v0.8.0')).toBe(true)
		expect(isNewer('v0.8.1', 'v0.8.1')).toBe(false)
		expect(isNewer('v0.8.0', 'v0.8.1')).toBe(false)
		expect(isNewer('v0.8.1', undefined)).toBe(true)
		expect(isNewer('v0.9.0', 'v0.8.9')).toBe(true)
	})
})

describe('update cache', () => {
	test('missing/corrupt cache reads as null, round-trips when valid', () => {
		const dir = tmpDir()
		expect(readUpdateCache(dir)).toBe(null)
		fs.writeFileSync(path.join(dir, 'update-check.json'), '{nope')
		expect(readUpdateCache(dir)).toBe(null)
		writeUpdateCache({checkedAt: 123, tag: 'v0.8.1'}, dir)
		expect(readUpdateCache(dir)).toEqual({checkedAt: 123, tag: 'v0.8.1'})
	})

	test('freshness follows the daily interval', () => {
		const now = 1_000_000_000
		expect(isCacheFresh(null, now)).toBe(false)
		expect(isCacheFresh({checkedAt: now - 1, tag: null}, now)).toBe(true)
		expect(
			isCacheFresh({checkedAt: now - UPDATE_CHECK_INTERVAL_MS, tag: null}, now),
		).toBe(false)
	})

	test('refresh writes the fetched tag; failures still bump checkedAt', async () => {
		const dir = tmpDir()
		await refreshUpdateCache(dir, 500, {
			fetchLatest: async () => ({
				tag: 'v0.9.0',
				name: 'app.AppImage',
				url: 'https://example.invalid/x',
			}),
		})
		expect(readUpdateCache(dir)).toEqual({checkedAt: 500, tag: 'v0.9.0'})
		await refreshUpdateCache(dir, 600, {
			fetchLatest: async () => {
				throw new Error('offline')
			},
		})
		expect(readUpdateCache(dir)).toEqual({checkedAt: 600, tag: null})
	})
})

describe('maybeNotifyUpdate', () => {
	test('nudges once per fresh cache on TTY and kicks no refresh', async () => {
		const dir = tmpDir()
		writeUpdateCache({checkedAt: 1000, tag: 'v0.9.0'}, dir)
		const nudges: string[] = []
		let kicks = 0
		await maybeNotifyUpdate({
			configDir: dir,
			currentVersion: 'v0.8.1',
			env: baseEnv,
			argv: [],
			isTTY: true,
			now: 1000 + 60_000,
			deps: {
				onNudge: m => nudges.push(m),
				kick: () => kicks++,
			},
		})
		expect(nudges).toHaveLength(1)
		expect(nudges[0]).toContain('v0.9.0')
		expect(nudges[0]).toContain('involvex-term upgrade')
		expect(kicks).toBe(0)
	})

	test('stays silent when up to date but still refreshes when stale', async () => {
		const dir = tmpDir()
		writeUpdateCache({checkedAt: 0, tag: 'v0.8.1'}, dir)
		const nudges: string[] = []
		let kicks = 0
		await maybeNotifyUpdate({
			configDir: dir,
			currentVersion: 'v0.8.1',
			env: baseEnv,
			argv: [],
			isTTY: true,
			now: UPDATE_CHECK_INTERVAL_MS + 1,
			deps: {
				onNudge: m => nudges.push(m),
				kick: () => kicks++,
			},
		})
		expect(nudges).toHaveLength(0)
		expect(kicks).toBe(1)
	})

	test('stale cache with newer tag nudges and refreshes', async () => {
		const dir = tmpDir()
		const nudges: string[] = []
		let kicks = 0
		await maybeNotifyUpdate({
			configDir: dir,
			currentVersion: 'v0.8.1',
			env: baseEnv,
			argv: [],
			isTTY: true,
			now: UPDATE_CHECK_INTERVAL_MS + 1,
			deps: {
				fetchLatest: async () => ({
					tag: 'v0.9.0',
					name: 'app.AppImage',
					url: 'https://example.invalid/x',
				}),
				onNudge: m => nudges.push(m),
				kick: () => kicks++,
			},
		})
		// No cache yet: nothing to nudge with, but a refresh is kicked.
		expect(nudges).toHaveLength(0)
		expect(kicks).toBe(1)
	})

	test('non-TTY suppresses the message but still refreshes', async () => {
		const dir = tmpDir()
		writeUpdateCache({checkedAt: 0, tag: 'v0.9.0'}, dir)
		const nudges: string[] = []
		let kicks = 0
		await maybeNotifyUpdate({
			configDir: dir,
			currentVersion: 'v0.8.1',
			env: baseEnv,
			argv: [],
			isTTY: false,
			now: UPDATE_CHECK_INTERVAL_MS + 1,
			deps: {
				onNudge: m => nudges.push(m),
				kick: () => kicks++,
			},
		})
		expect(nudges).toHaveLength(0)
		expect(kicks).toBe(1)
	})

	test('opt-outs skip everything', async () => {
		for (const opts of [
			{env: {...baseEnv, NO_UPDATE_NOTIFIER: '1'}, argv: [] as string[]},
			{env: {...baseEnv, CI: 'true'}, argv: [] as string[]},
			{env: baseEnv, argv: ['sp', '--no-update-notifier']},
		]) {
			const dir = tmpDir()
			const nudges: string[] = []
			let kicks = 0
			await maybeNotifyUpdate({
				configDir: dir,
				currentVersion: 'v0.8.1',
				env: opts.env,
				argv: opts.argv,
				isTTY: true,
				now: UPDATE_CHECK_INTERVAL_MS + 1,
				deps: {
					onNudge: m => nudges.push(m),
					kick: () => kicks++,
				},
			})
			expect(nudges).toHaveLength(0)
			expect(kicks).toBe(0)
		}
	})
})

describe('formatNudge', () => {
	test('names the tag, current version, and upgrade command', () => {
		expect(formatNudge('v0.9.0', 'v0.8.1')).toBe(
			`Update available: v0.9.0 (current v0.8.1) — run 'involvex-term upgrade'.`,
		)
		expect(formatNudge('v0.9.0', undefined)).toContain('unknown')
	})
})
