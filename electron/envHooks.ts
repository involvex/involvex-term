import type {GitStatus} from './types.js'

/** Opt-in agent/terminal context env for AI CLIs (OpenCode, etc.). */
export interface EnvHooksOptions {
	enabled: boolean
	includeGit: boolean
}

export interface EnvHooksInput {
	paneId: string
	cwd: string
	appVersion: string
	git?: GitStatus | null
	remoteUrl?: string | null
}

/** Compact JSON payload under INVOLVEX_TERM_CONTEXT (no newlines). */
export interface EnvHooksContext {
	v: 1
	program: 'involvex-term'
	version: string
	paneId: string
	cwd: string
	git: {
		root: string
		branch: string
		dirty: boolean
		ahead: number
		behind: number
		staged: number
		unstaged: number
		untracked: number
		stash: number
		remote: string | null
	} | null
}

const PROGRAM = 'involvex-term'

/**
 * Build shell-safe env vars injected into a new PTY when env hooks are enabled.
 * Empty object when disabled — callers merge onto the base spawn env.
 */
export function buildEnvHooks(
	opts: EnvHooksOptions,
	input: EnvHooksInput,
): Record<string, string> {
	if (!opts.enabled) return {}

	const version = input.appVersion.trim() || '0.0.0'
	const cwd = input.cwd
	const paneId = input.paneId

	const env: Record<string, string> = {
		TERM_PROGRAM: PROGRAM,
		TERM_PROGRAM_VERSION: version,
		INVOLVEX_TERM: '1',
		INVOLVEX_TERM_VERSION: version,
		INVOLVEX_TERM_PANE_ID: paneId,
		INVOLVEX_TERM_CWD: cwd,
	}

	let gitPayload: EnvHooksContext['git'] = null
	if (opts.includeGit && input.git?.repoRoot) {
		const g = input.git
		const remote =
			typeof input.remoteUrl === 'string' && input.remoteUrl.trim()
				? input.remoteUrl.trim()
				: null
		gitPayload = {
			root: g.repoRoot!,
			branch: g.branch || '',
			dirty: g.isDirty,
			ahead: g.ahead,
			behind: g.behind,
			staged: g.staged,
			unstaged: g.unstaged,
			untracked: g.untracked,
			stash: g.stashCount,
			remote,
		}
		env.INVOLVEX_TERM_GIT_ROOT = gitPayload.root
		env.INVOLVEX_TERM_GIT_BRANCH = gitPayload.branch
		env.INVOLVEX_TERM_GIT_DIRTY = gitPayload.dirty ? '1' : '0'
		env.INVOLVEX_TERM_GIT_AHEAD = String(gitPayload.ahead)
		env.INVOLVEX_TERM_GIT_BEHIND = String(gitPayload.behind)
		env.INVOLVEX_TERM_GIT_STAGED = String(gitPayload.staged)
		env.INVOLVEX_TERM_GIT_UNSTAGED = String(gitPayload.unstaged)
		env.INVOLVEX_TERM_GIT_UNTRACKED = String(gitPayload.untracked)
		env.INVOLVEX_TERM_GIT_STASH = String(gitPayload.stash)
		if (remote) env.INVOLVEX_TERM_GIT_REMOTE = remote
	}

	const context: EnvHooksContext = {
		v: 1,
		program: PROGRAM,
		version,
		paneId,
		cwd,
		git: gitPayload,
	}
	// Single-line JSON — safe in process env; agents parse as UTF-8 JSON.
	env.INVOLVEX_TERM_CONTEXT = JSON.stringify(context)
	return env
}
