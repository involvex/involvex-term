import {useEffect, useState} from 'react'
import {THEME_PRESETS} from '../lib/themePresets'
import {termApi, type AppSettings, type CommandSnippet} from '../types'

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
	{id: 'opencode', label: 'Open OpenCode'},
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

export default function SettingsModal({settings, onChange, onClose}: Props) {
	const set = (patch: Partial<AppSettings>) => onChange({...settings, ...patch})
	return (
		<div
			className="modal-backdrop"
			onClick={onClose}
		>
			<div
				className="modal"
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
								const preset = THEME_PRESETS.find(p => p.id === e.target.value)
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
									theme: {...settings.theme, fontFallback: e.target.value},
								})
							}
						/>
					</label>
				</section>

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
									startup: {...settings.startup, profileId: e.target.value},
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
						“Restore previous session” still needs Tabs → Restore enabled.
						Startup profile applies when opening a fresh tab on launch.
					</p>
				</section>

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
						Show OpenCode sessions
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
				</section>

				<section>
					<h3>Hotkeys</h3>
					<p className="footer-dim">
						Takes effect on restart of menu (applied live where possible).
						Format: Ctrl+Shift+T
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

				<section>
					<h3>Tabs</h3>
					<label>
						<input
							type="checkbox"
							checked={settings.tabs.confirmClose}
							onChange={e =>
								set({
									tabs: {...settings.tabs, confirmClose: e.target.checked},
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
									tabs: {...settings.tabs, restoreSession: e.target.checked},
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
									terminal: {...settings.terminal, startDir: e.target.value},
								})
							}
						/>
					</label>
					<p className="footer-dim">
						Used for new tabs and when Startup is “New tab”. With session
						restore enabled, previous tab folders are restored instead.
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
						New tabs use the default profile. Use ▾ next to + (or the command
						palette) for another shell. Custom profiles live in settings.json
						under <code>terminal.profiles</code>. Ctrl+click URLs and local
						paths to open them.
					</p>
				</section>

				<section>
					<h3>Command snippets</h3>
					<p className="footer-dim">
						Appear in the command palette as “Run: …”. Written into the focused
						pane.
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
									snippets: [...(settings.terminal.snippets ?? []), snip],
								},
							})
						}}
					>
						Add snippet
					</button>
				</section>

				<section>
					<h3>Window & Tray</h3>
					<label>
						<input
							type="checkbox"
							checked={settings.window.acrylic}
							onChange={e =>
								set({
									window: {...settings.window, acrylic: e.target.checked},
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
								set({tray: {...settings.tray, enabled: e.target.checked}})
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
									tray: {...settings.tray, minimizeToTray: e.target.checked},
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
									tray: {...settings.tray, closeToTray: e.target.checked},
								})
							}
						/>{' '}
						Close button hides to tray (quit via tray menu)
					</label>
					<p className="footer-dim">
						Window size & position restore automatically on launch.
					</p>
				</section>

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
						Must be free globally (Windows Terminal / PowerToys often own
						Ctrl+`). Default Alt+`; if denied we try Grave / Alt / Win variants.
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
			</div>
		</div>
	)
}
