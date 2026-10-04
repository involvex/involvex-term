import {describe, expect, it} from 'bun:test'
import {
	countLeaves,
	findSplitRatio,
	normalizeSessionRoot,
	removeLeaf,
	updateSplitRatio,
	type PaneNode,
	type PaneSplit,
} from '../../src/lib/panes.ts'

/**
 * Three-level tree so deep-descent behaviour is observable:
 *   s1 (horizontal 0.5)
 *     ├─ leaf p1
 *     └─ s2 (vertical 0.5)
 *          ├─ leaf p2
 *          └─ leaf p3
 */
function nested(): PaneNode {
	return normalizeSessionRoot({
		kind: 'split',
		id: 's1',
		dir: 'horizontal',
		ratio: 0.5,
		first: {kind: 'leaf', paneId: 'p1'},
		second: {
			kind: 'split',
			id: 's2',
			dir: 'vertical',
			ratio: 0.5,
			first: {kind: 'leaf', paneId: 'p2'},
			second: {kind: 'leaf', paneId: 'p3'},
		},
	})!
}

/**
 * Sibling subtrees are themselves splits, so "the untouched branch keeps its
 * object identity" is a claim that can actually fail. A sibling that is a
 * bare leaf passes through by reference under any implementation.
 *
 *   s1 (horizontal 0.5)
 *     ├─ s2 (vertical 0.5)   <- the target
 *     │    ├─ leaf p1
 *     │    └─ leaf p2
 *     └─ s3 (vertical 0.5)   <- untouched sibling
 *          ├─ leaf p3
 *          └─ leaf p4
 */
function twoSubtrees(): PaneNode {
	return normalizeSessionRoot({
		kind: 'split',
		id: 's1',
		dir: 'horizontal',
		ratio: 0.5,
		first: {
			kind: 'split',
			id: 's2',
			dir: 'vertical',
			ratio: 0.5,
			first: {kind: 'leaf', paneId: 'p1'},
			second: {kind: 'leaf', paneId: 'p2'},
		},
		second: {
			kind: 'split',
			id: 's3',
			dir: 'vertical',
			ratio: 0.5,
			first: {kind: 'leaf', paneId: 'p3'},
			second: {kind: 'leaf', paneId: 'p4'},
		},
	})!
}

function asSplit(node: PaneNode): PaneSplit {
	expect(node.kind).toBe('split')
	return node as PaneSplit
}

describe('Pane tree model', () => {
	it('normalizes simple leaf session root', () => {
		const root = normalizeSessionRoot({
			kind: 'leaf',
			paneId: 'p1',
			cwd: 'C:\\repo',
		})
		expect(root).not.toBeNull()
		expect(root?.kind).toBe('leaf')
		if (root?.kind === 'leaf') {
			expect(root.paneId).toBe('p1')
			expect(root.cwd).toBe('C:\\repo')
		}
	})

	it('counts leaves correctly', () => {
		const root = normalizeSessionRoot({
			kind: 'split',
			id: 's1',
			dir: 'vertical',
			ratio: 0.5,
			first: {kind: 'leaf', paneId: 'p1'},
			second: {kind: 'leaf', paneId: 'p2'},
		})
		expect(root).not.toBeNull()
		if (root) {
			expect(countLeaves(root)).toBe(2)
		}
	})

	it('removes leaf and collapses tree', () => {
		const root = normalizeSessionRoot({
			kind: 'split',
			id: 's1',
			dir: 'horizontal',
			ratio: 0.5,
			first: {kind: 'leaf', paneId: 'p1'},
			second: {kind: 'leaf', paneId: 'p2'},
		})
		const updated = removeLeaf(root!, 'p1')
		expect(updated?.kind).toBe('leaf')
		if (updated?.kind === 'leaf') {
			expect(updated.paneId).toBe('p2')
		}
	})

	describe('updateSplitRatio', () => {
		it('sets the ratio on the target split', () => {
			const next = updateSplitRatio(nested(), 's2', 0.7)
			expect(findSplitRatio(next, 's2')).toBeCloseTo(0.7, 6)
		})

		it('leaves other splits alone', () => {
			const next = updateSplitRatio(nested(), 's2', 0.7)
			expect(findSplitRatio(next, 's1')).toBeCloseTo(0.5, 6)
		})

		it('clamps into the 0.1..0.9 range', () => {
			expect(findSplitRatio(updateSplitRatio(nested(), 's1', 5), 's1')).toBe(
				0.9,
			)
			expect(findSplitRatio(updateSplitRatio(nested(), 's1', -2), 's1')).toBe(
				0.1,
			)
		})

		it('ignores a NaN ratio instead of clamping it', () => {
			// The clamp cannot catch this: Math.max(0.1, NaN) is NaN and
			// Math.min passes it through, so one NaN ratio poisons the split
			// permanently and survives a session round-trip as null.
			const tree = nested()
			const next = updateSplitRatio(tree, 's1', Number.NaN)

			expect(findSplitRatio(next, 's1')).toBe(findSplitRatio(tree, 's1'))
			// Returning the identical node keeps the memoized PaneLayout from
			// re-rendering the whole tree for a divider drag that changed
			// nothing.
			expect(next).toBe(tree)
		})

		it('ignores infinite ratios too', () => {
			const tree = nested()
			for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				const next = updateSplitRatio(tree, 's1', bad)
				expect(findSplitRatio(next, 's1')).toBe(findSplitRatio(tree, 's1'))
			}
		})

		it('still applies a valid ratio after rejecting a bad one', () => {
			// One bad pointer event must not wedge the divider permanently.
			const bad = updateSplitRatio(nested(), 's1', Number.NaN)
			const good = updateSplitRatio(bad, 's1', 0.42)

			expect(findSplitRatio(good, 's1')).toBeCloseTo(0.42, 6)
		})

		it('does not let a NaN ratio into a session snapshot', () => {
			// JSON has no NaN, so it would serialise to null and fail schema
			// validation on the next launch, costing the user every tab.
			const poisoned = updateSplitRatio(nested(), 's1', Number.NaN)

			expect(JSON.stringify(poisoned)).not.toContain('null')
			expect(() =>
				normalizeSessionRoot(JSON.parse(JSON.stringify(poisoned))),
			).not.toThrow()
		})

		it('returns the identical root for an unknown splitId', () => {
			const root = nested()
			// The old implementation always rebuilt the root, so this asserted
			// identity is what keeps a divider drag from re-rendering every tab.
			expect(updateSplitRatio(root, 'nope', 0.42)).toBe(root)
		})

		it('preserves the untouched sibling subtree by identity', () => {
			const root = asSplit(twoSubtrees())
			const next = asSplit(updateSplitRatio(root, 's2', 0.7))

			// s1 is an ancestor of the edit, so it is legitimately rebuilt...
			expect(next).not.toBe(root)
			// ...but s3 is not on the path to s2 and must survive by reference.
			// The old implementation recursed into both branches and rebuilt it.
			expect(next.second).toBe(root.second)
			expect(asSplit(next.second).id).toBe('s3')
			expect(asSplit(next.second).ratio).toBeCloseTo(0.5, 6)
			expect(findSplitRatio(next, 's2')).toBeCloseTo(0.7, 6)
		})

		it('is a no-op on a leaf root', () => {
			const leaf = normalizeSessionRoot({
				kind: 'leaf',
				paneId: 'p1',
				cwd: 'C:\\repo',
			})!
			expect(updateSplitRatio(leaf, 's1', 0.3)).toBe(leaf)
		})
	})

	describe('findSplitRatio', () => {
		it('finds a nested split', () => {
			expect(findSplitRatio(nested(), 's2')).toBeCloseTo(0.5, 6)
		})

		it('returns undefined for an unknown id', () => {
			expect(findSplitRatio(nested(), 'missing')).toBeUndefined()
		})

		it('returns undefined for a leaf root', () => {
			expect(findSplitRatio({kind: 'leaf', paneId: 'p1'}, 's1')).toBeUndefined()
		})
	})
})
