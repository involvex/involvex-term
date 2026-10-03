import fs from 'node:fs'
import path from 'node:path'
import {simpleGit} from 'simple-git'
import type {GitStatus} from './types.js'

const cache = new Map<string, {at: number; status: GitStatus}>()
/** Cache repo-root lookups: findRepoRoot does sync fs walks on every call. */
const repoRootCache = new Map<string, {at: number; root: string | null}>()
const REPO_ROOT_TTL_MS = 5000
const STATUS_TTL_MS = 1500

function cachedRepoRoot(dir: string): string | null | undefined {
	const hit = repoRootCache.get(dir)
	if (hit && Date.now() - hit.at < REPO_ROOT_TTL_MS) return hit.root
	return undefined
}

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

export interface GitStatusOptions {
	/** When true, also fetch stash count + ahead/behind (2 extra spawns). */
	details?: boolean
}

export async function getGitStatus(
	cwd: string,
	opts?: GitStatusOptions,
): Promise<GitStatus> {
	const wantDetails = opts?.details === true
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
	let root = cachedRepoRoot(dir)
	if (root === undefined) {
		root = findRepoRoot(dir)
		repoRootCache.set(dir, {at: Date.now(), root})
	}
	if (!root) return {...empty, cwd: dir}

	const cached = cache.get(root)
	// Details callers bypass the fast-path cache: it holds no stash /
	// ahead-behind, and returning it would silently drop them (this is
	// what getGitDetails relies on after its priming getGitStatus call).
	if (cached && !wantDetails && Date.now() - cached.at < STATUS_TTL_MS)
		return {...cached.status, cwd: dir}

	try {
		const git = simpleGit(root)
		// Fast path: a single `git status` spawn. Branch comes from
		// status.current — the old extra `revparse` spawn was redundant.
		// Stash + ahead/behind cost 2 more spawns; fetch them only when
		// the caller explicitly asked (footer menu open).
		const status = await git.status()
		let ahead = 0
		let behind = 0
		let stashCount = 0
		if (wantDetails) {
			const [stash, rev] = await Promise.all([
				git.stashList().catch(() => ({all: [] as unknown[]})),
				git
					.raw(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])
					.catch(() => ''),
			])
			stashCount = (stash?.all?.length ?? 0) as number
			try {
				const m = rev.trim().split(/\s+/).map(Number)
				if (m.length === 2 && m.every(n => Number.isFinite(n))) {
					behind = m[0] ?? 0
					ahead = m[1] ?? 0
				}
			} catch {
				/* no upstream */
			}
		}

		const staged = status.staged.length
		const unstaged =
			status.modified.length + status.deleted.length + status.conflicted.length
		const untracked = status.not_added.length
		const result: GitStatus = {
			cwd: dir,
			repoRoot: root,
			branch: status.current || '',
			isDirty: staged + unstaged + untracked > 0,
			staged,
			unstaged,
			untracked,
			ahead,
			behind,
			stashCount,
		}
		// Cache both fast and detailed results (TTL is 1.5s; ahead/behind
		// staleness is bounded by it either way).
		cache.set(root, {at: Date.now(), status: {...result}})
		return result
	} catch {
		return {...empty, cwd: dir, repoRoot: root}
	}
}

/**
 * Enrich a fast-path status with stash + ahead/behind for the footer menu.
 * Single choke point so the per-prompt hot path never pays for these.
 */
export async function getGitDetails(cwd: string): Promise<GitStatus> {
	const base = await getGitStatus(cwd)
	if (!base.repoRoot) return base
	try {
		const detailed = await getGitStatus(cwd, {details: true})
		return {...detailed, cwd: base.cwd}
	} catch {
		return base
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
		const hit = cachedRepoRoot(dir)
		if (hit !== undefined) return hit
		const root = findRepoRoot(dir)
		repoRootCache.set(dir, {at: Date.now(), root})
		return root
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
