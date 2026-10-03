import {
	memo,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type DragEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
} from 'react'
import {createPortal} from 'react-dom'
import {resolveActiveAgent} from '../lib/agents'
import {
	termApi,
	type AppSettings,
	type BranchList,
	type GitStatus,
	type OpencodeSession,
	type OpencodeStatus,
	type SysStats,
} from '../types'
import TermContextMenu, {
	type ContextMenuItem,
	type TermContextMenuState,
} from './TermContextMenu'

const FOOTER_MODULES = ['git', 'opencode', 'sys', 'cwd'] as const

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

export const GitWidget = memo(function GitWidget({
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
	/** Cwd of the in-flight details fetch (dedupes menu re-opens). */
	const detailsInFlight = useRef<string | null>(null)
	/** Last completed details fetch per cwd — re-opens within TTL reuse it. */
	const detailsFetchedAt = useRef(new Map<string, number>())
	const DETAILS_TTL_MS = 10_000

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
		// Lazy details: footer hot path carries base status only (no stash /
		// ahead-behind spawns). Enrich on open; the footer button updates
		// when the result lands via onRefreshed.
		const api = termApi()
		const cwd = status.cwd
		if (!api || !cwd || detailsInFlight.current === cwd) return
		const last = detailsFetchedAt.current.get(cwd) ?? 0
		if (Date.now() - last < DETAILS_TTL_MS) return
		detailsInFlight.current = cwd
		void api
			.gitGetDetails(cwd)
			.then(next => {
				if (detailsInFlight.current !== cwd) return
				detailsInFlight.current = null
				detailsFetchedAt.current.set(cwd, Date.now())
				onRefreshed?.(next)
			})
			.catch(() => {
				if (detailsInFlight.current === cwd) detailsInFlight.current = null
			})
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
})

export const OpencodeWidget = memo(function OpencodeWidget({
	status,
	cwd,
	agentLabel = 'OC',
	agentName = 'OpenCode',
	sessionProvider = 'opencode',
	onContinue,
	onNew,
}: {
	status: OpencodeStatus | null
	cwd?: string
	agentLabel?: string
	agentName?: string
	sessionProvider?: 'opencode' | 'none'
	onContinue?: (sessionId?: string) => void
	onNew?: () => void
}) {
	const btnRef = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [anchor, setAnchor] = useState<DOMRect | null>(null)
	/** Full-depth status for the open picker (footer poll carries 10). */
	const [fullStatus, setFullStatus] = useState<OpencodeStatus | null>(null)
	const [fullLoading, setFullLoading] = useState(false)
	/** Cwd key of the in-flight full fetch (dedupes re-opens). */
	const fullFetchKey = useRef<string | null>(null)

	if (sessionProvider !== 'opencode') {
		return (
			<button
				type="button"
				className="footer-item footer-oc-btn"
				title={`Launch ${agentName}`}
				onClick={() => onNew?.()}
			>
				<span className="footer-oc-label">{agentLabel}</span>
				<span className="footer-oc-title"> · {agentName}</span>
			</button>
		)
	}

	if (!status) {
		return (
			<span
				className="footer-item footer-dim"
				title={`${agentName} status…`}
			>
				{agentLabel} …
			</span>
		)
	}
	if (!status.available) {
		return (
			<span
				className="footer-item footer-dim"
				title={`${agentName} not found on PATH`}
			>
				{agentLabel} off
			</span>
		)
	}

	const sessions = fullStatus?.sessions ?? status.sessions ?? []
	/** Footer count is capped at the poll depth: mark it as a lower bound. */
	const shownCount = fullStatus?.sessions.length ?? status.sessionCount
	const countCapped = fullStatus ? fullStatus.truncated : status.truncated
	const cwdN = (cwd || '').replace(/[/\\]+$/, '').toLowerCase()
	const matches = (s: OpencodeSession) => {
		if (!cwdN || !s.directory) return false
		const d = s.directory.replace(/[/\\]+$/, '').toLowerCase()
		return d === cwdN || cwdN.startsWith(d + '\\') || cwdN.startsWith(d + '/')
	}

	const closePicker = () => {
		setOpen(false)
		setFullStatus(null)
		setFullLoading(false)
	}

	const openPicker = () => {
		const r = btnRef.current?.getBoundingClientRect()
		if (!r) return
		setAnchor(r)
		setOpen(true)
		// Lazy depth: the footer poll carries 10; fetch the full 30 only
		// when the picker opens and the poll list hit its cap. Widget-local
		// state keeps the poll loop untouched.
		if (!status.truncated) {
			setFullStatus(null)
			return
		}
		const api = termApi()
		const key = cwd ?? ''
		if (!api || fullFetchKey.current === key) return
		fullFetchKey.current = key
		setFullLoading(true)
		void api
			.opencodeStatus(cwd, 30)
			.then(s => {
				if (fullFetchKey.current !== key) return
				fullFetchKey.current = null
				setFullLoading(false)
				setFullStatus(s)
			})
			.catch(() => {
				if (fullFetchKey.current !== key) return
				fullFetchKey.current = null
				setFullLoading(false)
			})
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
								`${shownCount}${countCapped ? '+' : ''} session(s)`,
							].join('\n')
						: `Click to start or pick a ${agentName} session`
				}
				onClick={openPicker}
			>
				<span className="footer-oc-label">{agentLabel}</span>
				{shownCount > 1 && (
					<span className="footer-dim">
						{' '}
						{shownCount}
						{countCapped ? '+' : ''}
					</span>
				)}
				<span className="footer-oc-title"> · {label}</span>
				{status.projectMatch && <span className="footer-oc-dot"> ●</span>}
			</button>
			{open && anchor && (
				<FooterMenu
					anchor={anchor}
					onClose={closePicker}
					wide
				>
					<button
						type="button"
						className="footer-menu-item"
						role="menuitem"
						onClick={() => {
							onNew?.()
							closePicker()
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
							closePicker()
						}}
					>
						Continue last
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
											closePicker()
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
					{fullLoading && <div className="footer-menu-meta">Loading more…</div>}
					{sessions.length === 0 && !fullLoading && (
						<div className="footer-menu-meta">No recent sessions</div>
					)}
				</FooterMenu>
			)}
		</>
	)
})

export const SysWidget = memo(function SysWidget({
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
})

function footerOrder(settings: AppSettings): string[] {
	const order = settings.footer.modulesOrder?.length
		? [...settings.footer.modulesOrder]
		: ['git', 'opencode', 'sys', 'cwd']
	for (const id of FOOTER_MODULES) {
		if (!order.includes(id)) order.push(id)
	}
	return order.filter(m => (FOOTER_MODULES as readonly string[]).includes(m))
}

function moduleVisible(settings: AppSettings, m: string): boolean {
	if (m === 'git') return settings.footer.showGit
	if (m === 'opencode') return settings.footer.showOpencode
	if (m === 'sys') return settings.footer.showSys
	if (m === 'cwd') return settings.footer.showCwd !== false
	return false
}

function moduleLabel(m: string): string {
	if (m === 'git') return 'Git'
	if (m === 'opencode') return 'Agent'
	if (m === 'sys') return 'PC stats'
	if (m === 'cwd') return 'Path'
	return m
}

function StatusBarEditItem({
	index,
	label,
	hidden,
	onReorder,
	children,
}: {
	index: number
	label: string
	hidden: boolean
	onReorder: (from: number, to: number) => void
	children: ReactNode
}) {
	return (
		<span
			className={`statusbar-edit-item${hidden ? ' statusbar-edit-hidden' : ''}`}
			draggable
			onDragStart={e => {
				e.dataTransfer.setData('text/plain', String(index))
				e.dataTransfer.effectAllowed = 'move'
			}}
			onDragOver={e => {
				e.preventDefault()
			}}
			onDrop={(e: DragEvent) => {
				e.preventDefault()
				const from = Number(e.dataTransfer.getData('text/plain'))
				if (Number.isNaN(from)) return
				onReorder(from, index)
			}}
			title="Drag to reorder"
		>
			<span className="statusbar-edit-label">{label}</span>
			{!hidden ? children : null}
		</span>
	)
}

export default memo(function StatusBar({
	git,
	sys,
	opencode,
	settings,
	cwd,
	onSettingsChange,
	onOpencodeContinue,
	onOpencodeNew,
	onGitRefreshed,
	onToast,
	pluginSegments = [],
}: {
	git: GitStatus | null
	sys: SysStats | null
	opencode: OpencodeStatus | null
	settings: AppSettings
	cwd: string
	onSettingsChange?: (next: AppSettings) => void
	onOpencodeContinue?: (sessionId?: string) => void
	onOpencodeNew?: () => void
	onGitRefreshed?: (s: GitStatus) => void
	onToast?: (msg: string) => void
	pluginSegments?: Array<{id: string; text: string; title?: string}>
}) {
	const order = footerOrder(settings)
	const activeAgent = resolveActiveAgent(
		settings.agent?.tools,
		settings.agent?.activeId,
	)
	const [editMode, setEditMode] = useState(false)
	const [ctxMenu, setCtxMenu] = useState<TermContextMenuState | null>(null)

	const patchFooter = (patch: Partial<AppSettings['footer']>) => {
		onSettingsChange?.({
			...settings,
			footer: {...settings.footer, ...patch},
		})
	}

	useEffect(() => {
		if (!editMode) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setEditMode(false)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [editMode])

	const openFooterMenu = (e: ReactMouseEvent) => {
		e.preventDefault()
		const toggle = (key: keyof AppSettings['footer'], label: string) => {
			const cur = settings.footer[key]
			if (typeof cur !== 'boolean') return
			return {
				id: `toggle-${key}`,
				label,
				icon: cur ? ('check' as const) : undefined,
				run: () => patchFooter({[key]: !cur}),
			} satisfies ContextMenuItem
		}
		const items: ContextMenuItem[] = [
			toggle('showGit', 'Show Git')!,
			toggle('showOpencode', 'Show agent')!,
			toggle('showSys', 'Show PC stats')!,
			toggle('showCpu', 'Show CPU')!,
			toggle('showMem', 'Show Memory')!,
			toggle('showCwd', 'Show path')!,
			{id: 'sep', label: '', separator: true},
			{
				id: 'edit',
				label: editMode ? 'Done customizing' : 'Customize layout…',
				run: () => setEditMode(v => !v),
			},
		]
		setCtxMenu({
			x: e.clientX,
			y: e.clientY,
			hit: null,
			hasSelection: false,
			items,
		})
	}

	const reorder = (from: number, to: number) => {
		if (from === to) return
		const next = [...order]
		const [moved] = next.splice(from, 1)
		if (!moved) return
		next.splice(to, 0, moved)
		patchFooter({modulesOrder: next})
	}

	const renderModule = (m: string, i: number) => {
		const visible = moduleVisible(settings, m)
		if (!editMode && !visible) return null

		const body =
			m === 'git' && visible ? (
				<GitWidget
					status={git}
					onRefreshed={onGitRefreshed}
					onToast={onToast}
				/>
			) : m === 'opencode' && visible ? (
				<OpencodeWidget
					status={opencode}
					cwd={cwd}
					agentLabel={activeAgent.label}
					agentName={activeAgent.name}
					sessionProvider={activeAgent.sessionProvider}
					onContinue={onOpencodeContinue}
					onNew={onOpencodeNew}
				/>
			) : m === 'sys' && visible ? (
				<SysWidget
					stats={sys}
					settings={settings}
				/>
			) : m === 'cwd' && visible ? (
				<span
					className={`footer-item footer-dim footer-cwd${
						[...order].reverse().find(x => moduleVisible(settings, x)) ===
							'cwd' && !editMode
							? ' footer-cwd-end'
							: ''
					}`}
					title={cwd}
				>
					{cwd}
				</span>
			) : null

		if (editMode) {
			return (
				<StatusBarEditItem
					key={m}
					index={i}
					label={moduleLabel(m)}
					hidden={!visible}
					onReorder={reorder}
				>
					{body}
				</StatusBarEditItem>
			)
		}
		return body ? <span key={m}>{body}</span> : null
	}

	return (
		<footer
			className={`statusbar${editMode ? ' statusbar-editing' : ''}`}
			onContextMenu={openFooterMenu}
		>
			<div className="statusbar-modules">
				{order.map((m, i) => renderModule(m, i))}
			</div>
			{pluginSegments.length > 0 && (
				<div className="statusbar-plugins">
					{pluginSegments.map(seg => (
						<span
							key={seg.id}
							className="footer-item footer-dim statusbar-plugin-segment"
							title={seg.title}
						>
							{seg.text}
						</span>
					))}
				</div>
			)}
			{editMode && (
				<button
					type="button"
					className="statusbar-done"
					onClick={() => setEditMode(false)}
				>
					Done
				</button>
			)}
			{ctxMenu && (
				<TermContextMenu
					menu={ctxMenu}
					onClose={() => setCtxMenu(null)}
				/>
			)}
		</footer>
	)
})
