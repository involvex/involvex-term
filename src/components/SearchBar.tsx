import {useEffect, useMemo, useRef, useState} from 'react'
import {focusTerm} from '../lib/focusTerm'
import type {PaneNode} from '../lib/panes'
import {getSearchesForRoot} from '../lib/searchRegistry'

interface Props {
	root: PaneNode
	activePaneId: string
	bg: string
	fg: string
	onClose: () => void
	onFocusPane: (paneId: string) => void
}

interface PaneMatch {
	index: number
	count: number
}

export default function SearchBar({
	root,
	activePaneId,
	bg,
	fg,
	onClose,
	onFocusPane,
}: Props) {
	const [query, setQuery] = useState('')
	const [caseSensitive, setCaseSensitive] = useState(false)
	const [useRegex, setUseRegex] = useState(false)
	const [matches, setMatches] = useState<Record<string, PaneMatch>>({})
	const inputRef = useRef<HTMLInputElement>(null)

	const paneSearches = useMemo(() => getSearchesForRoot(root), [root])
	const paneIdsKey = paneSearches.map(p => p.paneId).join(',')

	// Start on the focused pane. The bar unmounts on tab switch/close, so
	// the initial index never goes stale while it is open.
	const [paneIndex, setPaneIndex] = useState(() => {
		const i = getSearchesForRoot(root).findIndex(p => p.paneId === activePaneId)
		return i >= 0 ? i : 0
	})

	useEffect(() => {
		inputRef.current?.focus()
		inputRef.current?.select()
	}, [])

	// Subscribe to result changes on every pane's addon.
	useEffect(() => {
		const disposables = paneSearches.map(({paneId, addon}) =>
			addon.onDidChangeResults(r =>
				setMatches(prev => {
					const cur = prev[paneId]
					if (cur && cur.index === r.resultIndex && cur.count === r.resultCount)
						return prev
					return {
						...prev,
						[paneId]: {index: r.resultIndex, count: r.resultCount},
					}
				}),
			),
		)
		return () => {
			for (const d of disposables) d.dispose()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [paneIdsKey])

	const applyQuery = (q: string, cs: boolean, rx: boolean) => {
		if (!q) {
			for (const {addon} of paneSearches) addon.clearDecorations()
			setMatches({})
			return
		}
		for (const {paneId, addon} of paneSearches) {
			try {
				addon.findNext(q, {caseSensitive: cs, regex: rx, incremental: true})
			} catch {
				setMatches(prev => ({...prev, [paneId]: {index: -1, count: 0}}))
			}
		}
	}

	const current = paneSearches[paneIndex]

	const go = (dir: 1 | -1) => {
		const q = inputRef.current?.value ?? query
		if (!current || !q) return
		try {
			if (dir > 0) current.addon.findNext(q, {caseSensitive, regex: useRegex})
			else current.addon.findPrevious(q, {caseSensitive, regex: useRegex})
		} catch {
			setMatches(prev => ({...prev, [current.paneId]: {index: -1, count: 0}}))
		}
	}

	/** Jump to the next/prev pane that has at least one match. */
	const jumpPane = (dir: 1 | -1) => {
		if (paneSearches.length <= 1) return
		const q = inputRef.current?.value ?? query
		if (!q) return
		for (let step = 1; step <= paneSearches.length; step++) {
			const i =
				(paneIndex + dir * step + paneSearches.length * step) %
				paneSearches.length
			const target = paneSearches[i]
			if (!target) continue
			const m = matches[target.paneId]
			if (m && m.count > 0) {
				setPaneIndex(i)
				onFocusPane(target.paneId)
				try {
					target.addon.findNext(q, {caseSensitive, regex: useRegex})
				} catch {
					/* noop */
				}
				return
			}
		}
	}

	const close = () => {
		for (const {addon} of paneSearches) addon.clearDecorations()
		setMatches({})
		onClose()
		focusTerm(current?.paneId ?? activePaneId)
	}

	const panesWithHits = paneSearches.filter(
		p => (matches[p.paneId]?.count ?? 0) > 0,
	).length
	const cur = current ? matches[current.paneId] : undefined
	const counter =
		!query || !current
			? '–'
			: !cur
				? `…`
				: cur.count === 0
					? '0/0'
					: `${cur.index + 1}/${cur.count}`
	const paneCounter =
		paneSearches.length <= 1
			? ''
			: !query
				? `${paneIndex + 1}/${paneSearches.length}`
				: `${paneIndex + 1}/${paneSearches.length} · ${panesWithHits} hit${panesWithHits === 1 ? '' : 's'}`

	return (
		<div
			className="searchbar"
			style={{background: bg, color: fg, borderColor: '#3c3c3c'}}
		>
			<input
				ref={inputRef}
				type="text"
				value={query}
				placeholder={
					paneSearches.length > 1 ? 'Find in all panes' : 'Find in terminal'
				}
				aria-label="Find in terminal"
				onChange={e => {
					const q = e.target.value
					setQuery(q)
					applyQuery(q, caseSensitive, useRegex)
				}}
				onKeyDown={e => {
					if (e.key === 'Enter') {
						e.preventDefault()
						if (e.altKey) jumpPane(e.shiftKey ? -1 : 1)
						else go(e.shiftKey ? -1 : 1)
					} else if (e.key === 'Escape') {
						e.preventDefault()
						close()
					}
				}}
			/>
			{paneCounter ? (
				<span
					className="footer-dim search-count search-pane-indicator"
					title="Current pane / total panes"
				>
					{paneCounter}
				</span>
			) : null}
			<span
				className="footer-dim search-count"
				title="Current match / total"
			>
				{counter}
			</span>
			<button
				type="button"
				title="Previous (Shift+Enter)"
				onClick={() => go(-1)}
				aria-label="Previous match"
			>
				↑
			</button>
			<button
				type="button"
				title="Next (Enter)"
				onClick={() => go(1)}
				aria-label="Next match"
			>
				↓
			</button>
			{paneSearches.length > 1 ? (
				<>
					<button
						type="button"
						title="Previous pane with matches (Shift+Alt+Enter)"
						onClick={() => jumpPane(-1)}
						aria-label="Previous pane with matches"
					>
						‹
					</button>
					<button
						type="button"
						title="Next pane with matches (Alt+Enter)"
						onClick={() => jumpPane(1)}
						aria-label="Next pane with matches"
					>
						›
					</button>
				</>
			) : null}
			<button
				type="button"
				title="Match case"
				aria-pressed={caseSensitive}
				className={caseSensitive ? 'search-toggle-on' : ''}
				onClick={() => {
					const v = !caseSensitive
					setCaseSensitive(v)
					applyQuery(query, v, useRegex)
				}}
			>
				Aa
			</button>
			<button
				type="button"
				title="Regular expression"
				aria-pressed={useRegex}
				className={useRegex ? 'search-toggle-on' : ''}
				onClick={() => {
					const v = !useRegex
					setUseRegex(v)
					applyQuery(query, caseSensitive, v)
				}}
			>
				.*
			</button>
			<button
				type="button"
				title="Close (Esc)"
				onClick={close}
				aria-label="Close search"
			>
				×
			</button>
		</div>
	)
}
