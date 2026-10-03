import type {ProcInfo} from '../types'

export type ProcSortKey =
	'name' | 'pid' | 'cpu' | 'mem' | 'memRssMB' | 'disk' | 'path'
export type SortDir = 'asc' | 'desc'
export type AriaSort = 'ascending' | 'descending' | 'none'

/** Single source of truth for header `aria-sort`: only the active column
 * announces a direction, everything else is `none`. Unit-tested. */
export function ariaSortFor(
	column: ProcSortKey,
	active: ProcSortKey,
	dir: SortDir,
): AriaSort {
	if (column !== active) return 'none'
	return dir === 'asc' ? 'ascending' : 'descending'
}

export function sortProcs(
	list: ProcInfo[],
	key: ProcSortKey,
	dir: SortDir,
): ProcInfo[] {
	const mul = dir === 'asc' ? 1 : -1
	return [...list].sort((a, b) => {
		switch (key) {
			case 'name':
				return a.name.localeCompare(b.name) * mul
			case 'path':
				return (a.path || '').localeCompare(b.path || '') * mul
			case 'pid':
				return (a.pid - b.pid) * mul
			case 'cpu':
				return (a.cpu - b.cpu) * mul
			case 'mem':
				return (a.mem - b.mem) * mul
			case 'memRssMB':
				return (a.memRssMB - b.memRssMB) * mul
			case 'disk':
				return (a.diskTotalKBs - b.diskTotalKBs) * mul
		}
	})
}

export function filterProcs(list: ProcInfo[], query: string): ProcInfo[] {
	const q = query.trim().toLowerCase()
	if (!q) return list
	return list.filter(
		p =>
			p.name.toLowerCase().includes(q) ||
			String(p.pid).includes(q) ||
			(p.path || '').toLowerCase().includes(q),
	)
}

export function formatKBs(v: number): string {
	if (!Number.isFinite(v) || v <= 0) return '—'
	if (v < 1024) return `${v.toFixed(1)} KB/s`
	const mb = v / 1024
	if (mb < 1024) return `${mb.toFixed(1)} MB/s`
	return `${(mb / 1024).toFixed(2)} GB/s`
}

export function formatMemMB(v: number): string {
	if (!Number.isFinite(v) || v <= 0) return '—'
	if (v < 1024) return `${v.toFixed(1)} MB`
	return `${(v / 1024).toFixed(2)} GB`
}
