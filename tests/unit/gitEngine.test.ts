import {afterEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
	getRemoteUrl,
	invalidateGitCache,
	parseNameStatus,
	parseOnelineLog,
	REMOTE_URL_TTL_MS,
} from '../../electron/gitEngine.ts'

describe('parseOnelineLog (FEAT-016)', () => {
	it('parses hash and subject', () => {
		const raw =
			'753052f Merge pull request #57 from involvex/feat/focus-trap-tests\n' +
			'537b9c3 fix: silence unused sel in focusTrap test stub\n'
		expect(parseOnelineLog(raw)).toEqual([
			{
				hash: '753052f',
				subject: 'Merge pull request #57 from involvex/feat/focus-trap-tests',
			},
			{
				hash: '537b9c3',
				subject: 'fix: silence unused sel in focusTrap test stub',
			},
		])
	})

	it('skips blank lines and non-oneline noise', () => {
		expect(parseOnelineLog('\n\nnot a commit\n')).toEqual([])
	})

	it('keeps subjects with spaces and punctuation', () => {
		expect(parseOnelineLog('abc1234 feat: foo (bar) — baz\n')).toEqual([
			{hash: 'abc1234', subject: 'feat: foo (bar) — baz'},
		])
	})
})

describe('parseNameStatus', () => {
	it('parses modified and added paths', () => {
		const raw = 'M\tsrc/App.tsx\nA\tREADME.md\n'
		const entries = parseNameStatus(raw, 'staged')
		expect(entries).toEqual([
			{path: 'src/App.tsx', status: 'M', kind: 'staged'},
			{path: 'README.md', status: 'A', kind: 'staged'},
		])
	})

	it('uses the new path for renames', () => {
		const raw = 'R100\told/name.ts\tnew/name.ts\n'
		const entries = parseNameStatus(raw, 'unstaged')
		expect(entries).toEqual([
			{path: 'new/name.ts', status: 'R', kind: 'unstaged'},
		])
	})

	it('skips blank lines', () => {
		expect(parseNameStatus('\n\n', 'staged')).toEqual([])
	})
})

describe('getRemoteUrl cache (FEAT-019)', () => {
	const roots: string[] = []

	function fakeRepo(): string {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-term-git-'))
		fs.mkdirSync(path.join(root, '.git'))
		roots.push(root)
		return root
	}

	afterEach(() => {
		invalidateGitCache()
		for (const root of roots.splice(0)) {
			fs.rmSync(root, {recursive: true, force: true})
		}
	})

	it('avoids a second lookup within the TTL', async () => {
		const root = fakeRepo()
		let calls = 0
		const lookup = async () => {
			calls += 1
			return 'https://example.com/repo.git'
		}
		const t0 = 1_000_000
		const a = await getRemoteUrl(root, 'origin', {
			lookup,
			now: () => t0,
		})
		const b = await getRemoteUrl(root, 'origin', {
			lookup,
			now: () => t0 + REMOTE_URL_TTL_MS - 1,
		})
		expect(a).toBe('https://example.com/repo.git')
		expect(b).toBe(a)
		expect(calls).toBe(1)
	})

	it('re-fetches after the TTL expires', async () => {
		const root = fakeRepo()
		let calls = 0
		const lookup = async () => {
			calls += 1
			return `https://example.com/r${calls}.git`
		}
		const t0 = 2_000_000
		await getRemoteUrl(root, 'origin', {lookup, now: () => t0})
		const next = await getRemoteUrl(root, 'origin', {
			lookup,
			now: () => t0 + REMOTE_URL_TTL_MS + 1,
		})
		expect(calls).toBe(2)
		expect(next).toBe('https://example.com/r2.git')
	})

	it('invalidates on git action cache clear', async () => {
		const root = fakeRepo()
		let calls = 0
		const lookup = async () => {
			calls += 1
			return 'https://example.com/repo.git'
		}
		const t0 = 3_000_000
		await getRemoteUrl(root, 'origin', {lookup, now: () => t0})
		invalidateGitCache(root)
		await getRemoteUrl(root, 'origin', {lookup, now: () => t0})
		expect(calls).toBe(2)
	})

	it('caches per remote name independently', async () => {
		const root = fakeRepo()
		const seen: string[] = []
		const lookup = async (_root: string, remote: string) => {
			seen.push(remote)
			return `https://example.com/${remote}.git`
		}
		const t0 = 4_000_000
		await getRemoteUrl(root, 'origin', {lookup, now: () => t0})
		await getRemoteUrl(root, 'upstream', {lookup, now: () => t0})
		await getRemoteUrl(root, 'origin', {lookup, now: () => t0})
		expect(seen).toEqual(['origin', 'upstream'])
	})
})
