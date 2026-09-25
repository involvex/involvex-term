import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import {createPortal} from 'react-dom'
import {
	termApi,
	type AppSettings,
	type BranchList,
	type GitStatus,
	type OpencodeSession,
	type OpencodeStatus,
	type SysStats,
} from '../types'

function fmtUptime(sec: number): string {
	const h = Math.floor(sec / 3600)
	const m = Math.floor((sec % 3600) / 60)
	if (h > 0) return `${h}h ${m}m`
	return `${m}m`
}

function shortOcTitle(title: string, max = 28): string {
	const t = title.trim() || '(untitled)'
	return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function shortPath(p: string, max = 36): string {
	const t = p.trim()
	if (t.length <= max) return t
	return `…${t.slice(-(max - 1))}`
}

function FooterMenu({
	anchor,
	onClose,
	children,
	wide,
}: {
	anchor: DOMRect
	onClose: () => void
	children: ReactNode
	wide?: boolean
}) {
	const ref = useRef<HTMLDivElement>(null)
	const [pos, setPos] = useState({left: anchor.left, top: anchor.top})

	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const pad = 8
		const rect = el.getBoundingClientRect()
		let left = anchor.left
		let top = anchor.top - rect.height - 6
		if (top < pad) top = anchor.bottom + 6
		if (left + rect.width > window.innerWidth - pad)
			left = Math.max(pad, window.innerWidth - rect.width - pad)
		if (left < pad) left = pad
		setPos({left, top})
	}, [anchor])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		const onDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose()
		}
		window.addEventListener('keydown', onKey)
		window.addEventListener('mousedown', onDown, true)
		return () => {
			window.removeEventListener('keydown', onKey)
			window.removeEventListener('mousedown', onDown, true)
		}
	}, [onClose])

	return createPortal(
		<div
			ref={ref}
			className={`footer-menu${wide ? ' footer-menu-wide' : ''}`}
			style={{left: pos.left, top: pos.top}}
			role="menu"
		>
			{children}
		</div>,
		document.body,
	)
}

export function GitWidget({
	status,
	onRefreshed,
	onToast,
}: {
	status: GitStatus | null
	onRefreshed?: (s: GitStatus) => void
	onToast?: (msg: string) => void
}) {
	const btnRef = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [anchor, setAnchor] = useState<DOMRect | null>(null)
	const [branches, setBranches] = useState<BranchList | null>(null)
	const [loading, setLoading] = useState(false)
	const [view, setView] = useState<'main' | 'branches'>('main')

	if (!status || !status.repoRoot) {
		return (
			<span
				className="footer-item footer-dim"
				title="No git repository"
			>
				⎇ no repo
			</span>
		)
	}

	const dirtyCount = status.staged + status.unstaged + status.untracked
	const sync =
		status.ahead > 0 || status.behind > 0
			? ` ↑${status.ahead} ↓${status.behind}`
			: ' ✓'
	const tip = [
		'Click for git actions',
		`repo: ${status.repoRoot}`,
		`cwd: ${status.cwd}`,
		`staged: ${status.staged}, unstaged: ${status.unstaged}, untracked: ${status.untracked}`,
		`ahead ${status.ahead} / behind ${status.behind}, stash ${status.stashCount}`,
	].join('\n')

	const openMenu = () => {
		const r = btnRef.current?.getBoundingClientRect()
		if (!r) return
		setAnchor(r)
		setView('main')
		setBranches(null)
		setOpen(true)
	}

	const loadBranches = async () => {
		const api = termApi()
		if (!api || !status.cwd) return
		setLoading(true)
		try {
			const list = await api.gitBranches(status.cwd)
			setBranches(list)
			setView('branches')
		} catch (e) {
			onToast?.(e instanceof Error ? e.message : String(e))
		} finally {
			setLoading(false)
		}
	}

	const doCheckout = async (branch: string) => {
		const api = termApi()
		if (!api || !status.cwd) return
		if (branch === status.branch) {
			setOpen(false)
			return
		}
		if (status.isDirty) {
			const ok = await api.dialogConfirm({
				title: 'Switch branch',
				message: `Working tree has changes. Checkout "${branch}" anyway?`,
				detail: 'Uncommitted changes may block or carry over.',
				buttons: ['Checkout', 'Cancel'],
			})
			if (!ok) return
		}
		setLoading(true)
		try {
			const res = await api.gitCheckout(status.cwd, branch)
			if (!res.ok) {
				onToast?.(res.error || 'Checkout failed')
				return
			}
			const next = await api.gitGet(status.cwd)
			onRefreshed?.(next)
			onToast?.(`Checked out ${res.branch || branch}`)
			setOpen(false)
		} catch (e) {
			onToast?.(e instanceof Error ? e.message : String(e))
		} finally {
			setLoading(false)
		}
	}

	const openExplorer = () => {
		const api = termApi()
		if (!api || !status.repoRoot) return
		void api.openPath(status.repoRoot)
		setOpen(false)
	}

	const copyRemote = async () => {
		const api = termApi()
		if (!api || !status.cwd) return
		try {
			const url = await api.gitRemoteUrl(status.cwd)
			if (!url) {
				onToast?.('No remote URL found')
				return
			}
			await api.clipboardWrite(url)
			onToast?.('Remote URL copied')
			setOpen(false)
		} catch (e) {
			onToast?.(e instanceof Error ? e.message : String(e))
		}
	}

	const copyBranch = async () => {
		const api = termApi()
		if (!api || !status.branch) return
		await api.clipboardWrite(status.branch)
		onToast?.('Branch name copied')
		setOpen(false)
	}

	return (
		<>
			<button
				ref={btnRef}
				type="button"
				className="footer-item footer-git-btn"
				title={tip}
				onClick={openMenu}
			>
				<span className="footer-branch">⎇ {status.branch || '(detached)'}</span>
				<span
					className={status.isDirty ? 'footer-dirty' : 'footer-clean'}
					title={`${dirtyCount} changed`}
				>
					{status.isDirty ? ` ●${dirtyCount}` : ' ○'}
				</span>
				<span className="footer-sync">{sync}</span>
				{status.stashCount > 0 && (
					<span className="footer-dim"> ⚑{status.stashCount}</span>
				)}
			</button>
			{open && anchor && (
				<FooterMenu
					anchor={anchor}
					onClose={() => setOpen(false)}
					wide={view === 'branches'}
				>
					{view === 'main' ? (
						<>
							<button
								type="button"
								className="footer-menu-item"
								role="menuitem"
								disabled={loading}
								onClick={() => void loadBranches()}
							>
								Switch branch…
							</button>
							<button
								type="button"
								className="footer-menu-item"
								role="menuitem"
								onClick={openExplorer}
							>
								Open in Explorer
							</button>
							<button
								type="button"
								className="footer-menu-item"
								role="menuitem"
								onClick={() => void copyRemote()}
							>
								Copy remote URL
							</button>
							<button
								type="button"
								className="footer-menu-item"
								role="menuitem"
								disabled={!status.branch}
								onClick={() => void copyBranch()}
							>
								Copy branch name
							</button>
							<div
								className="footer-menu-sep"
								role="separator"
							/>
							<div className="footer-menu-meta">
								{shortPath(status.repoRoot)}
							</div>
						</>
					) : (
						<>
							<button
								type="button"
								className="footer-menu-item footer-menu-back"
								onClick={() => setView('main')}
							>
								← Back
							</button>
							<div className="footer-menu-sep" />
							<div className="footer-menu-section">Local</div>
							{(branches?.local ?? []).map(b => (
								<button
									key={`l-${b}`}
									type="button"
									className={`footer-menu-item${b === branches?.current ? ' active' : ''}`}
									disabled={loading}
									onClick={() => void doCheckout(b)}
								>
									{b === branches?.current ? '● ' : '  '}
									{b}
								</button>
							))}
							{(branches?.remote.length ?? 0) > 0 && (
								<>
									<div className="footer-menu-sep" />
									<div className="footer-menu-section">Remote</div>
									{branches!.remote.map(b => (
										<button
											key={`r-${b}`}
											type="button"
											className="footer-menu-item"
											disabled={loading}
											onClick={() => void doCheckout(b)}
										>
											{'  '}
											{b}
										</button>
									))}
								</>
							)}
							{loading && <div className="footer-menu-meta">Loading…</div>}
						</>
					)}
				</FooterMenu>
			)}
		</>
	)
}

export function OpencodeWidget({
	status,
	cwd,
	onContinue,
	onNew,
}: {
	status: OpencodeStatus | null
	cwd?: string
	onContinue?: (sessionId?: string) => void
	onNew?: () => void
}) {
	const btnRef = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [anchor, setAnchor] = useState<DOMRect | null>(null)

	if (!status) {
		return (
			<span
				className="footer-item footer-dim"
				title="OpenCode status…"
			>
				OC …
			</span>
		)
	}
	if (!status.available) {
		return (
			<span
				className="footer-item footer-dim"
				title="OpenCode not found on PATH"
			>
				OC off
			</span>
		)
	}

	const sessions = status.sessions ?? []
	const cwdN = (cwd || '').replace(/[/\\]+$/, '').toLowerCase()
	const matches = (s: OpencodeSession) => {
		if (!cwdN || !s.directory) return false
		const d = s.directory.replace(/[/\\]+$/, '').toLowerCase()
		return d === cwdN || cwdN.startsWith(d + '\\') || cwdN.startsWith(d + '/')
	}

	const openPicker = () => {
		const r = btnRef.current?.getBoundingClientRect()
		if (!r) return
		setAnchor(r)
		setOpen(true)
	}

	const label = status.latest ? shortOcTitle(status.latest.title) : 'no session'

	return (
		<>
			<button
				ref={btnRef}
				type="button"
				className={`footer-item footer-oc-btn${status.projectMatch ? ' footer-oc-match' : ''}`}
				title={
					status.latest
						? [
								'Click to pick a session',
								`latest: ${status.latest.title}`,
								`${status.sessionCount} session(s)`,
							].join('\n')
						: 'Click to start or pick an OpenCode session'
				}
				onClick={openPicker}
			>
				<span className="footer-oc-label">OC</span>
				{status.sessionCount > 1 && (
					<span className="footer-dim"> {status.sessionCount}</span>
				)}
				<span className="footer-oc-title"> · {label}</span>
				{status.projectMatch && <span className="footer-oc-dot"> ●</span>}
			</button>
			{open && anchor && (
				<FooterMenu
					anchor={anchor}
					onClose={() => setOpen(false)}
					wide
				>
					<button
						type="button"
						className="footer-menu-item"
						role="menuitem"
						onClick={() => {
							onNew?.()
							setOpen(false)
						}}
					>
						New session
					</button>
					<button
						type="button"
						className="footer-menu-item"
						role="menuitem"
						onClick={() => {
							onContinue?.()
							setOpen(false)
						}}
					>
						Continue last (`opencode -c`)
					</button>
					{sessions.length > 0 && (
						<>
							<div
								className="footer-menu-sep"
								role="separator"
							/>
							<div className="footer-menu-section">Sessions</div>
							{sessions.map(s => {
								const match = matches(s)
								const active = status.latest?.id === s.id
								return (
									<button
										key={s.id}
										type="button"
										className={`footer-menu-item footer-menu-session${active ? ' active' : ''}${match ? ' match' : ''}`}
										role="menuitem"
										title={[s.title, s.directory, s.id]
											.filter(Boolean)
											.join('\n')}
										onClick={() => {
											onContinue?.(s.id)
											setOpen(false)
										}}
									>
										<span className="footer-menu-session-title">
											{match ? '● ' : active ? '· ' : '  '}
											{shortOcTitle(s.title, 40)}
										</span>
										{s.directory ? (
											<span className="footer-menu-session-dir">
												{shortPath(s.directory, 28)}
											</span>
										) : null}
									</button>
								)
							})}
						</>
					)}
					{sessions.length === 0 && (
						<div className="footer-menu-meta">No recent sessions</div>
					)}
				</FooterMenu>
			)}
		</>
	)
}

export function SysWidget({
	stats,
	settings,
}: {
	stats: SysStats | null
	settings: AppSettings
}) {
	if (!stats) return <span className="footer-item footer-dim">…</span>
	const tip = `CPU ${stats.cpuPercent}%\nMEM ${stats.memUsedGB}/${stats.memTotalGB} GB (${stats.memPercent}%)\nuptime ${fmtUptime(stats.uptimeSec)}`
	return (
		<span
			className="footer-item"
			title={tip}
		>
			{settings.footer.showCpu && <span>CPU {stats.cpuPercent}%</span>}
			{settings.footer.showCpu && settings.footer.showMem && (
				<span className="footer-sep"> | </span>
			)}
			{settings.footer.showMem && (
				<span>
					MEM {stats.memUsedGB}/{stats.memTotalGB}G {stats.memPercent}%
				</span>
			)}
		</span>
	)
}

function footerOrder(settings: AppSettings): string[] {
	const order = settings.footer.modulesOrder?.length
		? [...settings.footer.modulesOrder]
		: ['git', 'opencode', 'sys']
	if (settings.footer.showOpencode && !order.includes('opencode')) {
		const gi = order.indexOf('git')
		order.splice(gi >= 0 ? gi + 1 : 0, 0, 'opencode')
	}
	return order
}

export default function StatusBar({
	git,
	sys,
	opencode,
	settings,
	cwd,
	onOpencodeContinue,
	onOpencodeNew,
	onGitRefreshed,
	onToast,
}: {
	git: GitStatus | null
	sys: SysStats | null
	opencode: OpencodeStatus | null
	settings: AppSettings
	cwd: string
	onOpencodeContinue?: (sessionId?: string) => void
	onOpencodeNew?: () => void
	onGitRefreshed?: (s: GitStatus) => void
	onToast?: (msg: string) => void
}) {
	const order = footerOrder(settings)
	return (
		<footer className="statusbar">
			<div className="statusbar-left">
				{order.map(m =>
					m === 'git' && settings.footer.showGit ? (
						<GitWidget
							key="git"
							status={git}
							onRefreshed={onGitRefreshed}
							onToast={onToast}
						/>
					) : m === 'opencode' && settings.footer.showOpencode ? (
						<OpencodeWidget
							key="opencode"
							status={opencode}
							cwd={cwd}
							onContinue={onOpencodeContinue}
							onNew={onOpencodeNew}
						/>
					) : m === 'sys' && settings.footer.showSys ? (
						<SysWidget
							key="sys"
							stats={sys}
							settings={settings}
						/>
					) : null,
				)}
			</div>
			<div className="statusbar-right">
				<span
					className="footer-item footer-dim footer-cwd"
					title={cwd}
				>
					{cwd}
				</span>
			</div>
		</footer>
	)
}
