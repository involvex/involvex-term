/**
 * Smoke-test buildEnvHooks (no Electron). Run: bun scripts/test-env-hooks.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

const {buildEnvHooks} = await import(
	path.join(root, '..', 'electron', 'envHooks.ts')
)

const off = buildEnvHooks(
	{enabled: false, includeGit: true},
	{paneId: 'p1', cwd: 'C:\\repo', appVersion: '0.6.0'},
)
assert.deepEqual(off, {}, 'disabled → empty env')

const base = buildEnvHooks(
	{enabled: true, includeGit: false},
	{paneId: 'pane-42', cwd: 'D:\\work\\app', appVersion: '0.6.0'},
)
assert.equal(base.TERM_PROGRAM, 'involvex-term')
assert.equal(base.TERM_PROGRAM_VERSION, '0.6.0')
assert.equal(base.INVOLVEX_TERM, '1')
assert.equal(base.INVOLVEX_TERM_PANE_ID, 'pane-42')
assert.equal(base.INVOLVEX_TERM_CWD, 'D:\\work\\app')
assert.equal(base.INVOLVEX_TERM_GIT_BRANCH, undefined)
const ctx = JSON.parse(base.INVOLVEX_TERM_CONTEXT)
assert.equal(ctx.v, 1)
assert.equal(ctx.git, null)
assert.equal(ctx.paneId, 'pane-42')

const withGit = buildEnvHooks(
	{enabled: true, includeGit: true},
	{
		paneId: 'p2',
		cwd: 'D:\\work\\app',
		appVersion: '1.2.3',
		git: {
			cwd: 'D:\\work\\app',
			repoRoot: 'D:\\work\\app',
			branch: 'main',
			isDirty: true,
			staged: 1,
			unstaged: 2,
			untracked: 3,
			ahead: 4,
			behind: 5,
			stashCount: 6,
		},
		remoteUrl: 'https://github.com/involvex/involvex-term.git',
	},
)
assert.equal(withGit.INVOLVEX_TERM_GIT_BRANCH, 'main')
assert.equal(withGit.INVOLVEX_TERM_GIT_DIRTY, '1')
assert.equal(withGit.INVOLVEX_TERM_GIT_AHEAD, '4')
assert.equal(withGit.INVOLVEX_TERM_GIT_BEHIND, '5')
assert.equal(
	withGit.INVOLVEX_TERM_GIT_REMOTE,
	'https://github.com/involvex/involvex-term.git',
)
const gctx = JSON.parse(withGit.INVOLVEX_TERM_CONTEXT)
assert.equal(gctx.git.branch, 'main')
assert.equal(gctx.git.dirty, true)
assert.equal(gctx.git.remote, 'https://github.com/involvex/involvex-term.git')

const noRepo = buildEnvHooks(
	{enabled: true, includeGit: true},
	{
		paneId: 'p3',
		cwd: 'C:\\tmp',
		appVersion: '0.1.0',
		git: {
			cwd: 'C:\\tmp',
			repoRoot: null,
			branch: '',
			isDirty: false,
			staged: 0,
			unstaged: 0,
			untracked: 0,
			ahead: 0,
			behind: 0,
			stashCount: 0,
		},
	},
)
assert.equal(noRepo.INVOLVEX_TERM_GIT_ROOT, undefined)
assert.equal(JSON.parse(noRepo.INVOLVEX_TERM_CONTEXT).git, null)

const {SettingsSchema} = await import(
	path.join(root, '..', 'electron', 'settingsStore.ts')
)
const parsed = SettingsSchema.parse({
	agent: {activeId: 'opencode', tools: []},
})
assert.equal(parsed.agent.envHooks.enabled, false)
assert.equal(parsed.agent.envHooks.includeGit, true)

console.log('test-env-hooks: ok')
