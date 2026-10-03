import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {z} from 'zod'
import {defaultAgentTools} from './agents.js'
import {defaultProfileId, defaultProfiles} from './shellProfiles.js'
import type {SessionState} from './types.js'

export const SETTINGS_DIR = path.join(os.homedir(), '.involvex-term')
export const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json')
export const SESSION_FILE = path.join(SETTINGS_DIR, 'session.json')

const ThemeSchema = z.object({
	bg: z.string().default('#1e1e1e'),
	fg: z.string().default('#cccccc'),
	fontFamily: z
		.string()
		.default("'Cascadia Code', 'CaskaydiaCove Nerd Font', Consolas, monospace"),
	fontSize: z.number().min(8).max(32).default(14),
	/** Extra fonts appended after fontFamily (Nerd Font fallbacks, etc.). */
	fontFallback: z
		.string()
		.default("'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', monospace"),
})

const FooterSchema = z.object({
	showGit: z.boolean().default(true),
	showSys: z.boolean().default(true),
	showCpu: z.boolean().default(true),
	showMem: z.boolean().default(true),
	showOpencode: z.boolean().default(true),
	showCwd: z.boolean().default(true),
	modulesOrder: z.array(z.string()).default(['git', 'opencode', 'sys', 'cwd']),
	refreshMs: z.number().min(500).max(10000).default(1500),
})

const HotkeysSchema = z.record(z.string(), z.string()).default({
	'new-tab': 'Ctrl+Shift+T',
	'close-tab': 'Ctrl+Shift+W',
	'next-tab': 'Ctrl+Tab',
	'prev-tab': 'Ctrl+Shift+Tab',
	'duplicate-tab': 'Ctrl+Shift+D',
	settings: 'Ctrl+,',
	find: 'Ctrl+Shift+F',
	palette: 'Ctrl+Shift+P',
	opencode: 'Ctrl+Shift+O',
	'split-pane': 'Shift+Alt+D',
	'split-pane-vertical': 'Shift+Alt+V',
	'close-pane': 'Shift+Alt+C',
	'zoom-in': 'Ctrl+=',
	'zoom-out': 'Ctrl+-',
	'zoom-reset': 'Ctrl+0',
	'clear-buffer': 'Ctrl+Shift+K',
	'mark-prompt': 'Ctrl+Shift+M',
	'prev-mark': 'Ctrl+Shift+Up',
	'next-mark': 'Ctrl+Shift+Down',
	'check-updates': 'Ctrl+Shift+U',
	'toggle-app': 'Ctrl+`',
})

const TabsSchema = z.object({
	confirmClose: z.boolean().default(false),
	restoreSession: z.boolean().default(true),
})

const ProfileSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	kind: z.enum(['pwsh', 'powershell', 'cmd', 'wsl', 'custom']),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
})

const SnippetSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	command: z.string().min(1),
	/** Append Enter after writing the command. */
	sendEnter: z.boolean().default(true),
})

const QuickCommandSchema = z.object({
	id: z.string().min(1),
	/** Short label shown on the tab-bar button (max 12). */
	label: z.string().min(1).max(12),
	command: z.string().min(1),
	sendEnter: z.boolean().default(true),
})

function defaultSnippets() {
	return [
		{
			id: 'git-status',
			name: 'Git status',
			command: 'git status',
			sendEnter: true,
		},
		{
			id: 'bun-build',
			name: 'Bun build',
			command: 'bun run build',
			sendEnter: true,
		},
		{
			id: 'opencode-continue',
			name: 'OpenCode continue',
			command: 'opencode -c',
			sendEnter: true,
		},
	]
}

const TerminalSchema = z.object({
	/** Default cwd for new tabs. Empty = home folder / inherited cwd. */
	startDir: z.string().default(''),
	/** Default shell profile id. */
	defaultProfileId: z.string().default(defaultProfileId()),
	profiles: z.array(ProfileSchema).default(defaultProfiles()),
	/** Toast when a background pane goes idle after output. */
	completionBell: z.boolean().default(true),
	/** xterm scrollback lines. */
	scrollback: z.number().min(200).max(50000).default(5000),
	/** Show the terminal viewport scrollbar. */
	scrollbar: z.boolean().default(true),
	/** Quick-run commands for the palette. */
	snippets: z.array(SnippetSchema).default(defaultSnippets()),
	/** Compact buttons on the tab bar (left of agent). */
	quickCommands: z.array(QuickCommandSchema).default([]),
})

const AgentToolSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	label: z.string().min(1).max(4),
	binary: z.string().min(1),
	command: z.string().min(1),
	continueCommand: z.string().optional(),
	sessionProvider: z.enum(['opencode', 'none']).default('none'),
})

const EnvHooksSchema = z.object({
	/**
	 * Inject AI-agnostic session env vars into each new PTY (opt-in).
	 * See README “Agent env hooks”. Default off — unchanged spawn env.
	 */
	enabled: z.boolean().default(false),
	/** Include git branch / dirty / ahead-behind / remote when available. */
	includeGit: z.boolean().default(true),
})

const AgentSchema = z.object({
	/** Active tool id (default OpenCode). */
	activeId: z.string().default('opencode'),
	tools: z.array(AgentToolSchema).default(defaultAgentTools()),
	/** Optional env vars for agent CLIs (OpenCode, etc.) — no in-app chat. */
	envHooks: EnvHooksSchema.prefault({}),
	/**
	 * Show OpenCode session title on tab/pane chrome when a pane's cwd
	 * matches a listed session (or was launched/continued into that pane).
	 */
	showPaneLabels: z.boolean().default(true),
})

const PluginsSchema = z.object({
	/** Load local plugins from ~/.involvex-term/plugins (opt-in, off by default). */
	enabled: z.boolean().default(false),
})

const StartupSchema = z.object({
	/**
	 * session = restore previous tabs when tabs.restoreSession is true
	 * new = always open a fresh tab (profile + startDir)
	 */
	mode: z.enum(['session', 'new']).default('session'),
	/** Profile for fresh launch; empty = terminal.defaultProfileId */
	profileId: z.string().default(''),
})

const WindowSchema = z.object({
	width: z.number().min(400).max(7680).default(1200),
	height: z.number().min(300).max(4320).default(800),
	x: z.number().int().nullable().default(null),
	y: z.number().int().nullable().default(null),
	maximized: z.boolean().default(false),
	/** Windows 11 mica / acrylic backdrop. */
	acrylic: z.boolean().default(false),
	/** Quiet check for updates a few seconds after launch. */
	checkUpdatesOnStartup: z.boolean().default(true),
})

const TraySchema = z.object({
	enabled: z.boolean().default(true),
	minimizeToTray: z.boolean().default(true),
	closeToTray: z.boolean().default(true),
})

const QuakeSchema = z.object({
	enabled: z.boolean().default(false),
	hotkey: z.string().default('Alt+`'),
	heightPercent: z.number().min(20).max(90).default(50),
	hideOnFocusLoss: z.boolean().default(true),
})

export const SettingsSchema = z.object({
	theme: ThemeSchema.prefault({}),
	footer: FooterSchema.prefault({}),
	// Note: HotkeysSchema carries its own full default — do NOT wrap it in
	// another .default({})/.prefault({}), or the inner defaults are bypassed.
	hotkeys: HotkeysSchema,
	tabs: TabsSchema.prefault({}),
	terminal: TerminalSchema.prefault({}),
	agent: AgentSchema.prefault({}),
	plugins: PluginsSchema.prefault({}),
	startup: StartupSchema.prefault({}),
	window: WindowSchema.prefault({}),
	tray: TraySchema.prefault({}),
	quake: QuakeSchema.prefault({}),
})

export type AppSettings = z.infer<typeof SettingsSchema>

export function defaultSettings(): AppSettings {
	return SettingsSchema.parse({})
}

function deepMergeDefaults(
	base: Record<string, unknown>,
	over: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {...base}
	for (const [k, v] of Object.entries(over ?? {})) {
		const b = base[k]
		if (
			v &&
			typeof v === 'object' &&
			!Array.isArray(v) &&
			b &&
			typeof b === 'object' &&
			!Array.isArray(b)
		) {
			// Shallow-merge one nesting level (theme/footer/hotkeys/…), so new
			// default keys (e.g. a new hotkey) reach existing settings files.
			out[k] = {...(b as object), ...(v as object)}
		} else if (v !== undefined) {
			out[k] = v
		}
	}
	return out
}

/** Zod issue path, truncated so we never try to splice inside an array. */
type SettingPath = (string | number)[]

/**
 * Cut a path at the first array index.
 *
 * Deleting `profiles[2].shell` would splice the array and renumber every later
 * profile, invalidating `terminal.defaultProfileId` along with it. A bad entry
 * inside an array therefore drops the whole array, which is still far better
 * than the all-or-nothing reset this replaced.
 *
 * Zod types `issue.path` as `PropertyKey[]`; symbol segments cannot be used as
 * object keys or stringified, so they are dropped.
 */
function truncateAtArray(path: readonly PropertyKey[]): SettingPath {
	const usable = path.filter(
		(k): k is string | number => typeof k === 'string' || typeof k === 'number',
	)
	for (let i = 1; i < usable.length; i++) {
		if (typeof usable[i] === 'number') return usable.slice(0, i)
	}
	return usable
}

/** Delete the leaf at `path`; false when there was nothing there to delete. */
function dropLeaf(
	root: Record<string, unknown>,
	path: readonly (string | number)[],
): boolean {
	let node: unknown = root
	for (let i = 0; i < path.length - 1; i++) {
		if (node === null || typeof node !== 'object') return false
		node = (node as Record<string, unknown>)[path[i] as string]
	}
	if (node === null || typeof node !== 'object') return false
	const key = path[path.length - 1] as string
	if (!(key in (node as object))) return false
	delete (node as Record<string, unknown>)[key]
	return true
}

/**
 * Validate `raw` against the schema, falling back **per field** rather than
 * all at once.
 *
 * `SettingsSchema.parse` used to throw on the first bad value and the caller's
 * `catch` returned pristine defaults, so one typo — `fontSize: "14"` instead of
 * `14`, say — silently reset every unrelated preference the user had set. Here
 * we drop just the leaves zod rejects and re-parse, so the schema's own
 * `.default()` fills each one back in and everything around it survives.
 *
 * Returns the settings plus the dotted paths that were rejected, so callers can
 * tell the user what was ignored instead of quietly discarding their file.
 */
export function parseSettingsLenient(raw: unknown): {
	settings: AppSettings
	rejected: string[]
} {
	const base = defaultSettings() as unknown as Record<string, unknown>
	const over =
		raw && typeof raw === 'object' && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {}
	// deepMergeDefaults shares nested objects with `base`, so clone before the
	// delete-driven repair below mutates them.
	const candidate = deepMergeDefaults(
		structuredClone(base) as Record<string, unknown>,
		over,
	)
	const rejected = new Set<string>()
	for (;;) {
		const result = SettingsSchema.safeParse(candidate)
		if (result.success) return {settings: result.data, rejected: [...rejected]}
		let dropped = false
		for (const issue of result.error.issues) {
			const path = truncateAtArray(issue.path)
			if (path.length === 0) continue
			if (dropLeaf(candidate, path)) {
				rejected.add(path.join('.'))
				dropped = true
			}
		}
		// Nothing addressable left to drop (e.g. the document is not an object
		// at all). Bail to defaults rather than spin.
		if (!dropped) break
	}
	return {settings: defaultSettings(), rejected: [...rejected]}
}

function warnRejected(source: string, rejected: string[]): void {
	if (!rejected.length) return
	console.warn(
		`[settings] ignored ${rejected.length} invalid value(s) in ${source}: ${rejected.join(', ')}`,
	)
}

export function loadSettings(): AppSettings {
	try {
		if (!fs.existsSync(SETTINGS_DIR))
			fs.mkdirSync(SETTINGS_DIR, {recursive: true})
		if (!fs.existsSync(SETTINGS_FILE)) {
			const d = defaultSettings()
			fs.writeFileSync(SETTINGS_FILE, JSON.stringify(d, null, 2))
			return d
		}
		const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
		const {settings: parsed, rejected} = parseSettingsLenient(raw)
		warnRejected('settings.json', rejected)
		return parsed
	} catch (err) {
		// Unreadable file or malformed JSON — nothing to salvage field by field.
		console.warn('[settings] could not read settings.json; using defaults', err)
		return defaultSettings()
	}
}

export function saveSettings(next: AppSettings): AppSettings {
	const {settings: parsed, rejected} = parseSettingsLenient(next)
	warnRejected('save', rejected)
	if (!fs.existsSync(SETTINGS_DIR))
		fs.mkdirSync(SETTINGS_DIR, {recursive: true})
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify(parsed, null, 2))
	return parsed
}

/** Merge unknown JSON onto defaults and validate (for import). */
export function parseImportedSettings(raw: unknown): AppSettings {
	const {settings, rejected} = parseSettingsLenient(raw)
	warnRejected('import', rejected)
	return settings
}

function isValidSessionTab(t: unknown): t is {title: unknown; root: unknown} {
	return (
		!!t &&
		typeof t === 'object' &&
		'root' in (t as Record<string, unknown>) &&
		!!(t as Record<string, unknown>)['root'] &&
		typeof (t as Record<string, unknown>)['root'] === 'object'
	)
}

export function loadSession(): SessionState | null {
	try {
		if (!fs.existsSync(SESSION_FILE)) return null
		const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8')) as {
			tabs?: unknown
		}
		if (!raw || !Array.isArray(raw.tabs)) return null
		const tabs = raw.tabs.filter(isValidSessionTab).map(t => {
			const rec = t as {
				title?: unknown
				customTitle?: unknown
				pinned?: unknown
				color?: unknown
				root: unknown
			}
			return {
				title: typeof rec.title === 'string' ? rec.title : 'shell',
				customTitle:
					typeof rec.customTitle === 'string' ? rec.customTitle : undefined,
				pinned: rec.pinned === true,
				color: typeof rec.color === 'string' ? rec.color : undefined,
				root: rec.root,
			}
		})
		if (tabs.length === 0) return null
		return {version: 1, tabs}
	} catch {
		return null
	}
}

export function saveSession(next: SessionState): void {
	try {
		if (!fs.existsSync(SETTINGS_DIR))
			fs.mkdirSync(SETTINGS_DIR, {recursive: true})
		const tabs = Array.isArray(next?.tabs)
			? next.tabs.filter(isValidSessionTab).map(t => {
					const rec = t as {
						title?: unknown
						customTitle?: unknown
						pinned?: unknown
						color?: unknown
						root: unknown
					}
					return {
						title: typeof rec.title === 'string' ? rec.title : 'shell',
						customTitle:
							typeof rec.customTitle === 'string' ? rec.customTitle : undefined,
						pinned: rec.pinned === true ? true : undefined,
						color: typeof rec.color === 'string' ? rec.color : undefined,
						root: rec.root,
					}
				})
			: []
		fs.writeFileSync(SESSION_FILE, JSON.stringify({version: 1, tabs}))
	} catch {
		/* session persistence is best-effort */
	}
}
