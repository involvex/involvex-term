import {describe, expect, test} from 'bun:test'
import {
	doctorFailed,
	formatDoctor,
	runDoctor,
	shellAvailability,
} from '../../packages/cli/src/doctor'

const baseDeps = {
	existsSync: () => true,
	readFileSync: () => '{}',
	which: () => true,
	checkNetwork: async () => ({ok: true, ms: 12}),
	statfsFreeBytes: () => 50 * 1024 ** 3,
	resolveExe: () => 'C:\\app\\involvex-term.exe',
	readConfig: () => ({exe: 'C:\\app\\involvex-term.exe', version: 'v0.7.0'}),
	contextMenuStatus: () => ({supported: true, installed: true}),
	platform: 'win32' as NodeJS.Platform,
}

describe('doctor', () => {
	test('clean machine passes with no failures', async () => {
		const checks = await runDoctor({}, baseDeps)
		expect(doctorFailed(checks)).toBe(false)
		expect(checks.some(c => c.id === 'app' && c.status === 'pass')).toBe(true)
	})

	test('missing exe fails the app check', async () => {
		const checks = await runDoctor({}, {...baseDeps, resolveExe: () => null})
		const app = checks.find(c => c.id === 'app')!
		expect(app.status).toBe('fail')
		expect(doctorFailed(checks)).toBe(true)
	})

	test('corrupt settings.json fails but is never auto-fixed', async () => {
		const checks = await runDoctor(
			{fix: true},
			{
				...baseDeps,
				readFileSync: () => '{not json',
			},
		)
		const s = checks.find(c => c.id === 'settings')!
		expect(s.status).toBe('fail')
		expect(s.fixed).toBeUndefined()
	})

	test('--fix clears a stale cli.json exe pointer', async () => {
		let written: {exe?: string; version?: string} | null = null
		const checks = await runDoctor(
			{fix: true},
			{
				...baseDeps,
				existsSync: p => !String(p).endsWith('.exe'),
				resolveExe: () => 'C:\\gone\\involvex-term.exe',
				readConfig: () => ({
					exe: 'C:\\gone\\involvex-term.exe',
					version: 'v0.6.0',
				}),
				writeConfig: cfg => {
					written = cfg
				},
			},
		)
		expect(written).toEqual({version: 'v0.6.0'})
		expect(checks.find(c => c.id === 'app')?.fixed).toBe(true)
	})

	test('low disk warns', async () => {
		const checks = await runDoctor(
			{},
			{...baseDeps, statfsFreeBytes: () => 0.5 * 1024 ** 3},
		)
		expect(checks.find(c => c.id === 'disk')?.status).toBe('warn')
	})

	test('context menu skipped off Windows', async () => {
		const checks = await runDoctor(
			{},
			{...baseDeps, platform: 'linux' as NodeJS.Platform},
		)
		expect(checks.find(c => c.id === 'context-menu')?.status).toBe('skip')
	})

	test('formatDoctor renders hints for failures', () => {
		const out = formatDoctor([
			{
				id: 'app',
				label: 'App installed',
				status: 'fail',
				detail: 'not found',
				hint: 'Run install',
			},
		])
		expect(out).toContain('✗')
		expect(out).toContain('Run install')
	})
})

describe('shellAvailability', () => {
	test('reports missing shells on Windows', () => {
		const shells = shellAvailability(
			() => false,
			'win32',
			() => false,
		)
		expect(shells.length).toBeGreaterThan(0)
		expect(shells.every(s => !s.available)).toBe(true)
	})
})
