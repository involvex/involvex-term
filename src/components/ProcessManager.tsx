import {useEffect, useMemo, useRef, useState} from 'react'
import {
	ariaSortFor,
	filterProcs,
	formatKBs,
	formatMemMB,
	sortProcs,
	type ProcSortKey,
	type SortDir,
} from '../lib/procList'
import {termApi, type ProcInfo} from '../types'
import TermContextMenu, {type TermContextMenuState} from './TermContextMenu'

interface Props {
	bg: string
	fg: string
	/** Background-refreshed cache from App — seeds rows instantly on open. */
	initialProcs?: ProcInfo[]
	onClose: () => void
	onToast: (msg: string) => void
	/** Lift live rows back to App so the cache stays fresh after close. */
	onProcs?: (list: ProcInfo[]) => void
}

const COLUMNS: Array<{key: ProcSortKey; label: string; title: string}> = [
	{key: 'name', label: 'Name', title: 'Sort by process name'},
	{key: 'pid', label: 'PID', title: 'Sort by process ID'},
	{key: 'cpu', label: 'CPU %', title: 'Sort by CPU usage (%)'},
	{key: 'mem', label: 'MEM %', title: 'Sort by share of total RAM (%)'},
	{
		key: 'memRssMB',
		label: 'RSS',
		title: 'Sort by resident memory (working set)',
	},
	{
		key: 'disk',
		label: 'Disk I/O',
		title: 'Sort by disk I/O rate (read+write KB/s)',
	},
	{key: 'path', label: 'Path', title: 'Sort by executable path'},
]

const INTERVAL_KEY = 'involvex-term:proc-interval'
const SORT_KEY = 'involvex-term:proc-sort'
const SORT_DIR_KEY = 'involvex-term:proc-sort-dir'

const SORT_KEYS: ProcSortKey[] = [
	'name',
	'pid',
	'cpu',
	'mem',
	'memRssMB',
	'disk',
	'path',
]

function loadInterval(): number {
	try {
		const v = Number(localStorage.getItem(INTERVAL_KEY))
		if ([1000, 2000, 5000, 0].includes(v)) return v
	} catch {
		/* ignore */
	}
	return 2000
}

function loadSortKey(): ProcSortKey {
	try {
		const v = localStorage.getItem(SORT_KEY)
		if (v && (SORT_KEYS as string[]).includes(v)) return v as ProcSortKey
	} catch {
		/* ignore */
	}
	return 'cpu'
}

function loadSortDir(): SortDir {
	try {
		const v = localStorage.getItem(SORT_DIR_KEY)
		if (v === 'asc' || v === 'desc') return v
	} catch {
		/* ignore */
	}
	return 'desc'
}

export default function ProcessManager({
	bg,
	fg,
	initialProcs = [],
	onClose,
	onToast,
	onProcs,
}: Props) {
	const [procs, setProcs] = useState<ProcInfo[]>(initialProcs)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(initialProcs.length === 0)
	const [query, setQuery] = useState('')
	const [sortKey, setSortKey] = useState<ProcSortKey>(loadSortKey)
	const [sortDir, setSortDir] = useState<SortDir>(loadSortDir)
	const [intervalMs, setIntervalMs] = useState<number>(loadInterval)
	const [selectedPid, setSelectedPid] = useState<number | null>(null)
	const [killing, setKilling] = useState<number | null>(null)
	const [ctx, setCtx] = useState<TermContextMenuState | null>(null)
	const inFlight = useRef(false)
	const procsRef = useRef<ProcInfo[]>([])
	useEffect(() => {
		procsRef.current = procs
	}, [procs])
	const onProcsRef = useRef(onProcs)
	useEffect(() => {
		onProcsRef.current = onProcs
	}, [onProcs])

	const changeInterval = (v: number) => {
		setIntervalMs(v)
		try {
			localStorage.setItem(INTERVAL_KEY, String(v))
		} catch {
			/* ignore */
		}
	}

	useEffect(() => {
		const api = termApi()
		if (!api) {
			queueMicrotask(() => {
				setError('Process list needs Electron. Run bun run dev.')
				setLoading(false)
			})
			return
		}
		let cancelled = false
		const tick = async () => {
			if (inFlight.current) return
			if (typeof document !== 'undefined' && document.hidden) return
			inFlight.current = true
			try {
				const list = await api.procList()
				if (cancelled) return
				if (Array.isArray(list) && list.length > 0) {
					setProcs(list)
					onProcsRef.current?.(list)
				}
				setError(null)
			} catch (e) {
				if (cancelled) return
				// Keep the previous rows on transient failures.
				if (procsRef.current.length === 0)
					setError(e instanceof Error ? e.message : String(e))
			} finally {
				inFlight.current = false
				if (!cancelled) setLoading(false)
			}
		}
		void tick()
		if (intervalMs <= 0) return () => void (cancelled = true)
		const timer = setInterval(() => void tick(), Math.max(1000, intervalMs))
		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [intervalMs])

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (ctx) setCtx(null)
				else onClose()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [ctx, onClose])

	const rows = useMemo(
		() => sortProcs(filterProcs(procs, query), sortKey, sortDir),
		[procs, query, sortKey, sortDir],
	)

	const toggleSort = (key: ProcSortKey) => {
		if (key === sortKey) {
			const next = sortDir === 'asc' ? 'desc' : 'asc'
			setSortDir(next)
			try {
				localStorage.setItem(SORT_DIR_KEY, next)
			} catch {
				/* ignore */
			}
		} else {
			const nextDir = key === 'name' || key === 'path' ? 'asc' : 'desc'
			setSortKey(key)
			setSortDir(nextDir)
			try {
				localStorage.setItem(SORT_KEY, key)
				localStorage.setItem(SORT_DIR_KEY, nextDir)
			} catch {
				/* ignore */
			}
		}
	}

	const killPid = async (pid: number, name: string) => {
		const api = termApi()
		if (!api) return
		const ok = await api.dialogConfirm({
			title: 'Kill process',
			message: `Kill "${name}" (PID ${pid})?`,
			detail: 'The process will be terminated immediately.',
			buttons: ['Kill', 'Cancel'],
		})
		if (!ok) return
		setKilling(pid)
		try {
			const res = await api.procKill(pid)
			if (res.ok) {
				onToast(`Killed ${name} (${pid})`)
				setProcs(prev => {
					const next = prev.filter(p => p.pid !== pid)
					onProcsRef.current?.(next)
					return next
				})
			} else {
				onToast(res.error || `Failed to kill ${pid}`)
			}
		} catch (e) {
			onToast(e instanceof Error ? e.message : String(e))
		} finally {
			setKilling(null)
		}
	}

	const openCtx = (e: React.MouseEvent, proc: ProcInfo) => {
		e.preventDefault()
		e.stopPropagation()
		setSelectedPid(proc.pid)
		const hasPath = Boolean(proc.path)
		setCtx({
			x: e.clientX,
			y: e.clientY,
			hit: null,
			hasSelection: false,
			items: [
				{
					id: 'open',
					label: 'Open folder',
					disabled: !hasPath,
					run: () => {
						if (proc.path) void termApi()?.showItemInFolder(proc.path)
					},
				},
				{
					id: 'copy-path',
					label: 'Copy path',
					disabled: !hasPath,
					run: () => {
						if (proc.path) {
							void termApi()
								?.clipboardWrite(proc.path)
								.then(() => onToast('Path copied'))
						}
					},
				},
				{
					id: 'copy-pid',
					label: `Copy PID ${proc.pid}`,
					run: () => {
						void termApi()
							?.clipboardWrite(String(proc.pid))
							.then(() => onToast('PID copied'))
					},
				},
				{id: 'sep', label: '', separator: true},
				{
					id: 'kill',
					label: `Kill ${proc.name}`,
					disabled: killing === proc.pid,
					run: () => void killPid(proc.pid, proc.name),
				},
			],
		})
	}

	return (
		<div
			className="modal-backdrop"
			onMouseDown={e => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				className="modal proc-modal"
				role="dialog"
				aria-label="Process manager"
				style={{background: bg, color: fg}}
			>
				<div className="modal-header">
					<h2>Processes</h2>
					<span className="modal-path">
						{rows.length} shown
						{procs.length !== rows.length ? ` of ${procs.length}` : ''}
					</span>
					<span style={{flex: 1}} />
					<select
						aria-label="Refresh interval"
						value={intervalMs}
						onChange={e => changeInterval(Number(e.target.value))}
					>
						<option value={1000}>1s</option>
						<option value={2000}>2s</option>
						<option value={5000}>5s</option>
						<option value={0}>Paused</option>
					</select>
					<button
						type="button"
						className="settings-btn"
						onClick={onClose}
						aria-label="Close process manager"
					>
						✕
					</button>
				</div>
				<div className="proc-toolbar">
					<input
						type="text"
						placeholder="Filter by name, pid, path…"
						value={query}
						onChange={e => setQuery(e.target.value)}
						aria-label="Filter processes"
					/>
				</div>
				{loading ? (
					<div className="proc-status">Loading processes…</div>
				) : error ? (
					<div className="proc-status proc-error">{error}</div>
				) : (
					<div className="proc-table-wrap">
						<table className="proc-table">
							<thead>
								<tr>
									{COLUMNS.map(c => (
										<th
											key={c.key}
											scope="col"
											aria-sort={ariaSortFor(c.key, sortKey, sortDir)}
										>
											<button
												type="button"
												className={
													sortKey === c.key ? 'proc-sort active' : 'proc-sort'
												}
												title={c.title}
												onClick={() => toggleSort(c.key)}
											>
												{c.label}
												{sortKey === c.key
													? sortDir === 'asc'
														? ' ▲'
														: ' ▼'
													: ''}
											</button>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{rows.map(p => (
									<tr
										key={p.pid}
										className={selectedPid === p.pid ? 'proc-selected' : ''}
										onClick={() => setSelectedPid(p.pid)}
										onDoubleClick={() => {
											if (p.path) void termApi()?.showItemInFolder(p.path)
										}}
										onContextMenu={e => openCtx(e, p)}
									>
										<td
											className="proc-name"
											title={p.path || p.name}
										>
											{p.name}
										</td>
										<td className="proc-num">{p.pid}</td>
										<td className="proc-num">{p.cpu.toFixed(1)}</td>
										<td
											className="proc-num"
											title="Share of total system RAM"
										>
											{p.mem.toFixed(1)}
										</td>
										<td
											className="proc-num"
											title="Resident memory (working set)"
										>
											{formatMemMB(p.memRssMB)}
										</td>
										<td
											className="proc-num"
											title={
												p.ioSupported
													? `R ${formatKBs(p.diskReadKBs)} / W ${formatKBs(p.diskWriteKBs)}`
													: 'I/O counters unavailable on this OS'
											}
										>
											{formatKBs(p.diskTotalKBs)}
										</td>
										<td
											className="proc-path"
											title={p.path || '—'}
										>
											{p.path || '—'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{rows.length === 0 && (
							<div className="proc-status">No processes match.</div>
						)}
					</div>
				)}
				<div className="proc-footer">
					<span className="footer-dim">
						MEM % = share of total RAM · RSS = resident memory (working set) ·
						Disk I/O = read+write rate. Right-click for Open folder / Copy path
						/ Kill.
					</span>
				</div>
			</div>
			{ctx && (
				<TermContextMenu
					menu={ctx}
					onClose={() => setCtx(null)}
				/>
			)}
		</div>
	)
}
