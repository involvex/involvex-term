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

export interface BranchList {
	current: string
	local: string[]
	remote: string[]
}

function resolveRepo(cwd: string): string | null {
	try {
		if (!fs.existsSync(cwd)) return null
		const st = fs.statSync(cwd)
		const dir = st.isDirectory() ? cwd : path.dirname(cwd)
		return findRepoRoot(dir)
	} catch {
		return null
	}
}

export async function listBranches(cwd: string): Promise<BranchList> {
	const root = resolveRepo(cwd)
	if (!root) return {current: '', local: [], remote: []}
	try {
		const git = simpleGit(root)
		const summary = await git.branch(['-a', '--no-color'])
		const current = summary.current || ''
		const local: string[] = []
		const remote: string[] = []
		for (const name of Object.keys(summary.branches)) {
			if (name === 'HEAD' || name.includes('HEAD')) continue
			if (name.startsWith('remotes/')) {
				const short = name.replace(/^remotes\//, '')
				// skip remote HEAD pointers
				if (short.endsWith('/HEAD') || short.includes('/HEAD')) continue
				remote.push(short)
			} else {
				local.push(name)
			}
		}
		local.sort((a, b) => a.localeCompare(b))
		remote.sort((a, b) => a.localeCompare(b))
		return {current, local, remote}
	} catch {
		return {current: '', local: [], remote: []}
	}
}

export async function checkoutBranch(
	cwd: string,
	branch: string,
): Promise<{ok: boolean; error?: string; branch?: string}> {
	const root = resolveRepo(cwd)
	if (!root) return {ok: false, error: 'Not a git repository'}
	let ref = branch.trim().replace(/^remotes\//, '')
	if (!ref) return {ok: false, error: 'Empty branch'}
	try {
		const git = simpleGit(root)
		const locals = await git.branchLocal()
		// origin/feature → create local tracking branch when missing
		if (ref.includes('/') && !locals.branches[ref]) {
			const slash = ref.indexOf('/')
			const remote = ref.slice(0, slash)
			const name = ref.slice(slash + 1)
			if (name && !locals.branches[name]) {
				await git.checkout(['-b', name, '--track', `${remote}/${name}`])
				invalidateGitCache(root)
				return {ok: true, branch: name}
			}
			if (name && locals.branches[name]) ref = name
		}
		await git.checkout(ref)
		invalidateGitCache(root)
		return {ok: true, branch: ref}
	} catch (e) {
		return {ok: false, error: e instanceof Error ? e.message : String(e)}
	}
}

export async function getRemoteUrl(
	cwd: string,
	remote = 'origin',
): Promise<string | null> {
	const root = resolveRepo(cwd)
	if (!root) return null
	try {
		const git = simpleGit(root)
		const raw = await git.remote(['get-url', remote])
		const url = typeof raw === 'string' ? raw.trim() : ''
		return url || null
	} catch {
		try {
			const git = simpleGit(root)
			const remotes = await git.getRemotes(true)
			const hit =
				remotes.find(r => r.name === remote) ??
				remotes.find(r => r.name === 'origin') ??
				remotes[0]
			return hit?.refs?.fetch || hit?.refs?.push || null
		} catch {
			return null
		}
	}
}
