import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import type {
	PluginApi,
	PluginCommand,
	PluginLoadError,
	PluginModule,
	PluginSettingsSnapshot,
	PluginStatus,
	PluginStatusBarSegment,
	PtySpawnInfo,
} from './pluginTypes.js'

export const PLUGINS_DIR = path.join(os.homedir(), '.involvex-term', 'plugins')

type Listener<T extends unknown[]> = (...args: T) => void

interface LoadedPlugin {
	name: string
	dir: string
	module: PluginModule
	commandIds: Set<string>
}

const commands = new Map<
	string,
	{run: () => void | Promise<void>; owner: string}
>()
const statusBar = new Map<string, PluginStatusBarSegment & {owner: string}>()
const loaded: LoadedPlugin[] = []
const errors: PluginLoadError[] = []

const spawnListeners = new Set<Listener<[PtySpawnInfo]>>()
const dataListeners = new Set<Listener<[string, string]>>()
const exitListeners = new Set<Listener<[string]>>()

let onChanged: (() => void) | null = null
let getSettingsSnapshot: (() => PluginSettingsSnapshot) | null = null
let ready = false

/** Wired by main.ts so plugins see the current app version/theme. */
export function initPluginHost(opts: {
	settingsSnapshot: () => PluginSettingsSnapshot
	onChanged: () => void
}): void {
	getSettingsSnapshot = opts.settingsSnapshot
	onChanged = opts.onChanged
}

function notify(): void {
	onChanged?.()
}

function storagePath(dir: string): string {
	return path.join(dir, 'storage.json')
}

function makeApi(name: string, dir: string, appVersion: string): PluginApi {
	return {
		version: appVersion,
		log: (...args) => console.log(`[plugin:${name}]`, ...args),
		commands: {
			register(cmd: PluginCommand, run) {
				commands.set(cmd.id, {run, owner: name})
				const entry = loaded.find(p => p.name === name)
				entry?.commandIds.add(cmd.id)
				commandMeta[cmd.id] = cmd
				notify()
			},
			unregister(id: string) {
				if (commands.get(id)?.owner !== name) return
				commands.delete(id)
				delete commandMeta[id]
				loaded.find(p => p.name === name)?.commandIds.delete(id)
				notify()
			},
		},
		statusBar: {
			set(segment: PluginStatusBarSegment) {
				statusBar.set(segment.id, {...segment, owner: name})
				notify()
			},
			clear(id: string) {
				if (statusBar.get(id)?.owner !== name) return
				statusBar.delete(id)
				notify()
			},
		},
		pty: {
			onSpawn: cb => {
				spawnListeners.add(cb)
				return () => spawnListeners.delete(cb)
			},
			onData: cb => {
				dataListeners.add(cb)
				return () => dataListeners.delete(cb)
			},
			onExit: cb => {
				exitListeners.add(cb)
				return () => exitListeners.delete(cb)
			},
		},
		settings: {
			get: () =>
				getSettingsSnapshot?.() ?? {
					version: appVersion,
					theme: {bg: '#1e1e1e', fg: '#cccccc'},
				},
		},
		storage: {
			get<T>() {
				try {
					return JSON.parse(fs.readFileSync(storagePath(dir), 'utf8')) as T
				} catch {
					return undefined
				}
			},
			set(value) {
				try {
					fs.writeFileSync(storagePath(dir), JSON.stringify(value))
				} catch (e) {
					console.warn(`[plugin:${name}] storage write failed:`, e)
				}
			},
		},
	}
}

// id -> command metadata, separate from the run closures so the renderer
// only ever receives a plain, serializable list.
const commandMeta: Record<string, PluginCommand> = {}

function unloadAll(): void {
	for (const p of loaded) {
		try {
			void p.module.deactivate?.()
		} catch (e) {
			console.warn(`[plugin:${p.name}] deactivate failed:`, e)
		}
		for (const id of p.commandIds) {
			commands.delete(id)
			delete commandMeta[id]
		}
	}
	loaded.length = 0
	errors.length = 0
	for (const [id, seg] of statusBar) {
		if (loaded.every(p => p.name !== seg.owner)) statusBar.delete(id)
	}
}

function findEntry(dir: string): string | null {
	for (const name of ['index.mjs', 'index.js']) {
		const p = path.join(dir, name)
		if (fs.existsSync(p)) return p
	}
	try {
		const pkg = JSON.parse(
			fs.readFileSync(path.join(dir, 'package.json'), 'utf8'),
		) as {main?: string}
		if (pkg.main && fs.existsSync(path.join(dir, pkg.main))) {
			return path.join(dir, pkg.main)
		}
	} catch {
		/* no package.json, or no main — fine */
	}
	return null
}

/**
 * (Re)load every plugin in `~/.involvex-term/plugins`. Each subdirectory
 * with an `index.mjs`/`index.js` (or a `package.json` "main") is a plugin.
 * A plugin that throws during load only affects itself; errors are
 * surfaced via `pluginStatus()` for the Settings UI.
 */
export async function loadPlugins(appVersion: string): Promise<void> {
	unloadAll()
	ready = true
	if (!fs.existsSync(PLUGINS_DIR)) return
	let names: string[]
	try {
		names = fs
			.readdirSync(PLUGINS_DIR, {withFileTypes: true})
			.filter(d => d.isDirectory())
			.map(d => d.name)
	} catch (e) {
		console.warn('[pluginManager] cannot read plugins dir:', e)
		return
	}
	for (const name of names) {
		const dir = path.join(PLUGINS_DIR, name)
		const entry = findEntry(dir)
		if (!entry) continue
		try {
			const mod = (await import(
				pathToFileURL(entry).href + `?t=${Date.now()}`
			)) as {default?: PluginModule} & Partial<PluginModule>
			const module: PluginModule = mod.default ?? (mod as PluginModule)
			if (typeof module.activate !== 'function') {
				throw new Error('module has no activate(api) export')
			}
			const entryRecord: LoadedPlugin = {
				name,
				dir,
				module,
				commandIds: new Set(),
			}
			loaded.push(entryRecord)
			await module.activate(makeApi(name, dir, appVersion))
		} catch (e) {
			errors.push({name, error: e instanceof Error ? e.message : String(e)})
			console.warn(`[plugin:${name}] failed to load:`, e)
		}
	}
	notify()
}

export async function unloadPlugins(): Promise<void> {
	unloadAll()
	ready = false
}

export function pluginStatus(enabled: boolean): PluginStatus {
	return {
		dir: PLUGINS_DIR,
		enabled: enabled && ready,
		loaded: loaded.map(p => ({name: p.name, commands: [...p.commandIds]})),
		errors,
	}
}

export function pluginCommandList(): PluginCommand[] {
	return [...commands.keys()].map(id => commandMeta[id]!)
}

export function pluginStatusBarList(): PluginStatusBarSegment[] {
	return [...statusBar.values()].map(({owner, ...seg}) => {
		void owner
		return seg
	})
}

export async function runPluginCommand(id: string): Promise<boolean> {
	const cmd = commands.get(id)
	if (!cmd) return false
	try {
		await cmd.run()
	} catch (e) {
		console.warn(`[plugin] command "${id}" threw:`, e)
	}
	return true
}

// --- pty event fan-out, called from main.ts's existing spawn/data/exit code ---
export function notifyPtySpawn(info: PtySpawnInfo): void {
	for (const cb of spawnListeners) {
		try {
			cb(info)
		} catch (e) {
			console.warn('[pluginManager] onSpawn listener threw:', e)
		}
	}
}
export function notifyPtyData(paneId: string, data: string): void {
	for (const cb of dataListeners) {
		try {
			cb(paneId, data)
		} catch (e) {
			console.warn('[pluginManager] onData listener threw:', e)
		}
	}
}
export function notifyPtyExit(paneId: string): void {
	for (const cb of exitListeners) {
		try {
			cb(paneId)
		} catch (e) {
			console.warn('[pluginManager] onExit listener threw:', e)
		}
	}
}
