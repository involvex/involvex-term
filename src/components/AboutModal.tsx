import {useEffect, useState} from 'react'
import {termApi, type AppInfo, type UpdateStatus} from '../types'

const LINKS: Array<{label: string; text: string; url: string}> = [
	{
		label: 'Repository',
		text: 'github.com/involvex/involvex-term',
		url: 'https://github.com/involvex/involvex-term',
	},
	{
		label: 'Docs',
		text: 'involvex.github.io/involvex-term',
		url: 'https://involvex.github.io/involvex-term/',
	},
	{
		label: 'Funding',
		text: 'github.com/sponsors/involvex',
		url: 'https://github.com/sponsors/involvex',
	},
	{
		label: 'Author',
		text: 'involvex',
		url: 'https://github.com/involvex',
	},
	{
		label: 'Issues',
		text: 'Report a bug / request a feature',
		url: 'https://github.com/involvex/involvex-term/issues',
	},
]

interface Props {
	onClose: () => void
	onCheckUpdates?: () => Promise<void>
	onToast?: (msg: string) => void
}

export default function AboutModal({onClose, onCheckUpdates, onToast}: Props) {
	const [info, setInfo] = useState<AppInfo | null>(null)
	const [update, setUpdate] = useState<UpdateStatus | null>(null)
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		termApi()
			?.appInfo()
			.then(setInfo)
			.catch(() => setInfo(null))
		const api = termApi()
		if (!api) return
		void api
			.updateStatus()
			.then(setUpdate)
			.catch(() => undefined)
		return api.onUpdateStatus(s => setUpdate(s as UpdateStatus))
	}, [])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const open = (url: string) => {
		const api = termApi()
		if (api) void api.openExternal(url)
		else window.open(url, '_blank', 'noopener')
	}

	const runtime = info
		? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node} · ${info.platform}`
		: ''

	const updateLabel = (() => {
		if (!update) return 'Checking updates…'
		switch (update.state) {
			case 'idle':
				return `Current: ${update.currentVersion}`
			case 'checking':
				return update.message || 'Checking for updates…'
			case 'available':
				return update.message || `Update ${update.version} available`
			case 'not-available':
				return update.message || `Up to date (${update.currentVersion})`
			case 'downloading':
				return (
					update.message ||
					`Downloading… ${update.percent != null ? `${update.percent}%` : ''}`
				)
			case 'downloaded':
				return (
					update.message ||
					`Update ${update.version} ready — restart to install`
				)
			case 'error':
				return update.message || 'Update check failed'
			default:
				return update.message || ''
		}
	})()

	const runCheck = async () => {
		if (busy) return
		setBusy(true)
		try {
			if (onCheckUpdates) await onCheckUpdates()
			else {
				const api = termApi()
				if (!api) return
				const s = await api.updateCheck()
				setUpdate(s)
				onToast?.(s.message || 'Checked for updates')
			}
			const api = termApi()
			if (api) setUpdate(await api.updateStatus())
		} finally {
			setBusy(false)
		}
	}

	const runDownload = async () => {
		const api = termApi()
		if (!api || busy) return
		setBusy(true)
		try {
			const s = await api.updateDownload()
			setUpdate(s)
			onToast?.(s.message || 'Download started')
		} finally {
			setBusy(false)
		}
	}

	const runInstall = async () => {
		const api = termApi()
		if (!api || busy) return
		setBusy(true)
		try {
			await api.updateInstall()
		} finally {
			setBusy(false)
		}
	}

	return (
		<div
			className="modal-backdrop"
			onClick={onClose}
		>
			<div
				className="modal about-modal"
				onClick={e => e.stopPropagation()}
				role="dialog"
				aria-label="About Involvex-Term"
			>
				<div className="modal-header">
					<img
						className="about-icon"
						src="icon.png"
						alt=""
						width={40}
						height={40}
					/>
					<div className="about-title">
						<h2>Involvex-Term</h2>
						<span className="footer-dim">
							Version {info?.version ?? '…'} · MIT License
						</span>
					</div>
					<button
						type="button"
						className="tab-close about-close"
						onClick={onClose}
						aria-label="Close about"
					>
						×
					</button>
				</div>
				<p className="about-tagline">
					Minimalist dark Git-aware terminal (Electron + xterm.js + node-pty)
				</p>
				<div className="about-update">
					<p className="about-update-status footer-dim">{updateLabel}</p>
					{update?.state === 'downloading' && update.percent != null && (
						<div
							className="about-update-bar"
							role="progressbar"
							aria-valuenow={update.percent}
							aria-valuemin={0}
							aria-valuemax={100}
						>
							<div
								className="about-update-bar-fill"
								style={{
									width: `${Math.min(100, Math.max(0, update.percent))}%`,
								}}
							/>
						</div>
					)}
					<div className="settings-btn-row about-update-actions">
						<button
							type="button"
							className="settings-btn"
							disabled={busy || update?.state === 'downloading'}
							onClick={() => void runCheck()}
						>
							Check for updates
						</button>
						{update?.state === 'available' && (
							<button
								type="button"
								className="settings-btn"
								disabled={busy}
								onClick={() => void runDownload()}
							>
								Download {update.version}
							</button>
						)}
						{update?.state === 'downloaded' && (
							<button
								type="button"
								className="settings-btn"
								disabled={busy}
								onClick={() => void runInstall()}
							>
								Restart to install
							</button>
						)}
					</div>
				</div>
				<dl className="about-links">
					{LINKS.map(l => (
						<div
							key={l.label}
							className="about-row"
						>
							<dt>{l.label}</dt>
							<dd>
								<a
									href={l.url}
									onClick={e => {
										e.preventDefault()
										open(l.url)
									}}
									title={l.url}
								>
									{l.text}
								</a>
							</dd>
						</div>
					))}
				</dl>
				{runtime && <p className="about-runtime footer-dim">{runtime}</p>}
				<div className="settings-btn-row about-actions">
					<button
						type="button"
						className="settings-btn"
						onClick={() => {
							const text =
								`Involvex-Term ${info?.version ?? ''}\n${runtime}`.trim()
							const api = termApi()
							void (
								api
									? api.clipboardWrite(text)
									: navigator.clipboard.writeText(text)
							).catch(() => undefined)
						}}
					>
						Copy version info
					</button>
					<button
						type="button"
						className="settings-btn"
						onClick={() => open('https://github.com/sponsors/involvex')}
					>
						♥ Sponsor
					</button>
					<button
						type="button"
						className="settings-btn"
						onClick={onClose}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	)
}
