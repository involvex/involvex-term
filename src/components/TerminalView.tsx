import {FitAddon} from '@xterm/addon-fit'
import {SearchAddon} from '@xterm/addon-search'
import {WebLinksAddon} from '@xterm/addon-web-links'
import {Terminal} from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import {useEffect, useRef, useState} from 'react'
import {
	COMPLETION_IDLE_MS,
	createCompletionTracker,
} from '../lib/completionToast'
import type {PaneDirection} from '../lib/panes'
import {registerSearch, unregisterSearch} from '../lib/searchRegistry'
import {
	RESIZE_DEBOUNCE_MS,
	SPAWN_FALLBACK_COLS,
	SPAWN_FALLBACK_ROWS,
	SPAWN_POLL_MS,
	SPAWN_READY_TIMEOUT_MS,
	SPAWN_STABLE_SAMPLES,
	isSpawnableGeometry,
	isStableGeometry,
	shouldSyncResize,
} from '../lib/spawnGeometry'
import {
	createMarkController,
	registerTermActions,
	unregisterTermActions,
} from '../lib/termActions'
import {serializeTerminalBuffer} from '../lib/termBuffer'
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

export interface TerminalPaneMenu {
	paneCount: number
	onFind: () => void
	onSplitToward: (toward: PaneDirection) => void
	onSwap: (toward: PaneDirection) => void
	canSwap: (toward: PaneDirection) => boolean
	moveTargets?: {id: string; title: string}[]
	onMoveToTab?: (toTabId: string) => void
	onClosePane: () => void
	onCloseOtherPanes: () => void
	onDuplicateTab: () => void
	onCloseTab: () => void
}

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
	onBackgroundPrompt?: (paneId: string) => void
	/** Resolved spawn cwd from main (title honesty before first OSC7). */
	onResolvedCwd?: (paneId: string, cwd: string) => void
	onToast?: (msg: string) => void
	paneMenu?: TerminalPaneMenu
}

function truncateHint(s: string, max = 42): string {
	const t = s.trim()
	if (t.length <= max) return t
	return `${t.slice(0, max - 1)}…`
}

// Single choke point for every paste gesture. One user action can be
// delivered several times (xterm key handler + native paste event, menu
// roundtrips, remounted effects), so a per-pane module-level gate collapses
// duplicates even across effect closures and delivery delays. Deliberate
// repeat pastes still work — just not within the gate window.
const lastPasteByPane = new Map<string, number>()
const PASTE_GATE_MS = 500

function claimPaste(paneId: string): boolean {
	const now = Date.now()
	if (now - (lastPasteByPane.get(paneId) ?? 0) < PASTE_GATE_MS) return false
	lastPasteByPane.set(paneId, now)
	return true
}

// On Windows the Win key sets metaKey — Win+V / Win+C are system shortcuts
// (clipboard history) and must not be hijacked for terminal paste/copy.
// On macOS metaKey is Cmd, which stays a paste modifier.
const IS_WINDOWS =
	typeof navigator !== 'undefined' &&
	/win/i.test(
		(navigator as Navigator & {userAgentData?: {platform?: string}})
			.userAgentData?.platform ??
			navigator.platform ??
			'',
	)

/** Stagger slot for concurrent pty spawns (multi-tab thundering herd). */
let globalSpawnSlot = 0

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
	onBackgroundPrompt,
	onResolvedCwd,
	onToast,
	paneMenu,
}: Props) {
	const toastRef = useRef(onToast)
	const containerRef = useRef<HTMLDivElement>(null)
	const termRef = useRef<Terminal | null>(null)
	const fitRef = useRef<FitAddon | null>(null)
	const focusedRef = useRef(focused)
	const tabActiveRef = useRef(tabActive)
	const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const completionRef = useRef(createCompletionTracker())
	const completionBellRef = useRef(completionBell)
	const onBgPromptRef = useRef(onBackgroundPrompt)
	const onResolvedCwdRef = useRef(onResolvedCwd)
	const [ctxMenu, setCtxMenu] = useState<TermContextMenuState | null>(null)
	const paneMenuRef = useRef(paneMenu)
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
		completionBellRef.current = completionBell
		onBgPromptRef.current = onBackgroundPrompt
		onResolvedCwdRef.current = onResolvedCwd
	}, [completionBell, onBackgroundPrompt, onResolvedCwd])

	useEffect(() => {
		paneMenuRef.current = paneMenu
	}, [paneMenu])

	useEffect(() => {
		toastRef.current = onToast
	}, [onToast])

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
			exportBuffer: () => serializeTerminalBuffer(term),
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
		// Single choke point for every paste gesture (see claimPaste).
		const pasteClipboard = (): void => {
			if (!claimPaste(paneId)) return
			term.focus()
			if (api) {
				void api
					.clipboardRead()
					.then(async text => {
						if (text) {
							api.ptyWrite(paneId, text)
							return
						}
						// No text — if the clipboard holds an image, forward the
						// keypress (SYN) instead of swallowing it. Foreground TUIs
						// with native image paste (e.g. opencode) probe the
						// clipboard themselves on Ctrl+V and attach the image;
						// dumping a temp path here would only get in their way
						// (plain shells safely ignore SYN).
						try {
							if (await api.clipboardHasImage()) api.ptyWrite(paneId, '\x16')
						} catch {
							/* noop */
						}
					})
					.catch(() => undefined)
			} else {
				const clip = navigator.clipboard
				if (!clip) return
				void clip
					.readText()
					.then(text => {
						if (text) {
							term.paste(text)
							return
						}
						// Web preview has no temp dir to stage images into.
						if (typeof clip.read !== 'function') return
						return clip.read().then(items => {
							if (
								items.some(item => item.types.some(t => t.startsWith('image/')))
							) {
								toastRef.current?.(
									'Clipboard holds an image — terminals accept text only',
								)
							}
						})
					})
					.catch(() => undefined)
			}
		}

		// Windows-Terminal style: Ctrl+C copies ONLY when text is selected
		// (otherwise ^C still interrupts the shell), Ctrl+V pastes.
		// NOTE: returning false alone does NOT stop Chromium's native paste
		// into xterm's hidden textarea (which xterm then forwards via onData).
		// preventDefault + stopPropagation are required so ONLY the manual
		// pasteClipboard() write above reaches the pty — otherwise one Ctrl+V
		// inserts the clipboard 3x (manual + 2x native via textarea+element).
		term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
			const key = ev.key.toLowerCase()
			// Ctrl on all platforms; Cmd (metaKey) only off Windows, where the
			// Win key would otherwise hijack system shortcuts like Win+V.
			const modKey = ev.ctrlKey || (ev.metaKey && !IS_WINDOWS)
			if (ev.ctrlKey && ev.shiftKey && key === 'c') {
				copySelection()
				return false
			}
			if (ev.ctrlKey && ev.shiftKey && key === 'v') {
				ev.preventDefault()
				ev.stopPropagation()
				pasteClipboard()
				return false
			}
			if (modKey && !ev.altKey && key === 'c') {
				if (term.hasSelection()) {
					copySelection()
					return false
				}
				return true // no selection → send ^C to the shell
			}
			if (modKey && !ev.altKey && key === 'v') {
				ev.preventDefault()
				ev.stopPropagation()
				pasteClipboard()
				return false
			}
			if (ev.key === 'Insert') {
				ev.preventDefault()
				ev.stopPropagation()
				if (ev.shiftKey) pasteClipboard()
				else copySelection()
				return false
			}
			return true
		})

		// Capture-phase interceptor: runs before xterm's own bubble-phase
		// `paste` listeners (textarea + element). Swallow the native event so
		// xterm never forwards it via onData, and route it once through the
		// guarded pasteClipboard() above. Covers paste paths that arrive as a
		// DOM event instead of a key (e.g. Electron Edit-menu paste).
		const onPasteDom = (e: Event) => {
			e.preventDefault()
			e.stopPropagation()
			term.focus()
			onFocusPane(paneId)
			pasteClipboard()
		}
		el.addEventListener('paste', onPasteDom, true)

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

			const menuActions = paneMenuRef.current
			if (menuActions) {
				const splitDirs: {id: PaneDirection; label: string}[] = [
					{id: 'right', label: 'Right'},
					{id: 'down', label: 'Down'},
					{id: 'left', label: 'Left'},
					{id: 'up', label: 'Up'},
				]
				const swapDirs: {id: PaneDirection; label: string}[] = [
					{id: 'left', label: 'Left'},
					{id: 'right', label: 'Right'},
					{id: 'up', label: 'Up'},
					{id: 'down', label: 'Down'},
				]
				items.push({
					id: 'find',
					label: 'Find…',
					icon: 'find',
					hint: 'Ctrl+Shift+F',
					run: () => menuActions.onFind(),
				})
				items.push({
					id: 'duplicate-tab',
					label: 'Duplicate tab',
					icon: 'duplicate',
					hint: 'Ctrl+Shift+D',
					run: () => menuActions.onDuplicateTab(),
				})
				items.push({
					id: 'split-pane',
					label: 'Split pane',
					icon: 'split',
					children: splitDirs.map(d => ({
						id: `split-${d.id}`,
						label: d.label,
						run: () => menuActions.onSplitToward(d.id),
					})),
				})
				items.push({
					id: 'swap-pane',
					label: 'Swap pane',
					icon: 'swap',
					children: swapDirs.map(d => ({
						id: `swap-${d.id}`,
						label: d.label,
						disabled: !menuActions.canSwap(d.id),
						run: () => menuActions.onSwap(d.id),
					})),
				})
				if (
					menuActions.onMoveToTab &&
					menuActions.moveTargets &&
					menuActions.moveTargets.length > 0
				) {
					const targets = menuActions.moveTargets
					const moveTo = menuActions.onMoveToTab
					items.push({
						id: 'move-pane',
						label: 'Move pane to tab',
						icon: 'move',
						children: targets.map(t => ({
							id: `move-${t.id}`,
							label: t.title,
							run: () => moveTo(t.id),
						})),
					})
				}
				items.push({
					id: 'close-other',
					label: 'Close other panes',
					icon: 'close-other',
					disabled: menuActions.paneCount <= 1,
					run: () => menuActions.onCloseOtherPanes(),
				})
				items.push({
					id: 'close-pane',
					label: 'Close pane',
					icon: 'close-pane',
					hint: 'Shift+Alt+C',
					run: () => menuActions.onClosePane(),
				})
				items.push({
					id: 'close-tab',
					label: 'Close tab',
					icon: 'close-tab',
					hint: 'Ctrl+Shift+W',
					run: () => menuActions.onCloseTab(),
				})
				items.push({id: 'sep-pane', label: '', separator: true})
			}

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
		let writeQueue = ''
		let writeScheduled = false
		let offPrompt: (() => void) | undefined
		let readyTimer: ReturnType<typeof setTimeout> | null = null
		let readyRo: ResizeObserver | null = null
		let readyPoll: ReturnType<typeof setInterval> | null = null
		let lastProposal: {cols: number; rows: number} | null = null
		let stableCount = 0
		let spawned = false
		let lastSent: {cols: number; rows: number} | null = null
		let resizeDebounce: ReturnType<typeof setTimeout> | null = null

		/** Proposed dims only count once the container is really laid out. */
		const measureSpawnGeometry = (): {cols: number; rows: number} | null => {
			try {
				const dims = fit.proposeDimensions()
				if (dims && isSpawnableGeometry(dims.cols, dims.rows))
					return {cols: dims.cols, rows: dims.rows}
			} catch {
				/* not measurable yet */
			}
			return null
		}

		const stopGate = () => {
			if (readyTimer) {
				clearTimeout(readyTimer)
				readyTimer = null
			}
			if (readyPoll) {
				clearInterval(readyPoll)
				readyPoll = null
			}
			if (readyRo) {
				readyRo.disconnect()
				readyRo = null
			}
		}

		/**
		 * Single choke point for every fit → ConPTY sync. Never calls
		 * fit.fit() on a collapsed container and never pushes <40x10
		 * into ConPTY — a collapsed ConPTY rewraps the pwsh7 PSReadLine
		 * prompt mid-path (vertical `PS D:\re / os\open …` fragments)
		 * and desyncs xterm rows so typing lands mid-screen.
		 */
		const syncToPty = (reason: string): boolean => {
			if (disposed) return false
			if (!tabActiveRef.current) return false
			let dims: {cols: number; rows: number} | null = null
			try {
				const p = fit.proposeDimensions()
				if (p && isSpawnableGeometry(p.cols, p.rows))
					dims = {cols: p.cols, rows: p.rows}
			} catch {
				return false
			}
			if (!dims) return false
			if (!shouldSyncResize(dims.cols, dims.rows, lastSent)) return false
			try {
				fit.fit()
			} catch {
				return false
			}
			if (!shouldSyncResize(term.cols, term.rows, lastSent)) return false
			lastSent = {cols: term.cols, rows: term.rows}
			try {
				api?.ptyResize(paneId, term.cols, term.rows)
			} catch {
				/* noop */
			}
			void reason
			return true
		}

		const syncDebounced = (): void => {
			if (resizeDebounce) clearTimeout(resizeDebounce)
			resizeDebounce = setTimeout(() => {
				resizeDebounce = null
				syncToPty('resize')
			}, RESIZE_DEBOUNCE_MS)
		}

		const spawn = async (cols: number, rows: number) => {
			if (spawned) return
			spawned = true
			// Stagger concurrent spawns: 5 tabs × 3 panes = 15 pwsh7
			// profiles + ConPTYs at once freezes the UI. Spread them.
			try {
				const slot = globalSpawnSlot++ % 5
				if (slot > 0) await new Promise(r => setTimeout(r, slot * 150))
				if (disposed) return
			} catch {
				/* noop */
			}
			if (!api) {
				term.writeln(
					'\x1b[33mNot running in Electron — PTY unavailable.\x1b[0m',
				)
				term.writeln('Run with: bun run dev (vite + Electron).')
				return
			}
			try {
				// Geometry was gated by the caller (stable measure or the
				// 80x24 fallback) — ConPTY must match what PSReadLine sees.
				try {
					term.resize(cols, rows)
				} catch {
					/* noop */
				}
				lastSent = {cols, rows}
				const spawnedResult = await api.ptySpawn({
					id: paneId,
					cwd: initialCwd,
					cols,
					rows,
					profileId,
				})
				if (initialCwd) api.ptySeedCwd(paneId, initialCwd)
				// Main resolves the spawn dir (saved cwd → startDir → home);
				// report it so the tab title matches the real shell dir
				// before the first OSC7 arrives.
				if (spawnedResult?.cwd)
					onResolvedCwdRef.current?.(paneId, spawnedResult.cwd)
				// Refit once the pane has real geometry, then push to ConPTY
				// via the guarded sync (skips collapsed transients).
				requestAnimationFrame(() => {
					if (disposed) return
					syncToPty('post-spawn')
				})
				// Webfont load changes cell size post-fit: re-sync ConPTY once.
				try {
					const fontsReady = document?.fonts?.ready
					if (fontsReady && typeof fontsReady.then === 'function') {
						void fontsReady.then(() => {
							if (disposed) return
							syncToPty('fonts-ready')
						})
					}
				} catch {
					/* fonts API unavailable */
				}
			} catch (err) {
				term.writeln(`\x1b[31mPTY spawn failed: ${String(err)}\x1b[0m`)
				term.writeln('If node-pty is missing, run: bun run rebuild')
				return
			}
			offData = api.onPtyData(paneId, data => {
				// Batch bursty pty output into one xterm write per frame.
				writeQueue += data
				if (!writeScheduled) {
					writeScheduled = true
					requestAnimationFrame(() => {
						writeScheduled = false
						if (disposed) {
							writeQueue = ''
							return
						}
						const chunk = writeQueue
						writeQueue = ''
						if (chunk) {
							try {
								term.write(chunk)
							} catch {
								/* noop */
							}
						}
					})
				}
				if (!completionBellRef.current || !onBgPromptRef.current) return
				const bgPane = !tabActiveRef.current || !focusedRef.current
				if (!bgPane) {
					completionRef.current.noteForeground()
					if (idleTimer.current) clearTimeout(idleTimer.current)
					return
				}
				// Prompt-anchored completion: a toast fires only when background
				// output is followed by a fresh prompt (see onPtyPrompt below).
				// BELs and bursty-but-unfinished output just arm the tracker.
				const r = completionRef.current.data(
					true,
					data.trim().length > 0,
					Date.now(),
				)
				if (r.shouldToast) {
					onBgPromptRef.current(paneId)
					return
				}
				// Legacy idle fallback, armed only for panes that never emitted
				// a prompt OSC (plain shells without cwd hooks).
				if (r.armIdle) {
					if (idleTimer.current) clearTimeout(idleTimer.current)
					idleTimer.current = setTimeout(() => {
						if (
							completionRef.current.idleExpired(
								!tabActiveRef.current || !focusedRef.current,
								Date.now(),
							)
						) {
							onBgPromptRef.current?.(paneId)
						}
					}, COMPLETION_IDLE_MS)
				}
			})
			offPrompt = api.onPtyPrompt(paneId, info => {
				// First prompt is the moment ConPTY + PSReadLine are truly
				// alive: push the final stable size so a spawn→maximize
				// delta re-renders the pwsh7 prompt at the right width
				// instead of leaving it wrapped mid-path.
				requestAnimationFrame(() => syncToPty('first-prompt'))
				if (!completionBellRef.current || !onBgPromptRef.current) return
				if (
					completionRef.current.prompt(
						!tabActiveRef.current || !focusedRef.current,
						info.hadOutput,
						Date.now(),
					)
				) {
					onBgPromptRef.current(paneId)
				}
			})
			offExit = api.onPtyExit(paneId, () =>
				term.writeln('\r\n\x1b[90m[process exited]\x1b[0m'),
			)
			// Suppress ConPTY/xterm Device Attributes replies during startup so
			// they are not typed into PSReadLine as "[?1;2c".
			const spawnAt = Date.now()
			const esc = String.fromCharCode(0x1b)
			const isAutoTermReply = (d: string) => {
				if (!d.startsWith(esc + '[')) return false
				const body = d.slice(2)
				return /^\??[\d;]*c$/.test(body) || /^\d+;\d+R$/.test(body)
			}
			term.onData(d => {
				if (Date.now() - spawnAt < 4000 && isAutoTermReply(d)) return
				api.ptyWrite(paneId, d)
			})
		}
		// Wait for stable layout before spawning: an immediate spawn renders
		// the first prompt at collapsed geometry and PSReadLine wraps it.
		// Fresh launch restores/maximizes the window, so a single >=40x10
		// reading is often an intermediate (1200px → maximized). Require
		// N stable samples. Hidden panes (inactive tabs) never measure up —
		// the timeout covers them with the classic fallback.
		const tryGatedSpawn = (): boolean => {
			if (disposed || spawned) return true
			const g = measureSpawnGeometry()
			if (!g) {
				lastProposal = null
				stableCount = 0
				return false
			}
			if (lastProposal && isStableGeometry(lastProposal, g)) {
				stableCount += 1
			} else {
				stableCount = 1
			}
			lastProposal = g
			if (stableCount < SPAWN_STABLE_SAMPLES) return false
			stopGate()
			void spawn(g.cols, g.rows)
			return true
		}
		if (!tryGatedSpawn()) {
			readyRo = new ResizeObserver(() => {
				tryGatedSpawn()
			})
			readyRo.observe(el)
			readyPoll = setInterval(() => {
				tryGatedSpawn()
			}, SPAWN_POLL_MS)
			readyTimer = setTimeout(() => {
				if (disposed || spawned) return
				stopGate()
				const g = measureSpawnGeometry() ?? {
					cols: SPAWN_FALLBACK_COLS,
					rows: SPAWN_FALLBACK_ROWS,
				}
				void spawn(g.cols, g.rows)
			}, SPAWN_READY_TIMEOUT_MS)
		}

		const ro = new ResizeObserver(() => {
			if (!tabActiveRef.current || !spawned) {
				return
			}
			syncDebounced()
		})
		ro.observe(el)

		return () => {
			disposed = true
			void disposed
			stopGate()
			if (resizeDebounce) clearTimeout(resizeDebounce)
			if (idleTimer.current) clearTimeout(idleTimer.current)
			ro.disconnect()
			el.removeEventListener('contextmenu', onContextMenu)
			el.removeEventListener('mousedown', onMouseDown)
			el.removeEventListener('paste', onPasteDom, true)
			offData?.()
			offExit?.()
			offPrompt?.()
			unregisterSearch(paneId)
			unregisterTermActions(paneId)
			marks.dispose()
			term.dispose()
			termRef.current = null
			// Tear down the pty when this pane unmounts (tab close / session replace).
			api?.ptyKill(paneId)
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
				const fit = fitRef.current
				const dims = fit?.proposeDimensions()
				if (fit && dims && isSpawnableGeometry(dims.cols, dims.rows)) {
					fit.fit()
					if (isSpawnableGeometry(t.cols, t.rows))
						termApi()?.ptyResize(paneId, t.cols, t.rows)
				}
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
				const fit = fitRef.current
				const dims = fit?.proposeDimensions()
				if (fit && dims && isSpawnableGeometry(dims.cols, dims.rows)) {
					fit.fit()
					const t = termRef.current
					if (t && isSpawnableGeometry(t.cols, t.rows))
						termApi()?.ptyResize(paneId, t.cols, t.rows)
				}
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
