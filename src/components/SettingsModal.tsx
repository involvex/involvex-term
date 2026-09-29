import {useEffect, useState, type DragEvent} from 'react'
import {defaultAgentTools} from '../lib/agents'
import {THEME_PRESETS} from '../lib/themePresets'
import {
	termApi,
	type AppSettings,
	type CommandSnippet,
	type QuickCommand,
	type SyncStatus,
} from '../types'

interface Props {
	settings: AppSettings
	onChange: (next: AppSettings) => void
	onClose: () => void
}

const HOTKEY_ACTIONS: Array<{id: string; label: string}> = [
	{id: 'new-tab', label: 'New tab'},
	{id: 'close-tab', label: 'Close tab'},
	{id: 'next-tab', label: 'Next tab'},
	{id: 'prev-tab', label: 'Previous tab'},
	{id: 'duplicate-tab', label: 'Duplicate tab'},
	{id: 'settings', label: 'Open settings'},
	{id: 'find', label: 'Find in terminal'},
	{id: 'palette', label: 'Command palette'},
	{id: 'opencode', label: 'Open agent'},
	{id: 'split-pane', label: 'Split pane (horizontal)'},
	{id: 'split-pane-vertical', label: 'Split pane (vertical)'},
	{id: 'close-pane', label: 'Close pane'},
	{id: 'zoom-in', label: 'Zoom in'},
	{id: 'zoom-out', label: 'Zoom out'},
	{id: 'zoom-reset', label: 'Zoom reset'},
	{id: 'clear-buffer', label: 'Clear buffer'},
	{id: 'mark-prompt', label: 'Mark prompt'},
	{id: 'prev-mark', label: 'Previous mark'},
	{id: 'next-mark', label: 'Next mark'},
	{id: 'check-updates', label: 'Check for updates'},
]

function formatPressed(e: KeyboardEvent): string | null {
	if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return null
	const parts: string[] = []
	if (e.ctrlKey) parts.push('Ctrl')
	if (e.altKey) parts.push('Alt')
	if (e.shiftKey) parts.push('Shift')
	if (e.metaKey) parts.push('Meta')
	let k = e.key
	if (k === ' ') k = 'Space'
	else if (k.length === 1) k = k.toUpperCase()
	else k = k[0].toUpperCase() + k.slice(1)
	parts.push(k)
	return parts.join('+')
}

/** Text input + "Record" button that captures the next pressed combo. */
export function HotkeyInput({
	value,
	onChange,
	ariaLabel,
}: {
	value: string
	onChange: (v: string) => void
	ariaLabel: string
}) {
	const [recording, setRecording] = useState(false)

	useEffect(() => {
		if (!recording) return
		const handler = (e: KeyboardEvent) => {
			// Capture phase + stop: App's window shortcuts and xterm must not fire.
			e.preventDefault()
			e.stopPropagation()
			if (e.key === 'Escape') {
				setRecording(false)
				return
			}
			const combo = formatPressed(e)
			if (!combo) return // modifier-only, keep waiting
			onChange(combo)
			setRecording(false)
		}
		window.addEventListener('keydown', handler, true)
		return () => window.removeEventListener('keydown', handler, true)
	}, [recording, onChange])

	return (
		<span className="hotkey-row">
			<input
				type="text"
				value={value}
				aria-label={ariaLabel}
				onChange={e => onChange(e.target.value)}
			/>
			<button
				type="button"
				className={recording ? 'recording' : ''}
				onClick={() => setRecording(r => !r)}
				title="Record a key combination (Esc cancels)"
			>
				{recording ? 'Press keys…' : 'Record'}
			</button>
		</span>
	)
}

function formatSyncTime(ms?: number): string {
	if (!ms) return 'never'
	try {
		return new Date(ms).toLocaleString()
	} catch {
		return 'never'
	}
}

function SyncSection({
	onSettingsPulled,
}: {
	onSettingsPulled: (s: AppSettings) => void
}) {
	const api = termApi()
	const [status, setStatus] = useState<SyncStatus | null>(null)
	const [clientIdDraft, setClientIdDraft] = useState('')
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState<string | null>(null)
	const [device, setDevice] = useState<{
		userCode: string
		verificationUri: string
	} | null>(null)

	useEffect(() => {
		void api?.syncStatus().then(s => setStatus(s))
	}, [api])

	const refresh = () => {
		void api?.syncStatus().then(s => setStatus(s))
	}

	const run = async (fn: () => Promise<void>) => {
		setBusy(true)
		setMessage(null)
		try {
			await fn()
		} finally {
			setBusy(false)
			refresh()
		}
	}

	return (
		<section>
			<h3>Settings sync (GitHub Gist)</h3>
			<p className="footer-dim">
				Syncs theme, hotkeys, snippets, and other portable prefs via a private
				gist. Window size, start directory, and custom shell paths stay local.
			</p>
			{status && (
				<p className="footer-dim">
					{status.linked
						? `Signed in as ${status.login || 'GitHub'} · last sync ${formatSyncTime(status.lastSyncedAt)}${status.gistId ? '' : ' · push to create gist'}`
						: 'Not linked'}
					{status.gistUrl ? (
						<>
							{' '}
							·{' '}
							<button
								type="button"
								className="settings-btn"
								onClick={() => void api?.openExternal(status.gistUrl!)}
							>
								Open gist
							</button>
						</>
					) : null}
				</p>
			)}
			{!status?.clientIdConfigured && !status?.linked && (
				<label className="wide">
					GitHub OAuth client ID (Device Flow){' '}
					<input
						type="text"
						value={clientIdDraft}
						placeholder="Iv23…"
						onChange={e => setClientIdDraft(e.target.value)}
					/>
					<button
						type="button"
						className="settings-btn"
						disabled={busy || !clientIdDraft.trim()}
						onClick={() =>
							void run(async () => {
								await api?.syncSetClientId(clientIdDraft.trim())
								setMessage('Client ID saved')
							})
						}
					>
						Save client ID
					</button>
				</label>
			)}
			{device && (
				<p>
					Enter code <strong>{device.userCode}</strong> at{' '}
					<code>{device.verificationUri}</code>
					{busy ? ' — waiting for authorization…' : ''}
				</p>
			)}
			{message && <p className="footer-dim">{message}</p>}
			<div className="settings-btn-row">
				{!status?.linked ? (
					<button
						type="button"
						className="settings-btn"
						disabled={busy}
						onClick={() =>
							void run(async () => {
								const start = await api?.syncLoginStart()
								if (!start?.ok) {
									setMessage(start?.error || 'Login failed')
									return
								}
								setDevice({
									userCode: start.userCode!,
									verificationUri: start.verificationUri!,
								})
								const url =
									start.verificationUriComplete || start.verificationUri!
								await api?.openExternal(url)
								const finish = await api?.syncLoginFinish()
								setDevice(null)
								if (!finish?.ok) {
									setMessage(finish?.error || 'Login failed')
									return
								}
								setMessage(`Signed in as ${finish.status.login || 'GitHub'}`)
							})
						}
					>
						Sign in with GitHub…
					</button>
				) : (
					<>
						<button
							type="button"
							className="settings-btn"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									let result = await api?.syncPush()
									if (result?.needsConfirm) {
										const ok = await api?.dialogConfirm({
											title: 'Overwrite remote settings?',
											message:
												'Remote gist is newer than this machine. Push anyway?',
											detail: result.remoteUpdatedAt
												? `Remote updated: ${formatSyncTime(result.remoteUpdatedAt)}`
												: undefined,
											buttons: ['Overwrite', 'Cancel'],
										})
										if (!ok) {
											setMessage('Push canceled')
											return
										}
										result = await api?.syncPush({force: true})
									}
									if (!result?.ok) {
										setMessage(result?.error || 'Push failed')
										return
									}
									setMessage('Pushed to gist')
								})
							}
						>
							Push
						</button>
						<button
							type="button"
							className="settings-btn"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									const result = await api?.syncPull()
									if (!result?.ok) {
										setMessage(result?.error || 'Pull failed')
										return
									}
									if (result.settings) onSettingsPulled(result.settings)
									setMessage('Pulled from gist')
								})
							}
						>
							Pull
						</button>
						<button
							type="button"
							className="settings-btn"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									await api?.syncLogout()
									setMessage('Unlinked')
								})
							}
						>
							Unlink
						</button>
					</>
				)}
				{device && (
					<button
						type="button"
						className="settings-btn"
						onClick={() => {
							void api?.syncLoginCancel()
							setDevice(null)
							setBusy(false)
							setMessage('Login canceled')
							refresh()
						}}
					>
						Cancel login
					</button>
				)}
			</div>
		</section>
	)
}

function ExplorerSection() {
	const api = termApi()
	const [status, setStatus] = useState<{
		supported: boolean
		installed: boolean
		exe: string | null
	} | null>(null)
	const [busy, setBusy] = useState(false)
	const [message, setMessage] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false
		void api
			?.contextMenu('status')
			.then(s => {
				if (!cancelled) setStatus(s)
			})
			.catch(() => {
				if (!cancelled)
					setStatus({supported: false, installed: false, exe: null})
			})
		return () => {
			cancelled = true
		}
	}, [api])

	const run = async (action: 'install' | 'uninstall') => {
		setBusy(true)
		setMessage(null)
		try {
			const next = await api?.contextMenu(action)
			if (next) setStatus(next)
			setMessage(action === 'install' ? 'Installed' : 'Removed')
		} catch (e) {
			setMessage(e instanceof Error ? e.message : String(e))
		} finally {
			setBusy(false)
		}
	}

	return (
		<section>
			<h3>Windows Explorer context menu</h3>
			{status === null ? (
				<p className="footer-dim">Checking…</p>
			) : !status.supported ? (
				<p className="footer-dim">
					Available in packaged Windows builds. In dev or on other platforms use{' '}
					<code>involvex-term context-menu install</code>.
				</p>
			) : (
				<>
					<p className="footer-dim">
						{status.installed
							? '“Open in involvex-term” is registered for folders, folder backgrounds, and drives.'
							: 'Not registered. Adds “Open in involvex-term” for folders, folder backgrounds, and drives.'}
					</p>
					<p className="footer-dim">
						On Windows 11 the entry appears under “Show more options”. No admin
						rights needed (per-user registration).
					</p>
					{message && <p className="footer-dim">{message}</p>}
					<div className="settings-btn-row">
						{!status.installed ? (
							<button
								type="button"
								className="settings-btn"
								disabled={busy}
								onClick={() => void run('install')}
							>
								Install Explorer entry
							</button>
						) : (
							<button
								type="button"
								className="settings-btn"
								disabled={busy}
								onClick={() => void run('uninstall')}
							>
								Remove Explorer entry
							</button>
						)}
					</div>
				</>
			)}
		</section>
	)
}

const SETTINGS_TABS = [
	{id: 'appearance', label: 'Appearance'},
	{id: 'terminal', label: 'Terminal'},
	{id: 'hotkeys', label: 'Hotkeys'},
	{id: 'status', label: 'Status bar'},
	{id: 'window', label: 'Window'},
	{id: 'agent', label: 'Agent'},
	{id: 'plugins', label: 'Plugins'},
	{id: 'sync', label: 'Sync & data'},
] as const
type SettingsTabId = (typeof SETTINGS_TABS)[number]['id']

export default function SettingsModal({settings, onChange, onClose}: Props) {
	const [tab, setTab] = useState<SettingsTabId>('appearance')
	const set = (patch: Partial<AppSettings>) => onChange({...settings, ...patch})
	const [pluginStatus, setPluginStatus] = useState<{
		dir: string
		enabled: boolean
		loaded: Array<{name: string; commands: string[]}>
		errors: Array<{name: string; error: string}>
	} | null>(null)

	useEffect(() => {
		if (tab !== 'plugins') return
		let cancelled = false
		void termApi()
			?.pluginList()
			.then(r => {
				if (!cancelled) setPluginStatus(r.status)
			})
		return () => {
			cancelled = true
		}
	}, [tab, settings.plugins?.enabled])
	return (
		<div
			className="modal-backdrop"
			onClick={onClose}
		>
			<div
				className="modal settings-modal"
				onClick={e => e.stopPropagation()}
				role="dialog"
				aria-label="Settings"
			>
				<div className="modal-header">
					<h2>Settings</h2>
					<span className="footer-dim modal-path">
						~/.involvex-term/settings.json
					</span>
					<button
						type="button"
						className="tab-close"
						onClick={onClose}
						aria-label="Close settings"
					>
						×
					</button>
				</div>

				<div className="settings-layout">
					<nav
						className="settings-nav"
						aria-label="Settings sections"
					>
						{SETTINGS_TABS.map(t => (
							<button
								key={t.id}
								type="button"
								className={tab === t.id ? 'active' : ''}
								onClick={() => setTab(t.id)}
							>
								{t.label}
							</button>
						))}
					</nav>
					<div className="settings-pane">
						{tab === 'appearance' && (
							<section>
								<h3>Theme</h3>
								<label className="wide">
									Preset{' '}
									<select
										value={
											THEME_PRESETS.find(
												p =>
													p.bg === settings.theme.bg &&
													p.fg === settings.theme.fg &&
													p.fontFamily === settings.theme.fontFamily,
											)?.id ?? ''
										}
										onChange={e => {
											const preset = THEME_PRESETS.find(
												p => p.id === e.target.value,
											)
											if (!preset) return
											set({
												theme: {
													...settings.theme,
													bg: preset.bg,
													fg: preset.fg,
													fontFamily: preset.fontFamily,
												},
											})
										}}
									>
										<option value="">Custom</option>
										{THEME_PRESETS.map(p => (
											<option
												key={p.id}
												value={p.id}
											>
												{p.name}
											</option>
										))}
									</select>
								</label>
								<label>
									Background{' '}
									<input
										type="color"
										value={settings.theme.bg}
										onChange={e =>
											set({theme: {...settings.theme, bg: e.target.value}})
										}
									/>
								</label>
								<label>
									Foreground{' '}
									<input
										type="color"
										value={settings.theme.fg}
										onChange={e =>
											set({theme: {...settings.theme, fg: e.target.value}})
										}
									/>
								</label>
								<label>
									Font size{' '}
									<input
										type="number"
										min={8}
										max={32}
										value={settings.theme.fontSize}
										onChange={e =>
											set({
												theme: {
													...settings.theme,
													fontSize: Number(e.target.value),
												},
											})
										}
									/>
								</label>
								<label className="wide">
									Font family{' '}
									<input
										type="text"
										value={settings.theme.fontFamily}
										onChange={e =>
											set({
												theme: {...settings.theme, fontFamily: e.target.value},
											})
										}
									/>
								</label>
								<label className="wide">
									Font fallback{' '}
									<input
										type="text"
										value={settings.theme.fontFallback}
										onChange={e =>
											set({
												theme: {
													...settings.theme,
													fontFallback: e.target.value,
												},
											})
										}
									/>
								</label>
							</section>
						)}
						{tab === 'terminal' && (
							<>
								<section>
									<h3>Startup</h3>
									<label className="wide">
										On launch{' '}
										<select
											value={settings.startup.mode}
											onChange={e =>
												set({
													startup: {
														...settings.startup,
														mode: e.target.value as 'session' | 'new',
													},
												})
											}
										>
											<option value="session">Restore previous session</option>
											<option value="new">New tab (profile + start dir)</option>
										</select>
									</label>
									<label className="wide">
										Startup profile{' '}
										<select
											value={settings.startup.profileId}
											onChange={e =>
												set({
													startup: {
														...settings.startup,
														profileId: e.target.value,
													},
												})
											}
										>
											<option value="">Default profile</option>
											{settings.terminal.profiles.map(p => (
												<option
													key={p.id}
													value={p.id}
												>
													{p.name}
												</option>
											))}
										</select>
									</label>
									<p className="footer-dim">
										“Restore previous session” still needs Tabs → Restore
										enabled. Startup profile applies when opening a fresh tab on
										launch.
									</p>
								</section>
							</>
						)}
						{tab === 'status' && (
							<section>
								<h3>Footer status bar</h3>
								<label>
									<input
										type="checkbox"
										checked={settings.footer.showGit}
										onChange={e =>
											set({
												footer: {...settings.footer, showGit: e.target.checked},
											})
										}
									/>{' '}
									Show Git
								</label>
								<label>
									<input
										type="checkbox"
										checked={settings.footer.showSys}
										onChange={e =>
											set({
												footer: {...settings.footer, showSys: e.target.checked},
											})
										}
									/>{' '}
									Show PC stats
								</label>
								<label>
									<input
										type="checkbox"
										checked={settings.footer.showOpencode}
										onChange={e =>
											set({
												footer: {
													...settings.footer,
													showOpencode: e.target.checked,
												},
											})
										}
									/>{' '}
									Show agent status (footer)
								</label>
								<label>
									<input
										type="checkbox"
										checked={settings.footer.showCpu}
										onChange={e =>
											set({
												footer: {...settings.footer, showCpu: e.target.checked},
											})
										}
									/>{' '}
									CPU
								</label>
								<label>
									<input
										type="checkbox"
										checked={settings.footer.showMem}
										onChange={e =>
											set({
												footer: {...settings.footer, showMem: e.target.checked},
											})
										}
									/>{' '}
									Memory
								</label>
								<label>
									<input
										type="checkbox"
										checked={settings.footer.showCwd !== false}
										onChange={e =>
											set({
												footer: {...settings.footer, showCwd: e.target.checked},
											})
										}
									/>{' '}
									Show path (CWD)
								</label>
								<label>
									Refresh (ms){' '}
									<input
										type="number"
										min={500}
										max={10000}
										step={250}
										value={settings.footer.refreshMs}
										onChange={e =>
											set({
												footer: {
													...settings.footer,
													refreshMs: Number(e.target.value),
												},
											})
										}
									/>
								</label>
								<p className="footer-dim">
									Right-click the status bar to toggle modules or enter
									drag-to-reorder layout mode.
								</p>
							</section>
						)}
						{tab === 'hotkeys' && (
							<section>
								<h3>Hotkeys</h3>
								<p className="footer-dim">
									Takes effect on restart of menu (applied live where possible).
									Format: Ctrl+Shift+T. Pane split defaults use Shift+Alt+… — if
									that conflicts with Windows language switching, remap to
									Ctrl+Alt+D (etc.).
								</p>
								{HOTKEY_ACTIONS.map(a => (
									<label
										key={a.id}
										className="wide"
									>
										{a.label}
										<HotkeyInput
											value={settings.hotkeys[a.id] ?? ''}
											ariaLabel={a.label}
											onChange={v =>
												set({
													hotkeys: {...settings.hotkeys, [a.id]: v},
												})
											}
										/>
									</label>
								))}
							</section>
						)}
						{tab === 'terminal' && (
							<>
								<section>
									<h3>Tabs</h3>
									<label>
										<input
											type="checkbox"
											checked={settings.tabs.confirmClose}
											onChange={e =>
												set({
													tabs: {
														...settings.tabs,
														confirmClose: e.target.checked,
													},
												})
											}
										/>{' '}
										Confirm before closing last tab
									</label>
									<label>
										<input
											type="checkbox"
											checked={settings.tabs.restoreSession}
											onChange={e =>
												set({
													tabs: {
														...settings.tabs,
														restoreSession: e.target.checked,
													},
												})
											}
										/>{' '}
										Restore tabs and splits on launch
									</label>
								</section>

								<section>
									<h3>Terminal</h3>
									<label className="wide">
										Default profile{' '}
										<select
											value={settings.terminal.defaultProfileId}
											onChange={e =>
												set({
													terminal: {
														...settings.terminal,
														defaultProfileId: e.target.value,
													},
												})
											}
										>
											{settings.terminal.profiles.map(p => (
												<option
													key={p.id}
													value={p.id}
												>
													{p.name}
												</option>
											))}
										</select>
									</label>
									<label className="wide">
										Start directory{' '}
										<input
											type="text"
											placeholder="e.g. D:/repos (empty = home folder)"
											value={settings.terminal.startDir}
											onChange={e =>
												set({
													terminal: {
														...settings.terminal,
														startDir: e.target.value,
													},
												})
											}
										/>
									</label>
									<p className="footer-dim">
										Used for new tabs and when Startup is “New tab”. With
										session restore enabled, previous tab folders are restored
										instead.
									</p>
									<label>
										<input
											type="checkbox"
											checked={settings.terminal.completionBell}
											onChange={e =>
												set({
													terminal: {
														...settings.terminal,
														completionBell: e.target.checked,
													},
												})
											}
										/>{' '}
										Background pane completion toast
									</label>
									<label>
										Scrollback lines{' '}
										<input
											type="number"
											min={200}
											max={50000}
											step={100}
											value={settings.terminal.scrollback}
											onChange={e =>
												set({
													terminal: {
														...settings.terminal,
														scrollback: Number(e.target.value),
													},
												})
											}
										/>
									</label>
									<label>
										<input
											type="checkbox"
											checked={settings.terminal.scrollbar}
											onChange={e =>
												set({
													terminal: {
														...settings.terminal,
														scrollbar: e.target.checked,
													},
												})
											}
										/>{' '}
										Show scrollbar
									</label>
									<p className="footer-dim">
										New tabs use the default profile. Use ▾ next to + (or the
										command palette) for another shell. Custom profiles live in
										settings.json under <code>terminal.profiles</code>.
										Ctrl+click URLs and local paths to open them.
									</p>
								</section>

								<section>
									<h3>Command snippets</h3>
									<p className="footer-dim">
										Appear in the command palette as “Run: …”. Written into the
										focused pane.
									</p>
									{(settings.terminal.snippets ?? []).map((snip, idx) => (
										<div
											key={snip.id}
											className="snippet-row"
										>
											<label>
												Name{' '}
												<input
													type="text"
													value={snip.name}
													onChange={e => {
														const snippets = [...settings.terminal.snippets]
														snippets[idx] = {...snip, name: e.target.value}
														set({
															terminal: {...settings.terminal, snippets},
														})
													}}
												/>
											</label>
											<label className="wide">
												Command{' '}
												<input
													type="text"
													value={snip.command}
													onChange={e => {
														const snippets = [...settings.terminal.snippets]
														snippets[idx] = {...snip, command: e.target.value}
														set({
															terminal: {...settings.terminal, snippets},
														})
													}}
												/>
											</label>
											<label>
												<input
													type="checkbox"
													checked={snip.sendEnter !== false}
													onChange={e => {
														const snippets = [...settings.terminal.snippets]
														snippets[idx] = {
															...snip,
															sendEnter: e.target.checked,
														}
														set({
															terminal: {...settings.terminal, snippets},
														})
													}}
												/>{' '}
												Enter
											</label>
											<button
												type="button"
												className="settings-btn"
												onClick={() => {
													const snippets = settings.terminal.snippets.filter(
														(_, i) => i !== idx,
													)
													set({terminal: {...settings.terminal, snippets}})
												}}
											>
												Remove
											</button>
										</div>
									))}
									<button
										type="button"
										className="settings-btn"
										onClick={() => {
											const snip: CommandSnippet = {
												id: `snip-${Date.now()}`,
												name: 'New snippet',
												command: '',
												sendEnter: true,
											}
											set({
												terminal: {
													...settings.terminal,
													snippets: [
														...(settings.terminal.snippets ?? []),
														snip,
													],
												},
											})
										}}
									>
										Add snippet
									</button>
								</section>

								<section>
									<h3>Quick command buttons</h3>
									<p className="footer-dim">
										Compact buttons on the tab bar (left of the agent). Drag
										rows to reorder. Click writes the command into the focused
										pane.
									</p>
									{(settings.terminal.quickCommands ?? []).map((qc, idx) => (
										<div
											key={qc.id}
											className="snippet-row snippet-row-drag"
											draggable
											onDragStart={e => {
												e.dataTransfer.setData('text/plain', String(idx))
												e.dataTransfer.effectAllowed = 'move'
											}}
											onDragOver={e => e.preventDefault()}
											onDrop={(e: DragEvent) => {
												e.preventDefault()
												const from = Number(
													e.dataTransfer.getData('text/plain'),
												)
												if (Number.isNaN(from) || from === idx) return
												const list = [
													...(settings.terminal.quickCommands ?? []),
												]
												const [moved] = list.splice(from, 1)
												if (!moved) return
												list.splice(idx, 0, moved)
												set({
													terminal: {...settings.terminal, quickCommands: list},
												})
											}}
										>
											<span
												className="snippet-drag-handle"
												title="Drag to reorder"
												aria-hidden
											>
												⋮⋮
											</span>
											<label>
												Label{' '}
												<input
													type="text"
													maxLength={12}
													value={qc.label}
													onChange={e => {
														const quickCommands = [
															...(settings.terminal.quickCommands ?? []),
														]
														quickCommands[idx] = {...qc, label: e.target.value}
														set({
															terminal: {...settings.terminal, quickCommands},
														})
													}}
												/>
											</label>
											<label className="wide">
												Command{' '}
												<input
													type="text"
													value={qc.command}
													onChange={e => {
														const quickCommands = [
															...(settings.terminal.quickCommands ?? []),
														]
														quickCommands[idx] = {
															...qc,
															command: e.target.value,
														}
														set({
															terminal: {...settings.terminal, quickCommands},
														})
													}}
												/>
											</label>
											<label>
												<input
													type="checkbox"
													checked={qc.sendEnter !== false}
													onChange={e => {
														const quickCommands = [
															...(settings.terminal.quickCommands ?? []),
														]
														quickCommands[idx] = {
															...qc,
															sendEnter: e.target.checked,
														}
														set({
															terminal: {...settings.terminal, quickCommands},
														})
													}}
												/>{' '}
												Enter
											</label>
											<button
												type="button"
												className="settings-btn"
												onClick={() => {
													const quickCommands = (
														settings.terminal.quickCommands ?? []
													).filter((_, i) => i !== idx)
													set({terminal: {...settings.terminal, quickCommands}})
												}}
											>
												Remove
											</button>
										</div>
									))}
									<button
										type="button"
										className="settings-btn"
										onClick={() => {
											const qc: QuickCommand = {
												id: `qc-${Date.now()}`,
												label: 'cmd',
												command: '',
												sendEnter: true,
											}
											set({
												terminal: {
													...settings.terminal,
													quickCommands: [
														...(settings.terminal.quickCommands ?? []),
														qc,
													],
												},
											})
										}}
									>
										Add button
									</button>
								</section>
							</>
						)}
						{tab === 'agent' && (
							<section>
								<h3>Coding agent</h3>
								<p className="footer-dim">
									Default is OpenCode. Switch to another CLI tool — the tab-bar
									button and Ctrl+Shift+O launch the active agent. Session
									picker is OpenCode-only.
								</p>
								<label className="wide">
									Active agent
									<select
										value={settings.agent?.activeId || 'opencode'}
										onChange={e =>
											set({
												agent: {
													...(settings.agent ?? {
														activeId: 'opencode',
														tools: defaultAgentTools(),
														envHooks: {enabled: false, includeGit: true},
													}),
													activeId: e.target.value,
													tools: settings.agent?.tools?.length
														? settings.agent.tools
														: defaultAgentTools(),
												},
											})
										}
									>
										{(settings.agent?.tools?.length
											? settings.agent.tools
											: defaultAgentTools()
										).map(t => (
											<option
												key={t.id}
												value={t.id}
											>
												{t.name} ({t.label})
											</option>
										))}
									</select>
								</label>
								{(settings.agent?.tools?.length
									? settings.agent.tools
									: defaultAgentTools()
								).map((tool, idx) => (
									<div
										key={tool.id}
										className="snippet-row"
									>
										<label>
											Label{' '}
											<input
												type="text"
												maxLength={4}
												value={tool.label}
												onChange={e => {
													const tools = [
														...(settings.agent?.tools?.length
															? settings.agent.tools
															: defaultAgentTools()),
													]
													tools[idx] = {...tool, label: e.target.value}
													set({
														agent: {
															activeId: settings.agent?.activeId || 'opencode',
															tools,
															envHooks: settings.agent?.envHooks ?? {
																enabled: false,
																includeGit: true,
															},
															showPaneLabels:
																settings.agent?.showPaneLabels !== false,
														},
													})
												}}
											/>
										</label>
										<label className="wide">
											Command{' '}
											<input
												type="text"
												value={tool.command}
												onChange={e => {
													const tools = [
														...(settings.agent?.tools?.length
															? settings.agent.tools
															: defaultAgentTools()),
													]
													tools[idx] = {...tool, command: e.target.value}
													set({
														agent: {
															activeId: settings.agent?.activeId || 'opencode',
															tools,
															envHooks: settings.agent?.envHooks ?? {
																enabled: false,
																includeGit: true,
															},
															showPaneLabels:
																settings.agent?.showPaneLabels !== false,
														},
													})
												}}
											/>
										</label>
										<label className="wide">
											Continue{' '}
											<input
												type="text"
												value={tool.continueCommand ?? ''}
												placeholder="optional"
												onChange={e => {
													const tools = [
														...(settings.agent?.tools?.length
															? settings.agent.tools
															: defaultAgentTools()),
													]
													tools[idx] = {
														...tool,
														continueCommand: e.target.value || undefined,
													}
													set({
														agent: {
															activeId: settings.agent?.activeId || 'opencode',
															tools,
															envHooks: settings.agent?.envHooks ?? {
																enabled: false,
																includeGit: true,
															},
															showPaneLabels:
																settings.agent?.showPaneLabels !== false,
														},
													})
												}}
											/>
										</label>
									</div>
								))}
								<button
									type="button"
									className="settings-btn"
									onClick={() =>
										set({
											agent: {
												activeId: 'opencode',
												tools: defaultAgentTools(),
												envHooks: settings.agent?.envHooks ?? {
													enabled: false,
													includeGit: true,
												},
												showPaneLabels:
													settings.agent?.showPaneLabels !== false,
											},
										})
									}
								>
									Reset agents to defaults
								</button>

								<h3 style={{marginTop: '1.25rem'}}>Pane labels</h3>
								<p className="footer-dim">
									When an OpenCode session matches a pane (by cwd or after
									launch/continue), show the session title on the tab and a chip
									on the pane. Labels clear when the session leaves the OpenCode
									list. Busy vs idle uses recent session activity.
								</p>
								<label>
									<input
										type="checkbox"
										checked={settings.agent?.showPaneLabels !== false}
										onChange={e =>
											set({
												agent: {
													activeId: settings.agent?.activeId || 'opencode',
													tools: settings.agent?.tools?.length
														? settings.agent.tools
														: defaultAgentTools(),
													envHooks: settings.agent?.envHooks ?? {
														enabled: false,
														includeGit: true,
													},
													showPaneLabels: e.target.checked,
												},
											})
										}
									/>{' '}
									Show agent session titles on tabs and panes
								</label>

								<h3 style={{marginTop: '1.25rem'}}>Agent env hooks</h3>
								<p className="footer-dim">
									Opt-in environment variables injected into each new pane so
									OpenCode or any other agent CLI can read session context. No
									in-app chat UI — hooks only. New tabs/panes pick up changes;
									existing shells keep their spawn-time env.
								</p>
								<label>
									<input
										type="checkbox"
										checked={settings.agent?.envHooks?.enabled === true}
										onChange={e =>
											set({
												agent: {
													activeId: settings.agent?.activeId || 'opencode',
													tools: settings.agent?.tools?.length
														? settings.agent.tools
														: defaultAgentTools(),
													envHooks: {
														enabled: e.target.checked,
														includeGit:
															settings.agent?.envHooks?.includeGit !== false,
													},
													showPaneLabels:
														settings.agent?.showPaneLabels !== false,
												},
											})
										}
									/>{' '}
									Inject session env on PTY spawn
								</label>
								<label>
									<input
										type="checkbox"
										disabled={settings.agent?.envHooks?.enabled !== true}
										checked={settings.agent?.envHooks?.includeGit !== false}
										onChange={e =>
											set({
												agent: {
													activeId: settings.agent?.activeId || 'opencode',
													tools: settings.agent?.tools?.length
														? settings.agent.tools
														: defaultAgentTools(),
													envHooks: {
														enabled: settings.agent?.envHooks?.enabled === true,
														includeGit: e.target.checked,
													},
													showPaneLabels:
														settings.agent?.showPaneLabels !== false,
												},
											})
										}
									/>{' '}
									Include git context (branch, dirty, ahead/behind, remote)
								</label>
							</section>
						)}
						{tab === 'plugins' && (
							<section>
								<h3>Local plugins</h3>
								<p className="footer-dim">
									Load Node scripts from{' '}
									<code>~/.involvex-term/plugins/&lt;name&gt;/index.mjs</code>{' '}
									to add command-palette commands and status-bar text. Plugins
									run with full Node access in the main process — only enable
									ones you wrote or trust. See the{' '}
									<a
										href="#"
										onClick={e => {
											e.preventDefault()
											void termApi()?.openExternal(
												'https://github.com/involvex/involvex-term/blob/main/PLUGINS.md',
											)
										}}
									>
										plugin API docs
									</a>
									.
								</p>
								<label className="wide">
									<span>Enable plugins</span>
									<input
										type="checkbox"
										checked={settings.plugins?.enabled === true}
										onChange={e =>
											set({
												plugins: {enabled: e.target.checked},
											})
										}
									/>
								</label>
								<div className="settings-btn-row">
									<button
										type="button"
										className="settings-btn"
										onClick={() => void termApi()?.pluginOpenDir()}
									>
										Open plugins folder
									</button>
									<button
										type="button"
										className="settings-btn"
										disabled={!settings.plugins?.enabled}
										onClick={() =>
											void termApi()
												?.pluginReload()
												.then(s => setPluginStatus(s as typeof pluginStatus))
										}
									>
										Reload plugins
									</button>
								</div>
								{pluginStatus && (
									<>
										<h3>Loaded ({pluginStatus.loaded.length})</h3>
										{pluginStatus.loaded.length === 0 ? (
											<p className="footer-dim">No plugins loaded.</p>
										) : (
											<ul className="plugin-list">
												{pluginStatus.loaded.map(p => (
													<li key={p.name}>
														<strong>{p.name}</strong>
														{p.commands.length > 0 && (
															<span className="footer-dim">
																{' '}
																· {p.commands.length} command
																{p.commands.length === 1 ? '' : 's'}
															</span>
														)}
													</li>
												))}
											</ul>
										)}
										{pluginStatus.errors.length > 0 && (
											<>
												<h3>Errors</h3>
												<ul className="plugin-list plugin-list-errors">
													{pluginStatus.errors.map(e => (
														<li key={e.name}>
															<strong>{e.name}</strong>:{' '}
															<span className="footer-dim">{e.error}</span>
														</li>
													))}
												</ul>
											</>
										)}
									</>
								)}
							</section>
						)}
						{tab === 'sync' && (
							<>
								<SyncSection onSettingsPulled={onChange} />
								<section>
									<h3>Backup & updates</h3>
									<label>
										<input
											type="checkbox"
											checked={settings.window.checkUpdatesOnStartup !== false}
											onChange={e =>
												set({
													window: {
														...settings.window,
														checkUpdatesOnStartup: e.target.checked,
													},
												})
											}
										/>{' '}
										Check for updates on startup (packaged installs)
									</label>
									<div className="settings-btn-row">
										<button
											type="button"
											className="settings-btn"
											onClick={() => {
												void termApi()
													?.settingsExport()
													.then(r => {
														if (!r.ok && r.error !== 'canceled')
															window.alert(r.error || 'Export failed')
													})
											}}
										>
											Export settings…
										</button>
										<button
											type="button"
											className="settings-btn"
											onClick={() => {
												void termApi()
													?.settingsImport()
													.then(r => {
														if (!r.ok) {
															if (r.error !== 'canceled')
																window.alert(r.error || 'Import failed')
															return
														}
														if (r.settings) onChange(r.settings as AppSettings)
													})
											}}
										>
											Import settings…
										</button>
										<button
											type="button"
											className="settings-btn"
											onClick={() => {
												void termApi()
													?.updateCheck()
													.then(async s => {
														const st = s as {
															state: string
															version?: string
															message?: string
															currentVersion: string
														}
														if (st.state === 'available') {
															const ok = await termApi()?.dialogConfirm({
																title: 'Update available',
																message: 'Download version ' + st.version + '?',
																detail: 'Current: ' + st.currentVersion,
																buttons: ['Download', 'Later'],
															})
															if (ok) {
																const d = await termApi()?.updateDownload()
																if (
																	d &&
																	(d as {state: string}).state === 'downloaded'
																) {
																	await termApi()?.updateInstall()
																}
															}
														} else if (st.message) {
															window.alert(st.message)
														}
													})
											}}
										>
											Check for updates…
										</button>
									</div>
								</section>
							</>
						)}
						{tab === 'window' && (
							<>
								<section>
									<h3>Window & Tray</h3>
									<label>
										<input
											type="checkbox"
											checked={settings.window.acrylic}
											onChange={e =>
												set({
													window: {
														...settings.window,
														acrylic: e.target.checked,
													},
												})
											}
										/>{' '}
										Windows 11 mica backdrop (title bar)
									</label>
									<label>
										<input
											type="checkbox"
											checked={settings.window.checkUpdatesOnStartup !== false}
											onChange={e =>
												set({
													window: {
														...settings.window,
														checkUpdatesOnStartup: e.target.checked,
													},
												})
											}
										/>{' '}
										Check for updates on startup (packaged installs)
									</label>
									<div className="settings-btn-row">
										<button
											type="button"
											className="settings-btn"
											onClick={() => {
												void termApi()
													?.settingsExport()
													.then(r => {
														if (!r.ok && r.error !== 'canceled')
															window.alert(r.error || 'Export failed')
													})
											}}
										>
											Export settings…
										</button>
										<button
											type="button"
											className="settings-btn"
											onClick={() => {
												void termApi()
													?.settingsImport()
													.then(r => {
														if (!r.ok) {
															if (r.error !== 'canceled')
																window.alert(r.error || 'Import failed')
															return
														}
														if (r.settings) onChange(r.settings as AppSettings)
													})
											}}
										>
											Import settings…
										</button>
										<button
											type="button"
											className="settings-btn"
											onClick={() => {
												void termApi()
													?.updateCheck()
													.then(async s => {
														const st = s as {
															state: string
															version?: string
															message?: string
															currentVersion: string
														}
														if (st.state === 'available') {
															const ok = await termApi()?.dialogConfirm({
																title: 'Update available',
																message: `Download version ${st.version}?`,
																detail: `Current: ${st.currentVersion}`,
																buttons: ['Download', 'Later'],
															})
															if (ok) {
																const d = await termApi()?.updateDownload()
																if (
																	d &&
																	(d as {state: string}).state === 'downloaded'
																) {
																	await termApi()?.updateInstall()
																}
															}
														} else if (st.message) {
															window.alert(st.message)
														}
													})
											}}
										>
											Check for updates…
										</button>
									</div>
									<label>
										<input
											type="checkbox"
											checked={settings.tray.enabled}
											onChange={e =>
												set({
													tray: {...settings.tray, enabled: e.target.checked},
												})
											}
										/>{' '}
										Enable system tray icon
									</label>
									<label>
										<input
											type="checkbox"
											checked={settings.tray.minimizeToTray}
											onChange={e =>
												set({
													tray: {
														...settings.tray,
														minimizeToTray: e.target.checked,
													},
												})
											}
										/>{' '}
										Minimize to tray
									</label>
									<label>
										<input
											type="checkbox"
											checked={settings.tray.closeToTray}
											onChange={e =>
												set({
													tray: {
														...settings.tray,
														closeToTray: e.target.checked,
													},
												})
											}
										/>{' '}
										Close button hides to tray (quit via tray menu)
									</label>
									<p className="footer-dim">
										Window size & position restore automatically on launch.
									</p>
								</section>

								<ExplorerSection />

								<section>
									<h3>Quake dropdown (global hotkey)</h3>
									<label>
										<input
											type="checkbox"
											checked={settings.quake.enabled}
											onChange={e =>
												set({
													quake: {...settings.quake, enabled: e.target.checked},
												})
											}
										/>{' '}
										Enable (summons the terminal from any app)
									</label>
									<label className="wide">
										Hotkey
										<HotkeyInput
											value={settings.quake.hotkey}
											ariaLabel="Quake hotkey"
											onChange={v =>
												set({
													quake: {...settings.quake, hotkey: v},
												})
											}
										/>
									</label>
									<p className="footer-dim">
										Must be free globally (Windows Terminal / PowerToys often
										own Ctrl+`). Default Alt+`; if denied we try Grave / Alt /
										Win variants.
									</p>
									<label>
										Height (%)
										<input
											type="number"
											min={20}
											max={90}
											value={settings.quake.heightPercent}
											onChange={e =>
												set({
													quake: {
														...settings.quake,
														heightPercent: Number(e.target.value),
													},
												})
											}
										/>
									</label>
									<label>
										<input
											type="checkbox"
											checked={settings.quake.hideOnFocusLoss}
											onChange={e =>
												set({
													quake: {
														...settings.quake,
														hideOnFocusLoss: e.target.checked,
													},
												})
											}
										/>{' '}
										Hide when focus is lost
									</label>
								</section>
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
