import {describe, expect, test} from 'bun:test'
import {
	ariaSortFor,
	filterProcs,
	formatKBs,
	sortProcs,
	type ProcSortKey,
} from '../../src/lib/procList'
import type {ProcInfo} from '../../src/types'

const procs: ProcInfo[] = [
	{
		pid: 3,
		name: 'ccc',
		cpu: 1,
		mem: 1,
		memRssMB: 10,
		path: '/c',
		diskReadKBs: 0,
		diskWriteKBs: 0,
		diskTotalKBs: 5,
		ioSupported: true,
	},
	{
		pid: 1,
		name: 'aaa',
		cpu: 30,
		mem: 2,
		memRssMB: 200,
		path: '/a',
		diskReadKBs: 1,
		diskWriteKBs: 1,
		diskTotalKBs: 2,
		ioSupported: true,
	},
	{
		pid: 2,
		name: 'bbb',
		cpu: 5,
		mem: 9,
		memRssMB: 50,
		path: '/b',
		diskReadKBs: 10,
		diskWriteKBs: 0,
		diskTotalKBs: 10,
		ioSupported: true,
	},
]

describe('procList', () => {
	test('sorts by cpu desc', () => {
		expect(sortProcs(procs, 'cpu', 'desc').map(p => p.pid)).toEqual([1, 2, 3])
	})
	test('sorts by disk', () => {
		expect(sortProcs(procs, 'disk', 'desc').map(p => p.pid)).toEqual([2, 3, 1])
	})
	test('sorts by name asc', () => {
		expect(sortProcs(procs, 'name', 'asc').map(p => p.pid)).toEqual([1, 2, 3])
	})
	test('filters by query', () => {
		expect(filterProcs(procs, 'bb').map(p => p.pid)).toEqual([2])
		expect(filterProcs(procs, '1').map(p => p.pid)).toEqual([1])
	})
	test('formats IO rate', () => {
		expect(formatKBs(0)).toBe('—')
		expect(formatKBs(512)).toBe('512.0 KB/s')
		expect(formatKBs(2048)).toBe('2.0 MB/s')
	})
})

describe('ariaSortFor', () => {
	const keys: ProcSortKey[] = [
		'name',
		'pid',
		'cpu',
		'mem',
		'memRssMB',
		'disk',
		'path',
	]
	test('active column announces direction', () => {
		expect(ariaSortFor('cpu', 'cpu', 'desc')).toBe('descending')
		expect(ariaSortFor('mem', 'mem', 'asc')).toBe('ascending')
	})
	test('inactive columns are always none', () => {
		for (const col of keys) {
			for (const active of keys) {
				if (col === active) continue
				expect(ariaSortFor(col, active, 'desc')).toBe('none')
				expect(ariaSortFor(col, active, 'asc')).toBe('none')
			}
		}
	})
	test('exactly one column is sorted at a time', () => {
		for (const active of keys) {
			const announced = keys.filter(
				k => ariaSortFor(k, active, 'desc') !== 'none',
			)
			expect(announced).toEqual([active])
		}
	})
})
