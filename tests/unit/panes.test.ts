import {describe, expect, it} from 'bun:test'
import {
	countLeaves,
	normalizeSessionRoot,
	removeLeaf,
} from '../../src/lib/panes.ts'

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
})
