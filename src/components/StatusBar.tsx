import type {AppSettings, GitStatus, OpencodeStatus, SysStats} from '../types'

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

export function GitWidget({status}: {status: GitStatus | null}) {
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
		`repo: ${status.repoRoot}`,
		`cwd: ${status.cwd}`,
		`staged: ${status.staged}, unstaged: ${status.unstaged}, untracked: ${status.untracked}`,
		`ahead ${status.ahead} / behind ${status.behind}, stash ${status.stashCount}`,
	].join('\n')
	return (
		<span
			className="footer-item"
			title={tip}
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
		</span>
	)
}

export function OpencodeWidget({
	status,
	onContinue,
}: {
	status: OpencodeStatus | null
	onContinue?: (sessionId?: string) => void
}) {
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
	if (!status.latest) {
		return (
			<button
				type="button"
				className="footer-item footer-dim footer-oc-btn"
				title="No sessions — click to start OpenCode (opencode -c)"
				onClick={() => onContinue?.()}
			>
				OC ·
			</button>
		)
	}
	const tip = [
		'Click to continue this session',
		`session: ${status.latest.id}`,
		`title: ${status.latest.title}`,
		`dir: ${status.latest.directory || '(none)'}`,
		status.projectMatch ? 'matches current cwd' : 'other project',
		`${status.sessionCount} recent session(s)`,
	].join('\n')
	return (
		<button
			type="button"
			className={`footer-item footer-oc-btn${status.projectMatch ? ' footer-oc-match' : ''}`}
			title={tip}
			onClick={() => onContinue?.(status.latest?.id)}
		>
			<span className="footer-oc-label">OC</span>
			{status.sessionCount > 1 && (
				<span className="footer-dim"> {status.sessionCount}</span>
			)}
			<span className="footer-oc-title">
				{' '}
				· {shortOcTitle(status.latest.title)}
			</span>
			{status.projectMatch && <span className="footer-oc-dot"> ●</span>}
		</button>
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
}: {
	git: GitStatus | null
	sys: SysStats | null
	opencode: OpencodeStatus | null
	settings: AppSettings
	cwd: string
	onOpencodeContinue?: (sessionId?: string) => void
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
						/>
					) : m === 'opencode' && settings.footer.showOpencode ? (
						<OpencodeWidget
							key="opencode"
							status={opencode}
							onContinue={onOpencodeContinue}
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
