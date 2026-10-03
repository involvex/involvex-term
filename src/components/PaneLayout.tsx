import {memo, useEffect, useMemo, useRef, useState} from 'react'
import {shortAgentTitle, type PaneAgentInfo} from '../lib/agentLabels'
import {
	dividerPercent,
	isDividerKey,
	resolveDividerKey,
	SPLIT_MAX,
	SPLIT_MIN,
} from '../lib/dividerKeys'
import {
	collectLeaves,
	findNeighborPane,
	findSplitRatio,
	layoutPanes,
	PANE_DRAG_MIME,
	splitBoundaries,
	type PaneDirection,
	type PaneDragPayload,
	type PaneNode,
	type SplitDir,
} from '../lib/panes'
import TerminalView, {type TerminalPaneMenu} from './TerminalView'

interface Theme {
	fontFamily: string
	fontSize: number
	bg: string
	fg: string
}

interface Props extends Theme {
	root: PaneNode
	/** Owning tab id (used as the drag source for cross-tab pane moves). */
	tabId: string
	/** False when another tab is showing (whole layout hidden). */
	tabActive: boolean
	activePaneId: string
	completionBell?: boolean
	scrollback?: number
	scrollbar?: boolean
	paneAgents?: Record<string, PaneAgentInfo>
	onFocusPane: (paneId: string) => void
	onResizeSplit: (splitId: string, ratio: number) => void
	onBackgroundPrompt?: (paneId: string) => void
	onResolvedCwd?: (paneId: string, cwd: string) => void
	onToast?: (msg: string) => void
	onPaneMenu?: {
		onFind: (paneId: string) => void
		onSplitToward: (paneId: string, toward: PaneDirection) => void
		onSwap: (paneId: string, toward: PaneDirection) => void
		onMoveToTab: (paneId: string, toTabId: string) => void
		moveTargets: {id: string; title: string}[]
		onClosePane: (paneId: string) => void
		onCloseOtherPanes: (paneId: string) => void
		onDuplicateTab: (paneId: string) => void
		onCloseTab: () => void
	}
}

interface Drag {
	id: string
	dir: SplitDir
	rangeStart: number
	rangeEnd: number
}

/**
 * Renders every leaf of the split tree FLAT (stable keys = pane ids) on a
 * 100x100 CSS grid whose areas come from the tree geometry. Opening or
 * closing one pane therefore never remounts the survivors' terminals.
 * Split dividers are absolutely positioned handles with pointer drag.
 */
export default memo(function PaneLayout({
	root,
	tabId,
	tabActive,
	activePaneId,
	fontFamily,
	fontSize,
	bg,
	fg,
	completionBell,
	scrollback,
	scrollbar,
	paneAgents = {},
	onFocusPane,
	onResizeSplit,
	onBackgroundPrompt,
	onResolvedCwd,
	onToast,
	onPaneMenu,
}: Props) {
	const leaves = useMemo(() => collectLeaves(root), [root])
	const areas = useMemo(() => layoutPanes(root), [root])
	const dividers = useMemo(() => splitBoundaries(root), [root])
	const containerRef = useRef<HTMLDivElement>(null)
	const [drag, setDrag] = useState<Drag | null>(null)
	const multi = leaves.length > 1

	useEffect(() => {
		if (!drag) return
		// Coalesce pointermove bursts to one write per frame. Each write lands in
		// App's `setTabs`, and a new `tabs` identity invalidates the memoized
		// PaneLayout for *every* tab — so an unthrottled drag re-rendered the whole
		// tree at ~60Hz. Pointer events can fire several times per frame; only the
		// newest position matters.
		let frame = 0
		let latest: {x: number; y: number} | null = null
		const flush = () => {
			frame = 0
			const pt = latest
			latest = null
			const el = containerRef.current
			if (!pt || !el) return
			const rect = el.getBoundingClientRect()
			const f =
				drag.dir === 'horizontal'
					? (pt.y - rect.top) / rect.height
					: (pt.x - rect.left) / rect.width
			const span = drag.rangeEnd - drag.rangeStart
			if (!(span > 0)) return
			onResizeSplit(drag.id, (f - drag.rangeStart) / span)
		}
		const onMove = (e: PointerEvent) => {
			latest = {x: e.clientX, y: e.clientY}
			if (!frame) frame = requestAnimationFrame(flush)
		}
		const onUp = () => {
			// Apply the release position synchronously so the divider never lands
			// a frame short of where the pointer actually let go.
			if (frame) cancelAnimationFrame(frame)
			flush()
			setDrag(null)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		return () => {
			if (frame) cancelAnimationFrame(frame)
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
	}, [drag, onResizeSplit])

	return (
		<div
			ref={containerRef}
			className="pane-grid"
			style={{
				display: tabActive ? 'grid' : 'none',
				gridTemplateRows: 'repeat(100, minmax(0, 1fr))',
				gridTemplateColumns: 'repeat(100, minmax(0, 1fr))',
				userSelect: drag ? 'none' : undefined,
			}}
		>
			{leaves.map(leaf => {
				const a = areas.get(leaf.paneId)
				const focused = leaf.paneId === activePaneId
				const agent = paneAgents[leaf.paneId]
				const paneMenu: TerminalPaneMenu | undefined = onPaneMenu
					? {
							paneCount: leaves.length,
							canSwap: toward =>
								findNeighborPane(root, leaf.paneId, toward) !== null,
							onFind: () => onPaneMenu.onFind(leaf.paneId),
							onSplitToward: toward =>
								onPaneMenu.onSplitToward(leaf.paneId, toward),
							onSwap: toward => onPaneMenu.onSwap(leaf.paneId, toward),
							moveTargets: onPaneMenu.moveTargets,
							onMoveToTab: toTabId =>
								onPaneMenu.onMoveToTab(leaf.paneId, toTabId),
							onClosePane: () => onPaneMenu.onClosePane(leaf.paneId),
							onCloseOtherPanes: () =>
								onPaneMenu.onCloseOtherPanes(leaf.paneId),
							onDuplicateTab: () => onPaneMenu.onDuplicateTab(leaf.paneId),
							onCloseTab: onPaneMenu.onCloseTab,
						}
					: undefined
				return (
					<div
						key={leaf.paneId}
						className={multi && focused ? 'split-leaf focused' : 'split-leaf'}
						style={
							a
								? {
										gridRow: `${a.rowStart} / ${a.rowEnd}`,
										gridColumn: `${a.colStart} / ${a.colEnd}`,
									}
								: undefined
						}
					>
						{multi && tabActive && (
							<div
								className="pane-drag-handle"
								title="Drag to move this pane to another tab"
								draggable
								onDragStart={e => {
									e.stopPropagation()
									const payload: PaneDragPayload = {
										type: 'pane',
										paneId: leaf.paneId,
										sourceTabId: tabId,
									}
									e.dataTransfer.setData(
										PANE_DRAG_MIME,
										JSON.stringify(payload),
									)
									e.dataTransfer.effectAllowed = 'move'
								}}
							>
								⠿
							</div>
						)}
						{agent && (
							<div
								className={`pane-agent-chip${agent.activity === 'active' ? ' active' : ' idle'}${focused ? ' focused' : ''}`}
								title={[
									`${agent.agentLabel} · ${agent.title}`,
									agent.directory,
									agent.activity === 'active' ? 'busy' : 'idle',
								]
									.filter(Boolean)
									.join('\n')}
							>
								<span className="pane-agent-mark">{agent.agentLabel}</span>
								<span className="pane-agent-title">
									{shortAgentTitle(agent.title, multi ? 24 : 36)}
								</span>
								{agent.activity === 'active' && (
									<span
										className="pane-agent-dot"
										aria-hidden
									>
										●
									</span>
								)}
							</div>
						)}
						<TerminalView
							paneId={leaf.paneId}
							tabActive={tabActive}
							focused={focused}
							fontFamily={fontFamily}
							fontSize={fontSize}
							bg={bg}
							fg={fg}
							initialCwd={leaf.cwd}
							profileId={leaf.profileId}
							completionBell={completionBell}
							scrollback={scrollback}
							scrollbar={scrollbar}
							onFocusPane={onFocusPane}
							onBackgroundPrompt={onBackgroundPrompt}
							onResolvedCwd={onResolvedCwd}
							onToast={onToast}
							paneMenu={paneMenu}
						/>
					</div>
				)
			})}
			{tabActive &&
				dividers.map(b => {
					// The split's stored ratio, not the divider's absolute position:
					// `onResizeSplit` takes a ratio within the split's own range, and
					// the two differ as soon as a split is nested in an off-centre parent.
					const ratio = findSplitRatio(root, b.id) ?? 0.5
					const startDrag = (e: React.PointerEvent) => {
						e.preventDefault()
						setDrag({
							id: b.id,
							dir: b.dir,
							rangeStart: b.rangeStart,
							rangeEnd: b.rangeEnd,
						})
					}
					/**
					 * Arrow keys resize, per the ARIA window-splitter pattern.
					 *
					 * Only claims keys the splitter actually acts on, and ignores
					 * modified presses so Ctrl+Home and friends still reach the
					 * terminal underneath.
					 */
					const onKeyDown = (e: React.KeyboardEvent) => {
						if (e.altKey || e.ctrlKey || e.metaKey) return
						if (!isDividerKey(e.key)) return
						const next = resolveDividerKey(e.key, b.dir, ratio, e.shiftKey)
						if (next === null) return
						// Consumed even when the step is a no-op (already at the limit):
						// letting ArrowUp scroll the terminal while a splitter holds
						// focus would be surprising.
						e.preventDefault()
						onResizeSplit(b.id, next)
					}
					// Shared by both orientations so the ARIA contract cannot drift
					// between them. `role="separator"` with a value range is the
					// window-splitter pattern; without tabIndex it is not focusable
					// and none of this is reachable.
					const common = {
						role: 'separator',
						'aria-orientation': b.dir,
						'aria-valuenow': dividerPercent(ratio),
						'aria-valuemin': dividerPercent(SPLIT_MIN),
						'aria-valuemax': dividerPercent(SPLIT_MAX),
						'aria-label':
							b.dir === 'horizontal'
								? 'Resize panes, up and down'
								: 'Resize panes, left and right',
						tabIndex: 0,
						title: 'Drag, or use the arrow keys to resize',
						onKeyDown,
					}
					return b.dir === 'horizontal' ? (
						<div
							key={b.id}
							{...common}
							className="pane-divider h"
							style={{
								top: `calc(${(b.line * 100).toFixed(3)}% - 3px)`,
								left: `${(b.crossStart * 100).toFixed(3)}%`,
								width: `${((b.crossEnd - b.crossStart) * 100).toFixed(3)}%`,
							}}
							onPointerDown={startDrag}
						/>
					) : (
						<div
							key={b.id}
							{...common}
							className="pane-divider v"
							style={{
								left: `calc(${(b.line * 100).toFixed(3)}% - 3px)`,
								top: `${(b.crossStart * 100).toFixed(3)}%`,
								height: `${((b.crossEnd - b.crossStart) * 100).toFixed(3)}%`,
							}}
							onPointerDown={startDrag}
						/>
					)
				})}
		</div>
	)
})
