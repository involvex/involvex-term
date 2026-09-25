import {useEffect, useState} from 'react'
import type {AppSettings} from '../types'

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
	{id: 'close-pane', label: 'Close pane'},
	{id: 'zoom-in', label: 'Zoom in'},
	{id: 'zoom-out', label: 'Zoom out'},
	{id: 'zoom-reset', label: 'Zoom reset'},
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
						New tabs open here. Invalid paths fall back to the home folder.
					</p>
				</section>

				<section>
					<h3>Window & Tray</h3>
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
