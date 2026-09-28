import {useEffect, useState} from 'react'
import {termApi, type AppInfo} from '../types'

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
}

export default function AboutModal({onClose}: Props) {
	const [info, setInfo] = useState<AppInfo | null>(null)

	useEffect(() => {
		termApi()
			?.appInfo()
			.then(setInfo)
			.catch(() => setInfo(null))
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
