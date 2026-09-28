/**
 * Portable settings sync via private GitHub Gist + OAuth Device Code flow.
 *
 * Maintainers: register a GitHub OAuth App (Device Flow enabled) and set the
 * public client id below or via INVOLVEX_GITHUB_CLIENT_ID. No client secret.
 * https://github.com/settings/developers
 */
import fs from 'node:fs'
import path from 'node:path'
import {z} from 'zod'
import {
	type AppSettings,
	SETTINGS_DIR,
	SettingsSchema,
} from './settingsStore.js'

export const SYNC_FILE = path.join(SETTINGS_DIR, 'sync.json')
export const GIST_FILENAME = 'involvex-term-settings.json'

/**
 * Public OAuth App client ID (Device Authorization Grant).
 * Override at runtime with INVOLVEX_GITHUB_CLIENT_ID.
 */
const DEFAULT_GITHUB_CLIENT_ID = 'Ov23liwlPtuvxNwGp4Tt'

const PortableProfileSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	kind: z.enum(['pwsh', 'powershell', 'cmd', 'wsl']),
})

const PortableSnippetSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	command: z.string().min(1),
	sendEnter: z.boolean(),
})

const PortableQuickCommandSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1).max(12),
	command: z.string().min(1),
	sendEnter: z.boolean(),
})

const PortableAgentToolSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	label: z.string().min(1).max(4),
	binary: z.string().min(1),
	command: z.string().min(1),
	continueCommand: z.string().optional(),
	sessionProvider: z.enum(['opencode', 'none']),
})

const PortableSchema = z.object({
	version: z.literal(1),
	updatedAt: z.number().int().nonnegative(),
	theme: z.object({
		bg: z.string(),
		fg: z.string(),
		fontFamily: z.string(),
		fontSize: z.number(),
		fontFallback: z.string(),
	}),
	footer: z.object({
		showGit: z.boolean(),
		showSys: z.boolean(),
		showCpu: z.boolean(),
		showMem: z.boolean(),
		showOpencode: z.boolean(),
		showCwd: z.boolean(),
		modulesOrder: z.array(z.string()),
		refreshMs: z.number(),
	}),
	hotkeys: z.record(z.string(), z.string()),
	tabs: z.object({
		confirmClose: z.boolean(),
		restoreSession: z.boolean(),
	}),
	terminal: z.object({
		defaultProfileId: z.string(),
		profiles: z.array(PortableProfileSchema),
		completionBell: z.boolean(),
		scrollback: z.number(),
		scrollbar: z.boolean(),
		snippets: z.array(PortableSnippetSchema),
		quickCommands: z.array(PortableQuickCommandSchema),
	}),
	agent: z.object({
		activeId: z.string(),
		tools: z.array(PortableAgentToolSchema),
		envHooks: z
			.object({
				enabled: z.boolean(),
				includeGit: z.boolean(),
			})
			.optional(),
	}),
	startup: z.object({
		mode: z.enum(['session', 'new']),
	}),
	window: z.object({
		acrylic: z.boolean(),
		checkUpdatesOnStartup: z.boolean(),
	}),
	tray: z.object({
		enabled: z.boolean(),
		minimizeToTray: z.boolean(),
		closeToTray: z.boolean(),
	}),
	quake: z.object({
		enabled: z.boolean(),
		hotkey: z.string(),
		heightPercent: z.number(),
		hideOnFocusLoss: z.boolean(),
	}),
})

export type PortableSettings = z.infer<typeof PortableSchema>

const SyncStateSchema = z.object({
	accessToken: z.string().optional(),
	gistId: z.string().optional(),
	login: z.string().optional(),
	/** Local portable watermark for conflict checks. */
	localUpdatedAt: z.number().int().nonnegative().default(0),
	lastSyncedAt: z.number().int().nonnegative().optional(),
	/** Optional per-machine override of the OAuth client id. */
	clientId: z.string().optional(),
})

export type SyncState = z.infer<typeof SyncStateSchema>

export type SyncStatus = {
	linked: boolean
	login?: string
	gistId?: string
	gistUrl?: string
	lastSyncedAt?: number
	localUpdatedAt: number
	clientIdConfigured: boolean
}

export type DeviceCodePending = {
	userCode: string
	verificationUri: string
	verificationUriComplete?: string
	interval: number
	expiresIn: number
	deviceCode: string
}

type PushResult =
	| {ok: true; status: SyncStatus}
	| {ok: false; needsConfirm: true; remoteUpdatedAt: number; status: SyncStatus}
	| {ok: false; error: string; status: SyncStatus}

type PullResult =
	| {ok: true; settings: AppSettings; status: SyncStatus}
	| {ok: false; error: string; status: SyncStatus}

type LoginResult =
	| {ok: true; status: SyncStatus}
	| {ok: false; error: string; status: SyncStatus}

let pendingDevice: DeviceCodePending | null = null
let loginCancelled = false

function resolveClientId(state: SyncState = loadSyncState()): string {
	return (
		process.env.INVOLVEX_GITHUB_CLIENT_ID?.trim() ||
		state.clientId?.trim() ||
		DEFAULT_GITHUB_CLIENT_ID
	)
}

export function loadSyncState(): SyncState {
	try {
		if (!fs.existsSync(SYNC_FILE)) return SyncStateSchema.parse({})
		const raw = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8'))
		return SyncStateSchema.parse(raw ?? {})
	} catch {
		return SyncStateSchema.parse({})
	}
}

export function saveSyncState(next: SyncState): SyncState {
	const parsed = SyncStateSchema.parse(next)
	if (!fs.existsSync(SETTINGS_DIR))
		fs.mkdirSync(SETTINGS_DIR, {recursive: true})
	fs.writeFileSync(SYNC_FILE, JSON.stringify(parsed, null, 2), {
		encoding: 'utf8',
		mode: 0o600,
	})
	try {
		fs.chmodSync(SYNC_FILE, 0o600)
	} catch {
		/* Windows may ignore mode */
	}
	return parsed
}

export function getSyncStatus(): SyncStatus {
	const s = loadSyncState()
	// Token alone means signed in; gist id appears after the first push.
	const linked = Boolean(s.accessToken)
	return {
		linked,
		login: s.login,
		gistId: s.gistId,
		gistUrl: s.gistId ? `https://gist.github.com/${s.gistId}` : undefined,
		lastSyncedAt: s.lastSyncedAt,
		localUpdatedAt: s.localUpdatedAt,
		clientIdConfigured: Boolean(resolveClientId(s)),
	}
}

/** Mark local portable settings as newer (call after user edits settings). */
export function bumpLocalUpdatedAt(at = Date.now()): SyncState {
	const s = loadSyncState()
	return saveSyncState({...s, localUpdatedAt: Math.max(s.localUpdatedAt, at)})
}

export function extractPortable(
	settings: AppSettings,
	updatedAt = Date.now(),
): PortableSettings {
	return PortableSchema.parse({
		version: 1,
		updatedAt,
		theme: settings.theme,
		footer: settings.footer,
		hotkeys: settings.hotkeys,
		tabs: settings.tabs,
		terminal: {
			defaultProfileId: settings.terminal.defaultProfileId,
			profiles: settings.terminal.profiles
				.filter(p => p.kind !== 'custom')
				.map(p => ({id: p.id, name: p.name, kind: p.kind})),
			completionBell: settings.terminal.completionBell,
			scrollback: settings.terminal.scrollback,
			scrollbar: settings.terminal.scrollbar,
			snippets: settings.terminal.snippets,
			quickCommands: settings.terminal.quickCommands,
		},
		agent: settings.agent,
		startup: {mode: settings.startup.mode},
		window: {
			acrylic: settings.window.acrylic,
			checkUpdatesOnStartup: settings.window.checkUpdatesOnStartup,
		},
		tray: settings.tray,
		quake: settings.quake,
	})
}

export function mergePortable(
	local: AppSettings,
	portable: PortableSettings,
): AppSettings {
	const customLocal = local.terminal.profiles.filter(p => p.kind === 'custom')
	const fromRemote = portable.terminal.profiles.map(p => ({
		id: p.id,
		name: p.name,
		kind: p.kind,
	}))
	const remoteIds = new Set(fromRemote.map(p => p.id))
	const keptBuiltin = local.terminal.profiles.filter(
		p => p.kind !== 'custom' && !remoteIds.has(p.id),
	)
	const profiles = [...fromRemote, ...keptBuiltin, ...customLocal]

	let defaultProfileId = portable.terminal.defaultProfileId
	if (!profiles.some(p => p.id === defaultProfileId)) {
		defaultProfileId = local.terminal.defaultProfileId
	}

	let startupProfileId = local.startup.profileId
	if (startupProfileId && !profiles.some(p => p.id === startupProfileId)) {
		startupProfileId = ''
	}

	return SettingsSchema.parse({
		...local,
		theme: portable.theme,
		footer: portable.footer,
		hotkeys: portable.hotkeys,
		tabs: portable.tabs,
		terminal: {
			...local.terminal,
			startDir: local.terminal.startDir,
			defaultProfileId,
			profiles,
			completionBell: portable.terminal.completionBell,
			scrollback: portable.terminal.scrollback,
			scrollbar: portable.terminal.scrollbar,
			snippets: portable.terminal.snippets,
			quickCommands: portable.terminal.quickCommands,
		},
		agent: {
			activeId: portable.agent.activeId,
			tools: portable.agent.tools,
			envHooks: portable.agent.envHooks ??
				local.agent.envHooks ?? {enabled: false, includeGit: true},
		},
		startup: {
			mode: portable.startup.mode,
			profileId: startupProfileId,
		},
		window: {
			...local.window,
			acrylic: portable.window.acrylic,
			checkUpdatesOnStartup: portable.window.checkUpdatesOnStartup,
		},
		tray: portable.tray,
		quake: portable.quake,
	})
}

async function githubJson<T>(
	token: string | null,
	url: string,
	init?: RequestInit,
): Promise<T> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
		'User-Agent': 'involvex-term',
		...(init?.headers as Record<string, string> | undefined),
	}
	if (token) headers.Authorization = `Bearer ${token}`
	if (init?.body && !headers['Content-Type']) {
		headers['Content-Type'] = 'application/json'
	}
	const res = await fetch(url, {...init, headers})
	const text = await res.text()
	let body: unknown
	try {
		body = text ? JSON.parse(text) : null
	} catch {
		body = text
	}
	if (!res.ok) {
		const msg =
			body &&
			typeof body === 'object' &&
			'message' in body &&
			typeof (body as {message: unknown}).message === 'string'
				? (body as {message: string}).message
				: `${res.status} ${res.statusText}`
		throw new Error(msg)
	}
	return body as T
}

async function requestDeviceCode(clientId: string): Promise<DeviceCodePending> {
	const res = await fetch('https://github.com/login/device/code', {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'involvex-term',
		},
		body: JSON.stringify({client_id: clientId, scope: 'gist read:user'}),
	})
	const data = (await res.json()) as {
		device_code?: string
		user_code?: string
		verification_uri?: string
		verification_uri_complete?: string
		expires_in?: number
		interval?: number
		error?: string
		error_description?: string
	}
	if (
		!res.ok ||
		!data.device_code ||
		!data.user_code ||
		!data.verification_uri
	) {
		throw new Error(
			data.error_description || data.error || 'Device code request failed',
		)
	}
	return {
		deviceCode: data.device_code,
		userCode: data.user_code,
		verificationUri: data.verification_uri,
		verificationUriComplete: data.verification_uri_complete,
		interval: Math.max(5, data.interval ?? 5),
		expiresIn: data.expires_in ?? 900,
	}
}

async function pollAccessToken(
	clientId: string,
	device: DeviceCodePending,
): Promise<{accessToken: string; login?: string}> {
	const deadline = Date.now() + device.expiresIn * 1000
	let intervalMs = device.interval * 1000
	while (Date.now() < deadline) {
		if (loginCancelled) throw new Error('Login canceled')
		await sleep(intervalMs)
		if (loginCancelled) throw new Error('Login canceled')
		const res = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'User-Agent': 'involvex-term',
			},
			body: JSON.stringify({
				client_id: clientId,
				device_code: device.deviceCode,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			}),
		})
		const data = (await res.json()) as {
			access_token?: string
			error?: string
			error_description?: string
			interval?: number
		}
		if (data.access_token) {
			let login: string | undefined
			try {
				const user = await githubJson<{login: string}>(
					data.access_token,
					'https://api.github.com/user',
				)
				login = user.login
			} catch {
				/* optional */
			}
			return {accessToken: data.access_token, login}
		}
		if (data.error === 'authorization_pending') continue
		if (data.error === 'slow_down') {
			intervalMs += 5000
			continue
		}
		if (data.error === 'expired_token') {
			throw new Error('Device code expired — start login again')
		}
		if (data.error === 'access_denied') {
			throw new Error('GitHub authorization was denied')
		}
		throw new Error(data.error_description || data.error || 'Login failed')
	}
	throw new Error('Device code expired — start login again')
}

function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms))
}

type GistFile = {content?: string; truncated?: boolean; raw_url?: string}
type GistResponse = {
	id: string
	html_url: string
	files: Record<string, GistFile | undefined>
}

async function readGistPortable(
	token: string,
	gistId: string,
): Promise<PortableSettings | null> {
	const gist = await githubJson<GistResponse>(
		token,
		`https://api.github.com/gists/${gistId}`,
	)
	const file = gist.files[GIST_FILENAME]
	if (!file) return null
	let content = file.content ?? ''
	if (file.truncated && file.raw_url) {
		const raw = await fetch(file.raw_url, {
			headers: {
				Authorization: `Bearer ${token}`,
				'User-Agent': 'involvex-term',
				Accept: 'application/vnd.github.raw',
			},
		})
		if (!raw.ok) throw new Error('Failed to download gist content')
		content = await raw.text()
	}
	if (!content.trim()) return null
	return PortableSchema.parse(JSON.parse(content))
}

async function findExistingGistId(token: string): Promise<string | null> {
	const list = await githubJson<
		Array<{id: string; files: Record<string, unknown>}>
	>(token, 'https://api.github.com/gists?per_page=100')
	for (const g of list) {
		if (g.files && GIST_FILENAME in g.files) return g.id
	}
	return null
}

async function ensureGist(
	token: string,
	portable: PortableSettings,
	existingId?: string,
): Promise<string> {
	const body = {
		description: 'involvex-term portable settings',
		public: false,
		files: {
			[GIST_FILENAME]: {
				content: JSON.stringify(portable, null, 2),
			},
		},
	}
	if (existingId) {
		await githubJson(token, `https://api.github.com/gists/${existingId}`, {
			method: 'PATCH',
			body: JSON.stringify(body),
		})
		return existingId
	}
	const found = await findExistingGistId(token)
	if (found) {
		await githubJson(token, `https://api.github.com/gists/${found}`, {
			method: 'PATCH',
			body: JSON.stringify(body),
		})
		return found
	}
	const created = await githubJson<GistResponse>(
		token,
		'https://api.github.com/gists',
		{method: 'POST', body: JSON.stringify(body)},
	)
	return created.id
}

export async function startDeviceLoginAsync(): Promise<DeviceCodePending> {
	const clientId = resolveClientId()
	if (!clientId) {
		throw new Error(
			'GitHub OAuth client id not configured. Set INVOLVEX_GITHUB_CLIENT_ID or register a Device Flow OAuth App and set clientId in ~/.involvex-term/sync.json.',
		)
	}
	const device = await requestDeviceCode(clientId)
	pendingDevice = device
	loginCancelled = false
	return device
}

export async function finishDeviceLogin(): Promise<LoginResult> {
	const clientId = resolveClientId()
	const device = pendingDevice
	if (!clientId) {
		return {
			ok: false,
			error: 'GitHub OAuth client id not configured',
			status: getSyncStatus(),
		}
	}
	if (!device) {
		return {
			ok: false,
			error: 'No pending device login — start login first',
			status: getSyncStatus(),
		}
	}
	loginCancelled = false
	try {
		const {accessToken, login} = await pollAccessToken(clientId, device)
		pendingDevice = null
		const prev = loadSyncState()
		let gistId = prev.gistId
		if (!gistId) {
			gistId = (await findExistingGistId(accessToken)) ?? undefined
		}
		saveSyncState({
			...prev,
			accessToken,
			login,
			gistId,
		})
		return {ok: true, status: getSyncStatus()}
	} catch (e) {
		pendingDevice = null
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
			status: getSyncStatus(),
		}
	}
}

export function cancelDeviceLogin(): void {
	loginCancelled = true
	pendingDevice = null
}

export function unlinkSync(): SyncStatus {
	loginCancelled = true
	pendingDevice = null
	const prev = loadSyncState()
	saveSyncState({
		localUpdatedAt: prev.localUpdatedAt,
		clientId: prev.clientId,
	})
	return getSyncStatus()
}

/** Persist a public OAuth App client id for Device Flow (no secret). */
export function setSyncClientId(clientId: string): SyncStatus {
	const prev = loadSyncState()
	const trimmed = clientId.trim()
	saveSyncState({
		...prev,
		clientId: trimmed || undefined,
	})
	return getSyncStatus()
}

export async function pushPortable(
	settings: AppSettings,
	opts?: {force?: boolean},
): Promise<PushResult> {
	const state = loadSyncState()
	if (!state.accessToken) {
		return {
			ok: false,
			error: 'Not signed in to GitHub',
			status: getSyncStatus(),
		}
	}
	try {
		const updatedAt = Date.now()
		const portable = extractPortable(settings, updatedAt)

		let gistId = state.gistId
		if (gistId) {
			const remote = await readGistPortable(state.accessToken, gistId)
			if (remote && remote.updatedAt > state.localUpdatedAt && !opts?.force) {
				return {
					ok: false,
					needsConfirm: true,
					remoteUpdatedAt: remote.updatedAt,
					status: getSyncStatus(),
				}
			}
		}

		gistId = await ensureGist(state.accessToken, portable, gistId)
		saveSyncState({
			...loadSyncState(),
			gistId,
			localUpdatedAt: updatedAt,
			lastSyncedAt: updatedAt,
		})
		return {ok: true, status: getSyncStatus()}
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
			status: getSyncStatus(),
		}
	}
}

export async function pullPortable(local: AppSettings): Promise<PullResult> {
	const state = loadSyncState()
	if (!state.accessToken) {
		return {
			ok: false,
			error: 'Not signed in to GitHub',
			status: getSyncStatus(),
		}
	}
	try {
		let gistId = state.gistId
		if (!gistId) {
			gistId = (await findExistingGistId(state.accessToken)) ?? undefined
			if (!gistId) {
				return {
					ok: false,
					error: 'No sync gist found — push settings first',
					status: getSyncStatus(),
				}
			}
			saveSyncState({...loadSyncState(), gistId})
		}
		const remote = await readGistPortable(state.accessToken, gistId)
		if (!remote) {
			return {
				ok: false,
				error: 'Sync gist is empty — push settings first',
				status: getSyncStatus(),
			}
		}
		const merged = mergePortable(local, remote)
		const now = Date.now()
		saveSyncState({
			...loadSyncState(),
			gistId,
			localUpdatedAt: remote.updatedAt,
			lastSyncedAt: now,
		})
		return {ok: true, settings: merged, status: getSyncStatus()}
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
			status: getSyncStatus(),
		}
	}
}

/** Startup helper: pull if linked; returns merged settings or null if skipped/failed. */
export async function pullOnStartup(
	local: AppSettings,
): Promise<AppSettings | null> {
	const status = getSyncStatus()
	if (!status.linked) return null
	const result = await pullPortable(local)
	if (!result.ok) {
		console.warn('[settingsSync] startup pull failed:', result.error)
		return null
	}
	return result.settings
}
