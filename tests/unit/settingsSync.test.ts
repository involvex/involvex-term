import {afterEach, describe, expect, it} from 'bun:test'
import {
	GithubApiError,
	githubErrorMessage,
	hasExplicitClientId,
	validateToken,
	type SyncState,
} from '../../electron/settingsSync.ts'

const realFetch = globalThis.fetch
const realClientIdEnv = process.env.INVOLVEX_GITHUB_CLIENT_ID

afterEach(() => {
	globalThis.fetch = realFetch
	if (realClientIdEnv === undefined)
		delete process.env.INVOLVEX_GITHUB_CLIENT_ID
	else process.env.INVOLVEX_GITHUB_CLIENT_ID = realClientIdEnv
})

function syncState(over: Partial<SyncState> = {}): SyncState {
	return {localUpdatedAt: 0, ...over}
}

describe('githubErrorMessage', () => {
	it('maps 401 Bad credentials to a re-login action', () => {
		const msg = githubErrorMessage(401, 'Bad credentials', 'update gist')
		expect(msg).toContain('Bad credentials')
		expect(msg).toContain('update gist')
		expect(msg).toContain('Unlink and Sign in again')
	})

	it('maps 404 on gist reads to a recreate hint', () => {
		const msg = githubErrorMessage(404, 'Not Found', 'read gist')
		expect(msg).toContain('deleted')
		expect(msg).toContain('Push again')
	})

	it('keeps status context for other failures', () => {
		const msg = githubErrorMessage(422, 'Validation Failed', 'create gist')
		expect(msg).toContain('HTTP 422')
		expect(msg).toContain('create gist')
	})
})

describe('GithubApiError', () => {
	it('carries status and operation', () => {
		const err = new GithubApiError('nope', 'update gist', 401)
		expect(err.status).toBe(401)
		expect(err.operation).toBe('update gist')
		expect(err).toBeInstanceOf(Error)
	})
})

describe('validateToken', () => {
	it('reports valid with the GitHub login', async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({login: 'involvex'}), {status: 200})) as never
		const result = await validateToken('good-token')
		expect(result.state).toBe('valid')
		expect(result.login).toBe('involvex')
	})

	it('reports invalid on 401 Bad credentials', async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({message: 'Bad credentials'}), {
				status: 401,
			})) as never
		const result = await validateToken('dead-token')
		expect(result.state).toBe('invalid')
	})

	it('reports unknown when GitHub is unreachable', async () => {
		globalThis.fetch = (async () => {
			throw new TypeError('fetch failed')
		}) as never
		const result = await validateToken('some-token')
		expect(result.state).toBe('unknown')
	})
})

describe('hasExplicitClientId', () => {
	it('is false on a fresh install, so the Settings client-ID field shows', () => {
		// This is the regression: getSyncStatus used to report
		// Boolean(resolveClientId(s)), which is always true because resolve falls
		// back to the shipped default. That made the field in SettingsModal
		// unreachable, so a self-hoster could never supply their own OAuth app.
		delete process.env.INVOLVEX_GITHUB_CLIENT_ID
		expect(hasExplicitClientId(syncState())).toBe(false)
	})

	it('is true once a client id has been stored', () => {
		delete process.env.INVOLVEX_GITHUB_CLIENT_ID
		expect(hasExplicitClientId(syncState({clientId: 'Iv23abcdef'}))).toBe(true)
	})

	it('is true when the environment supplies one', () => {
		process.env.INVOLVEX_GITHUB_CLIENT_ID = 'Iv23fromenv'
		expect(hasExplicitClientId(syncState())).toBe(true)
	})

	it('ignores whitespace-only values in either source', () => {
		delete process.env.INVOLVEX_GITHUB_CLIENT_ID
		expect(hasExplicitClientId(syncState({clientId: '   '}))).toBe(false)
		process.env.INVOLVEX_GITHUB_CLIENT_ID = '  '
		expect(hasExplicitClientId(syncState())).toBe(false)
	})
})
