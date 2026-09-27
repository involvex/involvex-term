// Split-pane model: binary tree per tab. `horizontal` = stacked top/bottom,
// `vertical` = side-by-side. Rendered flat (see PaneLayout) so opening or
// closing one pane never remounts the survivors' terminals.

export type SplitDir = 'horizontal' | 'vertical'

export interface PaneLeaf {
	kind: 'leaf'
	/** Unique pty id (node-pty instance). */
	paneId: string
	/** Starting cwd for the pane's shell. */
	cwd?: string
	/** Shell profile id from settings. */
	profileId?: string
}

export interface PaneSplit {
	kind: 'split'
	/** Stable id for divider drag updates + session persistence. */
	id: string
	dir: SplitDir
	/** Fraction of space given to `first` (0.1..0.9). */
	ratio: number
	first: PaneNode
	second: PaneNode
}

export type PaneNode = PaneLeaf | PaneSplit

let paneSeq = 0
export function newPaneId(): string {
	paneSeq += 1
	return `pane-${Date.now()}-${paneSeq}`
}

let splitSeq = 0
export function newSplitId(): string {
	splitSeq += 1
	return `split-${Date.now()}-${splitSeq}`
}

/** Fill in missing ids/ratios (older sessions, hand-edited JSON). */
export function normalizePaneTree(node: PaneNode): PaneNode {
	if (node.kind === 'leaf') return node
	return {
		kind: 'split',
		id: typeof node.id === 'string' && node.id ? node.id : newSplitId(),
		dir: node.dir === 'vertical' ? 'vertical' : 'horizontal',
		ratio:
			typeof node.ratio === 'number' && node.ratio > 0 && node.ratio < 1
				? node.ratio
				: 0.5,
		first: normalizePaneTree(node.first),
		second: normalizePaneTree(node.second),
	}
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return !!x && typeof x === 'object'
}

/**
 * Validate unknown session JSON into a PaneNode, regenerating missing or
 * duplicate pane/split ids. Returns null when the shape is unusable.
 * @param fallbackCwd Applied when a leaf has no saved cwd (e.g. startDir).
 */
export function normalizeSessionRoot(
	raw: unknown,
	fallbackCwd?: string,
): PaneNode | null {
	const seen = new Set<string>()
	const fixLeaf = (l: Record<string, unknown>): PaneLeaf => {
		let id = typeof l['paneId'] === 'string' && l['paneId'] ? l['paneId'] : ''
		if (!id || seen.has(id)) id = newPaneId()
		seen.add(id)
		const cwd =
			typeof l['cwd'] === 'string' && l['cwd'].trim()
				? l['cwd']
				: fallbackCwd || undefined
		const profileId =
			typeof l['profileId'] === 'string' && l['profileId']
				? l['profileId']
				: undefined
		return {kind: 'leaf', paneId: id, cwd, profileId}
	}
	const walk = (n: unknown): PaneNode | null => {
		if (!isRecord(n)) return null
		if (n['kind'] === 'leaf') return fixLeaf(n)
		if (n['kind'] !== 'split') return null
		const first = walk(n['first'])
		const second = walk(n['second'])
		if (!first || !second) return null
		let id = typeof n['id'] === 'string' && n['id'] ? n['id'] : ''
		if (!id || seen.has(id)) id = newSplitId()
		seen.add(id)
		const ratio =
			typeof n['ratio'] === 'number' && n['ratio'] > 0 && n['ratio'] < 1
				? n['ratio']
				: 0.5
		return {
			kind: 'split',
			id,
			dir: n['dir'] === 'vertical' ? 'vertical' : 'horizontal',
			ratio,
			first,
			second,
		}
	}
	return walk(raw)
}

/** Stamp live cwds onto leaves (session snapshots). */
export function mapLeafCwd(
	node: PaneNode,
	cwds: Map<string, string | null>,
): PaneNode {
	if (node.kind === 'leaf') {
		const cwd = cwds.get(node.paneId)
		return cwd ? {...node, cwd} : node
	}
	return {
		...node,
		first: mapLeafCwd(node.first, cwds),
		second: mapLeafCwd(node.second, cwds),
	}
}

export function countLeaves(node: PaneNode): number {
	if (node.kind === 'leaf') return 1
	return countLeaves(node.first) + countLeaves(node.second)
}

export function collectLeaves(node: PaneNode): PaneLeaf[] {
	if (node.kind === 'leaf') return [node]
	return [...collectLeaves(node.first), ...collectLeaves(node.second)]
}

export function firstLeaf(node: PaneNode): PaneLeaf {
	let n = node
	while (n.kind !== 'leaf') n = n.first
	return n
}

export function findLeaf(node: PaneNode, paneId: string): PaneLeaf | null {
	if (node.kind === 'leaf') return node.paneId === paneId ? node : null
	return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId) ?? null
}

export type PaneDirection = 'left' | 'right' | 'up' | 'down'

/** Replace the leaf `paneId` with a split holding the old + new leaf. */
export function splitLeaf(
	node: PaneNode,
	paneId: string,
	newLeaf: PaneLeaf,
	dir: SplitDir,
	placeNew: 'before' | 'after' = 'after',
): PaneNode {
	if (node.kind === 'leaf') {
		if (node.paneId !== paneId) return node
		const split: PaneSplit = {
			kind: 'split',
			id: newSplitId(),
			dir,
			ratio: 0.5,
			first: placeNew === 'before' ? newLeaf : node,
			second: placeNew === 'before' ? node : newLeaf,
		}
		return split
	}
	return {
		...node,
		first: splitLeaf(node.first, paneId, newLeaf, dir, placeNew),
		second: splitLeaf(node.second, paneId, newLeaf, dir, placeNew),
	}
}

/** Split relative to the focused pane (Windows Terminal directions). */
export function splitLeafToward(
	node: PaneNode,
	paneId: string,
	newLeaf: PaneLeaf,
	toward: PaneDirection,
): PaneNode {
	const map: Record<
		PaneDirection,
		{dir: SplitDir; placeNew: 'before' | 'after'}
	> = {
		right: {dir: 'vertical', placeNew: 'after'},
		left: {dir: 'vertical', placeNew: 'before'},
		down: {dir: 'horizontal', placeNew: 'after'},
		up: {dir: 'horizontal', placeNew: 'before'},
	}
	const {dir, placeNew} = map[toward]
	return splitLeaf(node, paneId, newLeaf, dir, placeNew)
}

function paneCenter(area: GridArea): {x: number; y: number} {
	return {
		x: (area.colStart + area.colEnd) / 2,
		y: (area.rowStart + area.rowEnd) / 2,
	}
}

function spansOverlap(a: GridArea, b: GridArea, axis: 'x' | 'y'): boolean {
	if (axis === 'x') {
		return Math.max(a.colStart, b.colStart) < Math.min(a.colEnd, b.colEnd)
	}
	return Math.max(a.rowStart, b.rowStart) < Math.min(a.rowEnd, b.rowEnd)
}

/** Neighbor pane in a compass direction (for swap). */
export function findNeighborPane(
	root: PaneNode,
	paneId: string,
	dir: PaneDirection,
): string | null {
	const areas = layoutPanes(root)
	const self = areas.get(paneId)
	if (!self) return null
	const c = paneCenter(self)
	let best: {id: string; dist: number} | null = null
	for (const [id, area] of areas) {
		if (id === paneId) continue
		const n = paneCenter(area)
		if (dir === 'left') {
			if (n.x >= c.x || !spansOverlap(self, area, 'y')) continue
		} else if (dir === 'right') {
			if (n.x <= c.x || !spansOverlap(self, area, 'y')) continue
		} else if (dir === 'up') {
			if (n.y >= c.y || !spansOverlap(self, area, 'x')) continue
		} else if (n.y <= c.y || !spansOverlap(self, area, 'x')) continue
		const dist = Math.hypot(n.x - c.x, n.y - c.y)
		if (!best || dist < best.dist) best = {id, dist}
	}
	return best?.id ?? null
}

function replaceLeaf(
	node: PaneNode,
	paneId: string,
	replacement: PaneLeaf,
): PaneNode {
	if (node.kind === 'leaf') {
		return node.paneId === paneId ? replacement : node
	}
	return {
		...node,
		first: replaceLeaf(node.first, paneId, replacement),
		second: replaceLeaf(node.second, paneId, replacement),
	}
}

/**
 * Swap two panes' on-screen positions without remounting terminals
 * (exchange pane ids + metadata on the two leaf nodes).
 */
export function swapPanes(
	root: PaneNode,
	paneA: string,
	paneB: string,
): PaneNode {
	const la = findLeaf(root, paneA)
	const lb = findLeaf(root, paneB)
	if (!la || !lb || paneA === paneB) return root
	const atA: PaneLeaf = {
		kind: 'leaf',
		paneId: lb.paneId,
		cwd: lb.cwd,
		profileId: lb.profileId,
	}
	const atB: PaneLeaf = {
		kind: 'leaf',
		paneId: la.paneId,
		cwd: la.cwd,
		profileId: la.profileId,
	}
	let next = replaceLeaf(root, paneA, atA)
	next = replaceLeaf(next, paneB, atB)
	return next
}

/** Collapse the tree to a single leaf. */
export function keepOnlyPane(root: PaneNode, paneId: string): PaneLeaf | null {
	const leaf = findLeaf(root, paneId)
	return leaf ? {...leaf} : null
}

/**
 * Remove a leaf; the surviving sibling collapses into the parent slot.
 * Returns null when the tree held only that leaf.
 */
export function removeLeaf(node: PaneNode, paneId: string): PaneNode | null {
	if (node.kind === 'leaf') return node.paneId === paneId ? null : node
	if (node.first.kind === 'leaf' && node.first.paneId === paneId)
		return node.second
	if (node.second.kind === 'leaf' && node.second.paneId === paneId)
		return node.first
	const first = removeLeaf(node.first, paneId)
	if (first && first !== node.first) return {...node, first}
	const second = removeLeaf(node.second, paneId)
	if (second && second !== node.second) return {...node, second}
	return node
}

/** Set a split's ratio (clamped), preserving everything else. */
export function updateSplitRatio(
	node: PaneNode,
	splitId: string,
	ratio: number,
): PaneNode {
	if (node.kind === 'leaf') return node
	if (node.id === splitId)
		return {...node, ratio: Math.min(0.9, Math.max(0.1, ratio))}
	return {
		...node,
		first: updateSplitRatio(node.first, splitId, ratio),
		second: updateSplitRatio(node.second, splitId, ratio),
	}
}

export interface GridArea {
	rowStart: number
	rowEnd: number
	colStart: number
	colEnd: number
}

const GRID = 100

/** Map every leaf to integer grid lines using each split's ratio. */
export function layoutPanes(root: PaneNode): Map<string, GridArea> {
	const areas = new Map<string, GridArea>()
	const walk = (
		node: PaneNode,
		r0: number,
		r1: number,
		c0: number,
		c1: number,
	): void => {
		if (node.kind === 'leaf') {
			areas.set(node.paneId, {
				rowStart: Math.max(0, Math.round(r0)) + 1,
				rowEnd: Math.max(1, Math.round(r1)) + 1,
				colStart: Math.max(0, Math.round(c0)) + 1,
				colEnd: Math.max(1, Math.round(c1)) + 1,
			})
			return
		}
		if (node.dir === 'horizontal') {
			const m = splitLine(r0, r1, node.ratio)
			walk(node.first, r0, m, c0, c1)
			walk(node.second, m, r1, c0, c1)
		} else {
			const m = splitLine(c0, c1, node.ratio)
			walk(node.first, r0, r1, c0, m)
			walk(node.second, r0, r1, m, c1)
		}
	}
	walk(root, 0, GRID, 0, GRID)
	return areas
}

function splitLine(a: number, b: number, ratio: number): number {
	const m = a + (b - a) * ratio
	return Math.min(Math.max(m, a + 1), b - 1)
}

export interface SplitBoundary {
	id: string
	dir: SplitDir
	/** Split's own range as 0..1 fractions of the container (along split axis). */
	rangeStart: number
	rangeEnd: number
	/** Divider line position as 0..1 fraction of the container. */
	line: number
	/** Cross-axis span as 0..1 fractions (divider length). */
	crossStart: number
	crossEnd: number
}

/**
 * Every split's divider geometry as container fractions — used to position
 * draggable divider handles over the flat grid.
 */
export function splitBoundaries(root: PaneNode): SplitBoundary[] {
	const out: SplitBoundary[] = []
	const walk = (
		node: PaneNode,
		r0: number,
		r1: number,
		c0: number,
		c1: number,
	): void => {
		if (node.kind === 'leaf') return
		if (node.dir === 'horizontal') {
			const m = splitLine(r0, r1, node.ratio)
			out.push({
				id: node.id,
				dir: node.dir,
				rangeStart: r0 / GRID,
				rangeEnd: r1 / GRID,
				line: m / GRID,
				crossStart: c0 / GRID,
				crossEnd: c1 / GRID,
			})
			walk(node.first, r0, m, c0, c1)
			walk(node.second, m, r1, c0, c1)
		} else {
			const m = splitLine(c0, c1, node.ratio)
			out.push({
				id: node.id,
				dir: node.dir,
				rangeStart: c0 / GRID,
				rangeEnd: c1 / GRID,
				line: m / GRID,
				crossStart: r0 / GRID,
				crossEnd: r1 / GRID,
			})
			walk(node.first, r0, r1, c0, m)
			walk(node.second, r0, r1, m, c1)
		}
	}
	walk(root, 0, GRID, 0, GRID)
	return out
}
