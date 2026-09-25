import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {z} from 'zod'
import {defaultProfileId, defaultProfiles} from './shellProfiles.js'
import type {SessionState} from './types.js'

export const SETTINGS_DIR = path.join(os.homedir(), '.involvex-term')
export const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json')
export const SESSION_FILE = path.join(SETTINGS_DIR, 'session.json')

const ThemeSchema = z.object({
	bg: z.string().default('#1e1e1e'),
	fg: z.string().default('#cccccc'),
	fontFamily: z.string().default("'Cascadia Code', Consolas, monospace"),
	fontSize: z.number().min(8).max(32).default(14),
})

const FooterSchema = z.object({
	showGit: z.boolean().default(true),
	showSys: z.boolean().default(true),
	showCpu: z.boolean().default(true),
	showMem: z.boolean().default(true),
	showOpencode: z.boolean().default(true),
	modulesOrder: z.array(z.string()).default(['git', 'opencode', 'sys']),
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

const TerminalSchema = z.object({
	/** Default cwd for new tabs. Empty = home folder / inherited cwd. */
	startDir: z.string().default(''),
	/** Default shell profile id. */
	defaultProfileId: z.string().default(defaultProfileId()),
	profiles: z.array(ProfileSchema).default(defaultProfiles()),
	/** Toast when a background pane goes idle after output. */
	completionBell: z.boolean().default(true),
})

const WindowSchema = z.object({
	width: z.number().min(400).max(7680).default(1200),
	height: z.number().min(300).max(4320).default(800),
	x: z.number().int().nullable().default(null),
	y: z.number().int().nullable().default(null),
	maximized: z.boolean().default(false),
})

const TraySchema = z.object({
	enabled: z.boolean().default(true),
	minimizeToTray: z.boolean().default(true),
	closeToTray: z.boolean().default(true),
})

const QuakeSchema = z.object({
	enabled: z.boolean().default(false),
	hotkey: z.string().default('Ctrl+`'),
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
		return SettingsSchema.parse(deepMergeDefaults(defaultSettings(), raw))
	} catch {
		return defaultSettings()
	}
}

export function saveSettings(next: AppSettings): AppSettings {
	const parsed = SettingsSchema.parse(next)
	if (!fs.existsSync(SETTINGS_DIR))
		fs.mkdirSync(SETTINGS_DIR, {recursive: true})
	fs.writeFileSync(SETTINGS_FILE, JSON.stringify(parsed, null, 2))
	return parsed
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
			const rec = t as {title?: unknown; customTitle?: unknown; root: unknown}
			return {
				title: typeof rec.title === 'string' ? rec.title : 'shell',
				customTitle:
					typeof rec.customTitle === 'string' ? rec.customTitle : undefined,
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
						root: unknown
					}
					return {
						title: typeof rec.title === 'string' ? rec.title : 'shell',
						customTitle:
							typeof rec.customTitle === 'string' ? rec.customTitle : undefined,
						root: rec.root,
					}
				})
			: []
		fs.writeFileSync(SESSION_FILE, JSON.stringify({version: 1, tabs}))
	} catch {
		/* session persistence is best-effort */
	}
}
