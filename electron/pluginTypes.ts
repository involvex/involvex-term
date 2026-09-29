/**
 * Plugin API surface exposed to `~/.involvex-term/plugins/<name>/index.mjs`.
 * Mirrored (hand-kept in sync) by the type-only `@involvex/term-sdk` package
 * so plugin authors get editor intellisense without pulling in Electron.
 */

export interface PluginCommand {
	id: string
	title: string
	hint?: string
}

export interface PluginStatusBarSegment {
	id: string
	text: string
	title?: string
}

export interface PtySpawnInfo {
	paneId: string
	cwd: string
	shell: string
}

export interface PluginGitSnapshot {
	repoRoot: string | null
	branch: string
	isDirty: boolean
}

export interface PluginSettingsSnapshot {
	version: string
	theme: {bg: string; fg: string}
}

export interface PluginApi {
	/** Host app version (e.g. "0.6.1"). */
	readonly version: string
	/** Prefix console output with the plugin's name automatically. */
	log(...args: unknown[]): void

	commands: {
		/** Register a command; shows in the command palette while active. */
		register(cmd: PluginCommand, run: () => void | Promise<void>): void
		unregister(id: string): void
	}

	statusBar: {
		/** Show/replace a small text segment in the footer. */
		set(segment: PluginStatusBarSegment): void
		clear(id: string): void
	}

	pty: {
		/** Fires once per new terminal pane (after spawn). Read-only. */
		onSpawn(cb: (info: PtySpawnInfo) => void): () => void
		/** Fires on every chunk of pty output. Read-only — cannot transform it. */
		onData(cb: (paneId: string, data: string) => void): () => void
		onExit(cb: (paneId: string) => void): () => void
	}

	/** Snapshot of user-facing settings a plugin may want to read. */
	settings: {
		get(): PluginSettingsSnapshot
	}

	/** Small per-plugin JSON key/value store, persisted next to the plugin. */
	storage: {
		get<T = unknown>(): T | undefined
		set(value: unknown): void
	}
}

export interface PluginModule {
	/** Called once after load. Register commands/status bar/hooks here. */
	activate(api: PluginApi): void | Promise<void>
	/** Called on app quit or plugin reload, if defined. */
	deactivate?(): void | Promise<void>
}

export interface PluginLoadError {
	name: string
	error: string
}

export interface PluginStatus {
	dir: string
	enabled: boolean
	loaded: Array<{name: string; commands: string[]}>
	errors: PluginLoadError[]
}
