import {
	useRef,
	useState,
	type CSSProperties,
	type DragEvent,
	type MouseEvent,
} from 'react'
import {shortAgentTitle, type PaneAgentInfo} from '../lib/agentLabels'
import {TAB_COLORS} from '../lib/agents'
import {
	collectLeaves,
	PANE_DRAG_MIME,
	type PaneDragPayload,
	type PaneInsertPosition,
	type PaneNode,
} from '../lib/panes'
import type {QuickCommand, ShellProfile} from '../types'
import TermContextMenu, {
	type ContextMenuItem,
	type TermContextMenuState,
} from './TermContextMenu'

export interface TabInfo {
	id: string
	title: string
	/** When set, git auto-title updates are skipped. */
	customTitle?: string
	/** When true, close requires confirm; bulk-close skips this tab. */
	pinned?: boolean
	/** Optional accent color (#rrggbb). */
	color?: string
	cwd?: string
	/** Split-pane tree; single leaf = classic full-terminal tab. */
	root: PaneNode
	activePaneId: string
}

/** Prefer the focused pane's agent label; else first leaf with one. */
function tabAgentLabel(
	tab: TabInfo,
	paneAgents: Record<string, PaneAgentInfo>,
): PaneAgentInfo | undefined {
	const focused = paneAgents[tab.activePaneId]
	if (focused) return focused
	for (const leaf of collectLeaves(tab.root)) {
		const a = paneAgents[leaf.paneId]
		if (a) return a
	}
	return undefined
}

interface Props {
	tabs: TabInfo[]
	activeId: string
	profiles: ShellProfile[]
	defaultProfileId: string
	quickCommands: QuickCommand[]
	agentLabel: string
	agentName: string
	agentAvailable: boolean
	paneAgents?: Record<string, PaneAgentInfo>
	onSelect: (id: string) => void
	onClose: (id: string) => void
	onNew: (profileId?: string) => void
	onRename: (id: string, title: string) => void
	onReorder: (fromIndex: number, toIndex: number) => void
	onMovePaneToTab: (
		paneId: string,
		fromTabId: string,
		toTabId: string,
		position: PaneInsertPosition,
	) => void
	onTogglePin: (id: string) => void
	onSetColor: (id: string, color: string | undefined) => void
	onDuplicate: (id: string) => void
	onSplit: (id: string, direction: 'horizontal' | 'vertical') => void
	onExportBuffer: (id: string) => void
	onCloseOthers: (id: string) => void
	onCloseToRight: (id: string) => void
	onQuickCommand: (cmd: QuickCommand) => void
	onOpenAgent: () => void
	onOpenSettings: () => void
}

export default function TabBar({
	tabs,
	activeId,
	profiles,
	defaultProfileId,
	quickCommands,
	agentLabel,
	agentName,
	agentAvailable,
	paneAgents = {},
	onSelect,
	onClose,
	onNew,
	onRename,
	onReorder,
	onMovePaneToTab,
	onTogglePin,
	onSetColor,
	onDuplicate,
	onSplit,
	onExportBuffer,
	onCloseOthers,
	onCloseToRight,
	onQuickCommand,
	onOpenAgent,
	onOpenSettings,
}: Props) {
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editValue, setEditValue] = useState('')
	const [menuOpen, setMenuOpen] = useState(false)
	const [ctxMenu, setCtxMenu] = useState<TermContextMenuState | null>(null)
	const [dropTabId, setDropTabId] = useState<string | null>(null)
	const dragFrom = useRef<number | null>(null)

	const hasPaneDrag = (e: DragEvent) =>
		Array.from(e.dataTransfer.types).includes(PANE_DRAG_MIME)

	/** Edge of the tab the pointer is over — decides the split direction. */
	const dropPosition = (e: DragEvent): PaneInsertPosition => {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return 'right'
		const dx = (e.clientX - rect.left) / rect.width
		const dy = (e.clientY - rect.top) / rect.height
		if (dx < 0.25) return 'left'
		if (dx > 0.75) return 'right'
		if (dy < 0.3) return 'top'
		if (dy > 0.7) return 'bottom'
		return 'right'
	}

	const dropPaneOnTab = (e: DragEvent, toTabId: string) => {
		let payload: PaneDragPayload | null = null
		try {
			const raw = e.dataTransfer.getData(PANE_DRAG_MIME)
			const parsed: unknown = raw ? JSON.parse(raw) : null
			if (
				parsed &&
				typeof parsed === 'object' &&
				(parsed as {type?: unknown}).type === 'pane' &&
				typeof (parsed as {paneId?: unknown}).paneId === 'string' &&
				typeof (parsed as {sourceTabId?: unknown}).sourceTabId === 'string'
			) {
				payload = parsed as PaneDragPayload
			}
		} catch {
			payload = null
		}
		if (!payload || payload.sourceTabId === toTabId) return
		onMovePaneToTab(
			payload.paneId,
			payload.sourceTabId,
			toTabId,
			dropPosition(e),
		)
	}

	const commitRename = (id: string) => {
		const v = editValue.trim()
		if (v) onRename(id, v)
		setEditingId(null)
	}

	const startRename = (id: string) => {
		const t = tabs.find(x => x.id === id)
		if (!t) return
		setEditingId(id)
		setEditValue(t.customTitle || t.title)
	}

	const openTabMenu = (e: MouseEvent, tab: TabInfo, index: number) => {
		e.preventDefault()
		e.stopPropagation()
		onSelect(tab.id)
		const items: ContextMenuItem[] = [
			{
				id: 'color',
				label: 'Change tab color',
				icon: 'color',
				children: [
					...TAB_COLORS.map((c, n) => ({
						id: `color-${c}`,
						label: `Color ${n + 1}`,
						icon: (tab.color === c ? 'check' : undefined) as
							'check' | undefined,
						run: () => onSetColor(tab.id, c),
					})),
					{
						id: 'color-none',
						label: 'Reset color',
						run: () => onSetColor(tab.id, undefined),
					},
				],
			},
			{
				id: 'pin',
				label: tab.pinned ? 'Unpin tab' : 'Pin tab',
				icon: 'pin',
				run: () => onTogglePin(tab.id),
			},
			{
				id: 'rename',
				label: 'Rename tab',
				icon: 'rename',
				run: () => startRename(tab.id),
			},
			{
				id: 'duplicate',
				label: 'Duplicate tab',
				icon: 'duplicate',
				run: () => onDuplicate(tab.id),
			},
			{
				id: 'split',
				label: 'Split pane',
				icon: 'split',
				children: [
					{
						id: 'split-h',
						label: 'Horizontal',
						run: () => onSplit(tab.id, 'horizontal'),
					},
					{
						id: 'split-v',
						label: 'Vertical',
						run: () => onSplit(tab.id, 'vertical'),
					},
				],
			},
			{
				id: 'export',
				label: 'Export text',
				icon: 'export',
				run: () => onExportBuffer(tab.id),
			},
			{id: 'sep1', label: '', separator: true},
			{
				id: 'close-others',
				label: 'Close other tabs',
				icon: 'close-other',
				disabled: tabs.length <= 1,
				run: () => onCloseOthers(tab.id),
			},
			{
				id: 'close-right',
				label: 'Close tabs to the right',
				icon: 'close-other',
				disabled: index >= tabs.length - 1,
				run: () => onCloseToRight(tab.id),
			},
			{
				id: 'close',
				label: 'Close tab',
				icon: 'close-tab',
				run: () => onClose(tab.id),
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

	return (
		<div
			className="tabbar"
			role="tablist"
		>
			{tabs.map((t, i) => {
				const agent = tabAgentLabel(t, paneAgents)
				const tipLines = [
					t.customTitle
						? `${t.customTitle}${t.pinned ? ' (pinned)' : ''}`
						: `${t.cwd || t.title}${t.pinned ? ' (pinned)' : ''}`,
					agent
						? `${agent.agentLabel} · ${agent.title} (${agent.activity})`
						: '',
					t.customTitle ? t.cwd || '' : '',
				].filter(Boolean)
				return (
					<div
						key={t.id}
						role="tab"
						aria-selected={t.id === activeId}
						className={[
							'tab',
							t.id === activeId ? 'tab-active' : '',
							t.pinned ? 'tab-pinned' : '',
							t.color ? 'tab-colored' : '',
							agent ? 'tab-has-agent' : '',
							agent?.activity === 'active' ? 'tab-agent-active' : '',
							dropTabId === t.id ? 'tab-drop-target' : '',
						]
							.filter(Boolean)
							.join(' ')}
						style={
							t.color
								? ({['--tab-accent' as string]: t.color} as CSSProperties)
								: undefined
						}
						draggable={editingId !== t.id}
						onDragStart={() => {
							dragFrom.current = i
						}}
						onDragEnd={() => {
							dragFrom.current = null
							setDropTabId(null)
						}}
						onDragOver={e => {
							e.preventDefault()
							if (hasPaneDrag(e)) {
								e.dataTransfer.dropEffect = 'move'
								if (dropTabId !== t.id) setDropTabId(t.id)
							}
						}}
						onDragLeave={() => {
							if (dropTabId === t.id) setDropTabId(null)
						}}
						onDrop={(e: DragEvent) => {
							e.preventDefault()
							setDropTabId(null)
							if (hasPaneDrag(e)) {
								dropPaneOnTab(e, t.id)
								return
							}
							const from = dragFrom.current
							dragFrom.current = null
							if (from == null || from === i) return
							onReorder(from, i)
						}}
						onClick={() => {
							if (editingId !== t.id) onSelect(t.id)
						}}
						onDoubleClick={e => {
							e.stopPropagation()
							startRename(t.id)
						}}
						onContextMenu={e => openTabMenu(e, t, i)}
						onMouseDown={e => {
							if (e.button === 1) {
								e.preventDefault()
								e.stopPropagation()
								onClose(t.id)
							}
						}}
						onAuxClick={e => {
							if (e.button === 1) {
								e.preventDefault()
								e.stopPropagation()
								onClose(t.id)
							}
						}}
						title={tipLines.join('\n')}
					>
						{t.color && (
							<span
								className="tab-color-dot"
								style={{background: t.color}}
								aria-hidden
							/>
						)}
						{t.pinned && (
							<span
								className="tab-pin"
								aria-hidden
							>
								<svg
									width="10"
									height="10"
									viewBox="0 0 16 16"
									fill="currentColor"
								>
									<path d="M8 2.5 9.5 5H12l-2 2.2.8 3.8L8 9.5 5.2 11l.8-3.8L4 5h2.5L8 2.5zm0 8.2V14" />
								</svg>
							</span>
						)}
						<span className="tab-index">{i + 1}</span>
						{editingId === t.id ? (
							<input
								className="tab-rename"
								value={editValue}
								autoFocus
								onClick={e => e.stopPropagation()}
								onChange={e => setEditValue(e.target.value)}
								onBlur={() => commitRename(t.id)}
								onKeyDown={e => {
									if (e.key === 'Enter') commitRename(t.id)
									if (e.key === 'Escape') setEditingId(null)
								}}
							/>
						) : agent && !t.customTitle ? (
							<span className="tab-title tab-title-agent">
								<span
									className={`tab-agent-mark${agent.activity === 'active' ? ' active' : ''}`}
								>
									{agent.agentLabel}
								</span>
								<span className="tab-agent-sep"> · </span>
								<span className="tab-agent-session">
									{shortAgentTitle(agent.title, 22)}
								</span>
							</span>
						) : (
							<>
								<span className="tab-title">{t.title}</span>
								{agent && (
									<span
										className={`tab-agent-badge${agent.activity === 'active' ? ' active' : ''}`}
										title={`${agent.agentLabel} · ${agent.title}`}
									>
										{agent.agentLabel}
										{agent.activity === 'active' ? ' ●' : ''}
									</span>
								)}
							</>
						)}
						<button
							type="button"
							className="tab-close"
							aria-label={`Close tab ${t.title}`}
							onClick={e => {
								e.stopPropagation()
								onClose(t.id)
							}}
						>
							×
						</button>
					</div>
				)
			})}
			<div className="tab-new-wrap">
				<button
					type="button"
					className="tab-new"
					onClick={() => onNew()}
					title="New tab (Ctrl+Shift+T)"
				>
					+
				</button>
				<button
					type="button"
					className="tab-new tab-new-menu"
					aria-label="New tab with profile"
					title="New tab with profile"
					onClick={() => setMenuOpen(o => !o)}
				>
					▾
				</button>
				{menuOpen && (
					<div className="tab-profile-menu">
						{profiles.map(p => (
							<button
								key={p.id}
								type="button"
								className={
									p.id === defaultProfileId
										? 'tab-profile-item tab-profile-default'
										: 'tab-profile-item'
								}
								onClick={() => {
									setMenuOpen(false)
									onNew(p.id)
								}}
							>
								{p.name}
							</button>
						))}
					</div>
				)}
			</div>
			<span className="tabbar-spacer" />
			{quickCommands.map(qc => (
				<button
					key={qc.id}
					type="button"
					className="tab-new tab-quick-cmd"
					title={qc.command}
					aria-label={qc.label}
					onClick={() => onQuickCommand(qc)}
				>
					{qc.label}
				</button>
			))}
			<button
				type="button"
				className="tab-new tab-opencode"
				onClick={onOpenAgent}
				disabled={!agentAvailable}
				title={
					agentAvailable
						? `Open ${agentName} (Ctrl+Shift+O)`
						: `${agentName} not found on PATH`
				}
				aria-label={`Open ${agentName}`}
			>
				{agentLabel}
			</button>
			<button
				type="button"
				className="tab-new"
				onClick={onOpenSettings}
				title="Settings (Ctrl+,)"
				aria-label="Open settings"
			>
				⚙
			</button>
			{ctxMenu && (
				<TermContextMenu
					menu={ctxMenu}
					onClose={() => setCtxMenu(null)}
				/>
			)}
		</div>
	)
}
