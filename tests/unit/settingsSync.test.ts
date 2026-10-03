import {afterEach, describe, expect, it} from 'bun:test'
import {
	GithubApiError,
	githubErrorMessage,
	validateToken,
} from '../../electron/settingsSync.ts'

const realFetch = globalThis.fetch

afterEach(() => {
	globalThis.fetch = realFetch
})

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
