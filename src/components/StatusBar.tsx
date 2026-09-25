import type {AppSettings, GitStatus, SysStats} from '../types'

function fmtUptime(sec: number): string {
	const h = Math.floor(sec / 3600)
	const m = Math.floor((sec % 3600) / 60)
	if (h > 0) return `${h}h ${m}m`
	return `${m}m`
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

export default function StatusBar({
	git,
	sys,
	settings,
	cwd,
}: {
	git: GitStatus | null
	sys: SysStats | null
	settings: AppSettings
	cwd: string
}) {
	const order = settings.footer.modulesOrder?.length
		? settings.footer.modulesOrder
		: ['git', 'sys']
	return (
		<footer className="statusbar">
			<div className="statusbar-left">
				{order.map(m =>
					m === 'git' && settings.footer.showGit ? (
						<GitWidget
							key="git"
							status={git}
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
