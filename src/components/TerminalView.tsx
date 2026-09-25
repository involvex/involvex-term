import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {Terminal} from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {useEffect, useRef, useState} from 'react'
import {registerSearch, unregisterSearch} from '../lib/searchRegistry'
import {
	createMarkController,
	registerTermActions,
	unregisterTermActions,
} from '../lib/termActions'
import {
	copyText,
	openHit,
	resolveContextHit,
	revealHit,
} from '../lib/termContext'
import {createPathLinkProvider, webLinkHandler} from '../lib/termLinks'
import {termApi} from '../types'
import TermContextMenu, {
	type ContextMenuItem,
	type TermContextMenuState,
} from './TermContextMenu'

interface Props {
	/** Unique pty id for this pane. */
	paneId: string
	/** False when another tab is active (pane hidden). */
	tabActive: boolean
	/** True when this is the focused pane of the active tab. */
	focused: boolean
	fontFamily: string
	fontSize: number
	bg: string
	fg: string
	initialCwd?: string
	profileId?: string
	completionBell?: boolean
	scrollback?: number
	scrollbar?: boolean
	onFocusPane: (paneId: string) => void
	onBackgroundIdle?: (paneId: string) => void
}

function truncateHint(s: string, max = 42): string {
	const t = s.trim()
	if (t.length <= max) return t
	return `${t.slice(0, max - 1)}…`
}

export default function TerminalView({
	paneId,
	tabActive,
	focused,
	fontFamily,
	fontSize,
	bg,
	fg,
	initialCwd,
	profileId,
	completionBell = true,
	scrollback = 5000,
	scrollbar = true,
	onFocusPane,
	onBackgroundIdle,
}: Props) {
	const containerRef = useRef<HTMLDivElement>(null)
	const termRef = useRef<Terminal | null>(null)
	const fitRef = useRef<FitAddon | null>(null)
	const focusedRef = useRef(focused)
	const tabActiveRef = useRef(tabActive)
	const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const hadBgOutput = useRef(false)
	const [ctxMenu, setCtxMenu] = useState<TermContextMenuState | null>(null)
	const [menuTabActive, setMenuTabActive] = useState(tabActive)
	if (menuTabActive !== tabActive) {
		setMenuTabActive(tabActive)
		if (!tabActive && ctxMenu) setCtxMenu(null)
	}

	useEffect(() => {
		focusedRef.current = focused
		tabActiveRef.current = tabActive
	}, [focused, tabActive])

	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const api = termApi()
		const term = new Terminal({
			theme: {
				background: bg,
				foreground: fg,
				cursor: fg,
				selectionBackground: '#264f78',
			},
			fontFamily,
			fontSize,
			scrollback,
			cursorBlink: true,
			allowTransparency: false,
		})
		const fit = new FitAddon()
		term.loadAddon(fit)
		term.loadAddon(new WebLinksAddon(webLinkHandler))
		term.registerLinkProvider(createPathLinkProvider(term))
		const search = new SearchAddon()
		term.loadAddon(search)
		registerSearch(paneId, search)
		const marks = createMarkController(term)
		registerTermActions(paneId, {
			clearBuffer: () => {
				term.clear()
				term.focus()
			},
			addMark: () => marks.addMark(),
			jumpPrevMark: () => marks.jumpPrev(),
			jumpNextMark: () => marks.jumpNext(),
		})
		term.open(el)
		termRef.current = term
		fitRef.current = fit

		const copySelection = (): boolean => {
			const sel = term.getSelection()
			if (!sel) return false
			if (api) void api.clipboardWrite(sel).catch(() => undefined)
			else void navigator.clipboard?.writeText(sel).catch(() => undefined)
			term.clearSelection()
			term.focus()
			return true
		}
		const pasteClipboard = (): void => {
			term.focus()
			if (api) {
				void api
					.clipboardRead()
					.then(text => {
						if (text) api.ptyWrite(paneId, text)
					})
					.catch(() => undefined)
			} else {
				void navigator.clipboard
					?.readText()
					.then(text => {
						if (text) term.paste(text)
					})
					.catch(() => undefined)
			}
		}

		// Windows-Terminal style: Ctrl+C copies ONLY when text is selected
		// (otherwise ^C still interrupts the shell), Ctrl+V pastes.
		term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
			const key = ev.key.toLowerCase()
			if (ev.ctrlKey && ev.shiftKey && key === 'c') {
				copySelection()
				return false
			}
			if (ev.ctrlKey && ev.shiftKey && key === 'v') {
				pasteClipboard()
				return false
			}
			if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && key === 'c') {
				if (term.hasSelection()) {
					copySelection()
					return false
				}
				return true // no selection → send ^C to the shell
			}
			if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && key === 'v') {
				pasteClipboard()
				return false
			}
			if (ev.key === 'Insert') {
				if (ev.shiftKey) pasteClipboard()
				else copySelection()
				return false
			}
			return true
		})

		const onContextMenu = (e: MouseEvent) => {
			e.preventDefault()
			e.stopPropagation()
			term.focus()
			onFocusPane(paneId)

			// Shift+right-click keeps the old WT quick copy/paste.
			if (e.shiftKey) {
				if (term.hasSelection()) copySelection()
				else pasteClipboard()
				return
			}

			const hit = resolveContextHit(term, e)
			const hasSelection = term.hasSelection()
			const items: ContextMenuItem[] = []

			if (hit?.kind === 'url') {
				items.push({
					id: 'open-url',
					label: 'Open link in browser',
					hint: truncateHint(hit.text),
					run: () => void openHit(hit),
				})
				items.push({
					id: 'copy-url',
					label: 'Copy link',
					run: () => void copyText(hit.text),
				})
				items.push({id: 'sep-url', label: '', separator: true})
			} else if (hit?.kind === 'email') {
				items.push({
					id: 'open-mail',
					label: 'Send email…',
					hint: truncateHint(hit.text.replace(/^mailto:/i, '')),
					run: () => void openHit(hit),
				})
				items.push({
					id: 'copy-mail',
					label: 'Copy address',
					run: () => void copyText(hit.text.replace(/^mailto:/i, '')),
				})
				items.push({id: 'sep-mail', label: '', separator: true})
			} else if (hit?.kind === 'path') {
				items.push({
					id: 'open-path',
					label: 'Open',
					hint: truncateHint(hit.text),
					run: () => void openHit(hit),
				})
				items.push({
					id: 'reveal-path',
					label: 'Reveal in Explorer',
					run: () => void revealHit(hit),
				})
				items.push({
					id: 'copy-path',
					label: 'Copy path',
					run: () => void copyText(hit.text),
				})
				items.push({id: 'sep-path', label: '', separator: true})
			} else if (hit?.kind === 'text' && hit.text.length > 0 && !hasSelection) {
				items.push({
					id: 'copy-word',
					label: 'Copy',
					hint: truncateHint(hit.text),
					run: () => void copyText(hit.text),
				})
				items.push({id: 'sep-word', label: '', separator: true})
			}

			items.push({
				id: 'copy',
				label: 'Copy',
				hint: 'Ctrl+Shift+C',
				disabled: !hasSelection,
				run: () => {
					copySelection()
				},
			})
			items.push({
				id: 'paste',
				label: 'Paste',
				hint: 'Ctrl+Shift+V',
				run: () => pasteClipboard(),
			})
			items.push({id: 'sep-edit', label: '', separator: true})
			items.push({
				id: 'select-all',
				label: 'Select all',
				run: () => {
					term.selectAll()
					term.focus()
				},
			})
			items.push({
				id: 'clear',
				label: 'Clear buffer',
				hint: 'Ctrl+Shift+K',
				run: () => {
					term.clear()
					term.focus()
				},
			})
			items.push({
				id: 'mark',
				label: 'Mark prompt',
				hint: 'Ctrl+Shift+M',
				run: () => marks.addMark(),
			})

			setCtxMenu({
				x: e.clientX,
				y: e.clientY,
				hit,
				hasSelection,
				items,
			})
		}
		const onMouseDown = (e: MouseEvent) => {
			term.focus()
			onFocusPane(paneId)
			if (e.button === 0) setCtxMenu(null)
		}
		el.addEventListener('contextmenu', onContextMenu)
		el.addEventListener('mousedown', onMouseDown)

		let disposed = false
		let offData: (() => void) | undefined
		let offExit: (() => void) | undefined

		const spawn = async () => {
			if (!api) {
				term.writeln(
					'\x1b[33mNot running in Electron — PTY unavailable.\x1b[0m',
				)
				term.writeln('Run with: bun run dev:electron (vite + Electron).')
				return
			}
			try {
				fit.fit()
				const dims = {cols: term.cols || 80, rows: term.rows || 24}
				await api.ptySpawn({
					id: paneId,
					cwd: initialCwd,
					cols: dims.cols,
					rows: dims.rows,
					profileId,
				})
				if (initialCwd) api.ptySeedCwd(paneId, initialCwd)
			} catch (err) {
				term.writeln(`\x1b[31mPTY spawn failed: ${String(err)}\x1b[0m`)
				term.writeln('If node-pty is missing, run: bun run rebuild')
				return
			}
			offData = api.onPtyData(paneId, data => {
				term.write(data)
				if (!completionBell || !onBackgroundIdle) return
				const bgPane = !tabActiveRef.current || !focusedRef.current
				if (!bgPane) {
					hadBgOutput.current = false
					if (idleTimer.current) clearTimeout(idleTimer.current)
					return
				}
				if (data.includes('\x07')) {
					onBackgroundIdle(paneId)
					return
				}
				if (data.trim().length === 0) return
				hadBgOutput.current = true
				if (idleTimer.current) clearTimeout(idleTimer.current)
				idleTimer.current = setTimeout(() => {
					if (
						hadBgOutput.current &&
						(!tabActiveRef.current || !focusedRef.current)
					) {
						hadBgOutput.current = false
						onBackgroundIdle(paneId)
					}
				}, 1200)
			})
			offExit = api.onPtyExit(paneId, () =>
				term.writeln('\r\n\x1b[90m[process exited]\x1b[0m'),
			)
			term.onData(d => api.ptyWrite(paneId, d))
		}
		void spawn()

		const ro = new ResizeObserver(() => {
			if (!tabActiveRef.current) return
			try {
				fit.fit()
				api?.ptyResize(paneId, term.cols, term.rows)
			} catch {
				/* noop */
			}
		})
		ro.observe(el)

		return () => {
			disposed = true
			void disposed
			if (idleTimer.current) clearTimeout(idleTimer.current)
			ro.disconnect()
			el.removeEventListener('contextmenu', onContextMenu)
			el.removeEventListener('mousedown', onMouseDown)
			offData?.()
			offExit?.()
			unregisterSearch(paneId)
			unregisterTermActions(paneId)
			marks.dispose()
			term.dispose()
			termRef.current = null
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [paneId])

	// Focus requests from overlays (search bar, palette) closing.
	useEffect(() => {
		const onFocusReq = (e: Event) => {
			if ((e as CustomEvent<string>).detail === paneId) {
				termRef.current?.focus()
			}
		}
		window.addEventListener('involvex:focus-term', onFocusReq)
		return () => window.removeEventListener('involvex:focus-term', onFocusReq)
	}, [paneId])

	// Apply theme/font/scrollback live
	useEffect(() => {
		const t = termRef.current
		if (t) {
			t.options.theme = {
				background: bg,
				foreground: fg,
				cursor: fg,
				selectionBackground: '#264f78',
			}
			t.options.fontFamily = fontFamily
			t.options.fontSize = fontSize
			t.options.scrollback = scrollback
			try {
				fitRef.current?.fit()
				termApi()?.ptyResize(paneId, t.cols, t.rows)
			} catch {
				/* noop */
			}
		}
	}, [bg, fg, fontFamily, fontSize, scrollback, paneId])

	// Refit + focus when this becomes the focused pane of the active tab.
	useEffect(() => {
		if (!focused || !tabActive) return
		requestAnimationFrame(() => {
			try {
				fitRef.current?.fit()
				const t = termRef.current
				if (t) termApi()?.ptyResize(paneId, t.cols, t.rows)
				termRef.current?.focus()
			} catch {
				/* noop */
			}
		})
	}, [focused, tabActive, paneId])

	return (
		<>
			<div
				ref={containerRef}
				className={scrollbar ? undefined : 'term-no-scrollbar'}
				style={{
					display: tabActive ? 'block' : 'none',
					width: '100%',
					height: '100%',
					background: bg,
				}}
			/>
			{ctxMenu && tabActive ? (
				<TermContextMenu
					menu={ctxMenu}
					onClose={() => {
						setCtxMenu(null)
						termRef.current?.focus()
					}}
				/>
			) : null}
		</>
	)
}
