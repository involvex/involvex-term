import {useEffect, useMemo, useRef, useState} from 'react'
import {
	collectLeaves,
	layoutPanes,
	splitBoundaries,
	type PaneNode,
	type SplitDir,
} from '../lib/panes'
import TerminalView from './TerminalView'

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
	onFocusPane: (paneId: string) => void
	onResizeSplit: (splitId: string, ratio: number) => void
	onBackgroundIdle?: (paneId: string) => void
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
	onFocusPane,
	onResizeSplit,
	onBackgroundIdle,
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
