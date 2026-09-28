import {useEffect, useMemo, useRef, useState} from 'react'
import {shortAgentTitle, type PaneAgentInfo} from '../lib/agentLabels'
import {
	collectLeaves,
	findNeighborPane,
	layoutPanes,
	splitBoundaries,
	type PaneDirection,
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
	/** False when another tab is showing (whole layout hidden). */
	tabActive: boolean
	activePaneId: string
	completionBell?: boolean
	scrollback?: number
	scrollbar?: boolean
	paneAgents?: Record<string, PaneAgentInfo>
	onFocusPane: (paneId: string) => void
	onResizeSplit: (splitId: string, ratio: number) => void
	onBackgroundIdle?: (paneId: string) => void
	onPaneMenu?: {
		onFind: (paneId: string) => void
		onSplitToward: (paneId: string, toward: PaneDirection) => void
		onSwap: (paneId: string, toward: PaneDirection) => void
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
export default function PaneLayout({
	root,
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
	onBackgroundIdle,
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
		const onMove = (e: PointerEvent) => {
			const el = containerRef.current
			if (!el) return
			const rect = el.getBoundingClientRect()
			const f =
				drag.dir === 'horizontal'
					? (e.clientY - rect.top) / rect.height
					: (e.clientX - rect.left) / rect.width
			const span = drag.rangeEnd - drag.rangeStart
			if (!(span > 0)) return
			onResizeSplit(drag.id, (f - drag.rangeStart) / span)
		}
		const onUp = () => setDrag(null)
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
		return () => {
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
							onBackgroundIdle={onBackgroundIdle}
							paneMenu={paneMenu}
						/>
					</div>
				)
			})}
			{tabActive &&
				dividers.map(b =>
					b.dir === 'horizontal' ? (
						<div
							key={b.id}
							className="pane-divider h"
							style={{
								top: `calc(${(b.line * 100).toFixed(3)}% - 3px)`,
								left: `${(b.crossStart * 100).toFixed(3)}%`,
								width: `${((b.crossEnd - b.crossStart) * 100).toFixed(3)}%`,
							}}
							onPointerDown={e => {
								e.preventDefault()
								setDrag({
									id: b.id,
									dir: b.dir,
									rangeStart: b.rangeStart,
									rangeEnd: b.rangeEnd,
								})
							}}
						/>
					) : (
						<div
							key={b.id}
							className="pane-divider v"
							style={{
								left: `calc(${(b.line * 100).toFixed(3)}% - 3px)`,
								top: `${(b.crossStart * 100).toFixed(3)}%`,
								height: `${((b.crossEnd - b.crossStart) * 100).toFixed(3)}%`,
							}}
							onPointerDown={e => {
								e.preventDefault()
								setDrag({
									id: b.id,
									dir: b.dir,
									rangeStart: b.rangeStart,
									rangeEnd: b.rangeEnd,
								})
							}}
						/>
					),
				)}
		</div>
	)
}
