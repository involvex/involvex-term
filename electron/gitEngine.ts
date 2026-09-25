import fs from 'node:fs'
import path from 'node:path'
import {simpleGit} from 'simple-git'
import type {GitStatus} from './types.js'

const cache = new Map<string, {at: number; status: GitStatus}>()

function findRepoRoot(start: string): string | null {
	let dir = start
	for (let i = 0; i < 12; i++) {
		try {
			if (fs.existsSync(path.join(dir, '.git'))) return dir
		} catch {
			/* noop */
		}
		const parent = path.dirname(dir)
		if (parent === dir) return null
		dir = parent
	}
	return null
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
	const empty: GitStatus = {
		cwd,
		repoRoot: null,
		branch: '',
		isDirty: false,
		staged: 0,
		unstaged: 0,
		untracked: 0,
		ahead: 0,
		behind: 0,
		stashCount: 0,
	}
	let dir = cwd
	try {
		if (!fs.existsSync(dir)) return empty
		const st = fs.statSync(dir)
		if (!st.isDirectory()) dir = path.dirname(dir)
	} catch {
		return empty
	}
	const root = findRepoRoot(dir)
	if (!root) return {...empty, cwd: dir}

	const cached = cache.get(root)
	if (cached && Date.now() - cached.at < 400)
		return {...cached.status, cwd: dir}

	try {
		const git = simpleGit(root)
		const [status, branch, stash] = await Promise.all([
			git.status(),
			git.revparse(['--abbrev-ref', 'HEAD']).catch(() => ''),
			git.stashList().catch(() => ({all: [] as unknown[]})),
		])
		let ahead = 0
		let behind = 0
		try {
			const rev = await git
				.raw(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
				.catch(() => '')
			const m = rev.trim().split(/\s+/).map(Number)
			if (m.length === 2 && m.every(n => Number.isFinite(n))) {
				behind = m[0] ?? 0
				ahead = m[1] ?? 0
			}
		} catch {
			/* no upstream */
		}

		const staged = status.staged.length
		const unstaged =
			status.modified.length + status.deleted.length + status.conflicted.length
		const untracked = status.not_added.length
		const result: GitStatus = {
			cwd: dir,
			repoRoot: root,
			branch:
				(typeof branch === 'string' ? branch : '').trim() ||
				status.current ||
				'',
			isDirty: staged + unstaged + untracked > 0,
			staged,
			unstaged,
			untracked,
			ahead,
			behind,
			stashCount: (stash?.all?.length ?? 0) as number,
		}
		cache.set(root, {at: Date.now(), status: result})
		return result
	} catch {
		return {...empty, cwd: dir, repoRoot: root}
	}
}

export function invalidateGitCache(repoRoot?: string): void {
	if (repoRoot) cache.delete(repoRoot)
	else cache.clear()
}
