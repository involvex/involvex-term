import {useCallback, useEffect, useRef, useState} from 'react'
import './App.css'
import type {PaletteCommand} from './commands'
import CommandPalette from './components/CommandPalette'
import PaneLayout from './components/PaneLayout'
import SearchBar from './components/SearchBar'
import SettingsModal from './components/SettingsModal'
import StatusBar from './components/StatusBar'
import TabBar, {type TabInfo} from './components/TabBar'
import {
	collectLeaves,
	countLeaves,
	findLeaf,
	firstLeaf,
	mapLeafCwd,
	newPaneId,
	normalizeSessionRoot,
	removeLeaf,
	splitLeaf,
	updateSplitRatio,
	type PaneLeaf,
	type SplitDir,
} from './lib/panes'
import {getTermActions} from './lib/termActions'
import {
	isElectron,
	termApi,
	type AppSettings,
	type GitStatus,
	type OpencodeStatus,
	type SysStats,
	type UpdateStatus,
} from './types'

const DEFAULT_SETTINGS: AppSettings = {
	theme: {
		bg: '#1e1e1e',
		fg: '#cccccc',
		fontFamily:
			"'Cascadia Code', 'CaskaydiaCove Nerd Font', Consolas, monospace",
		fontSize: 14,
		fontFallback: "'JetBrainsMono Nerd Font', 'FiraCode Nerd Font', monospace",
	},
	footer: {
		showGit: true,
		showSys: true,
		showCpu: true,
		showMem: true,
		showOpencode: true,
		modulesOrder: ['git', 'opencode', 'sys'],
		refreshMs: 1500,
	},
	hotkeys: {
		'new-tab': 'Ctrl+Shift+T',
		'close-tab': 'Ctrl+Shift+W',
		'next-tab': 'Ctrl+Tab',
		'prev-tab': 'Ctrl+Shift+Tab',
		'duplicate-tab': 'Ctrl+Shift+D',
		settings: 'Ctrl+,',
		find: 'Ctrl+Shift+F',
		palette: 'Ctrl+Shift+P',
		opencode: 'Ctrl+Shift+O',
		'split-pane': 'Shift+Alt+D',
		'split-pane-vertical': 'Shift+Alt+V',
		'close-pane': 'Shift+Alt+C',
		'zoom-in': 'Ctrl+=',
		'zoom-out': 'Ctrl+-',
		'zoom-reset': 'Ctrl+0',
		'clear-buffer': 'Ctrl+Shift+K',
		'mark-prompt': 'Ctrl+Shift+M',
		'prev-mark': 'Ctrl+Shift+Up',
		'next-mark': 'Ctrl+Shift+Down',
		'check-updates': 'Ctrl+Shift+U',
	},
	tabs: {confirmClose: false, restoreSession: true},
	terminal: {
		startDir: '',
		defaultProfileId: 'pwsh',
		profiles: [
			{id: 'pwsh', name: 'PowerShell 7', kind: 'pwsh'},
			{id: 'powershell', name: 'Windows PowerShell', kind: 'powershell'},
			{id: 'cmd', name: 'Command Prompt', kind: 'cmd'},
			{id: 'wsl', name: 'WSL', kind: 'wsl'},
		],
		completionBell: true,
		scrollback: 5000,
		scrollbar: true,
		snippets: [
			{
				id: 'git-status',
				name: 'Git status',
				command: 'git status',
				sendEnter: true,
			},
			{
				id: 'bun-build',
				name: 'Bun build',
				command: 'bun run build',
				sendEnter: true,
			},
			{
				id: 'opencode-continue',
				name: 'OpenCode continue',
				command: 'opencode -c',
				sendEnter: true,
			},
		],
	},
	startup: {mode: 'session', profileId: ''},
	window: {
		width: 1200,
		height: 800,
		x: null,
		y: null,
		maximized: false,
		acrylic: false,
		checkUpdatesOnStartup: true,
	},
	tray: {enabled: true, minimizeToTray: true, closeToTray: true},
	quake: {
		enabled: false,
		hotkey: 'Ctrl+`',
		heightPercent: 50,
		hideOnFocusLoss: true,
	},
}

function effectiveFontFamily(theme: AppSettings['theme']): string {
	const primary = theme.fontFamily?.trim() || ''
	const fallback = theme.fontFallback?.trim() || ''
	if (!fallback) return primary
	if (!primary) return fallback
	return `${primary}, ${fallback}`
}

let tabSeq = 0
function newTab(cwd?: string, profileId?: string): TabInfo {
	tabSeq += 1
	const paneId = newPaneId()
	const leaf: PaneLeaf = {kind: 'leaf', paneId, cwd, profileId}
	return {
		id: `tab-${Date.now()}-${tabSeq}`,
		title: `Tab ${tabSeq}`,
		cwd,
		root: leaf,
		activePaneId: paneId,
	}
}

export default function App() {
	const [tabs, setTabs] = useState<TabInfo[]>(() => [newTab()])
	const [activeId, setActiveId] = useState<string>(() => tabs[0]?.id ?? '')
	const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
	const [showSettings, setShowSettings] = useState(false)
	const [git, setGit] = useState<GitStatus | null>(null)
	const [sys, setSys] = useState<SysStats | null>(null)
	const [cwd, setCwd] = useState('')
	const [searchOpen, setSearchOpen] = useState(false)
	const [paletteOpen, setPaletteOpen] = useState(false)
	const [opencodeAvailable, setOpencodeAvailable] = useState(true)
	const [opencode, setOpencode] = useState<OpencodeStatus | null>(null)
	const [toast, setToast] = useState<string | null>(null)
	// Latest-value refs for use inside IPC callbacks (synced in effects,
	// never written during render).
	const tabsRef = useRef(tabs)
	const activeRef = useRef(activeId)
	useEffect(() => {
		tabsRef.current = tabs
	}, [tabs])
	useEffect(() => {
		activeRef.current = activeId
	}, [activeId])
	const settingsRef = useRef(settings)
	useEffect(() => {
		settingsRef.current = settings
	}, [settings])

	const activeTab = tabs.find(t => t.id === activeId) || tabs[0]

	// Detect OpenCode CLI on PATH (main process).
	useEffect(() => {
		const api = termApi()
		if (!api) return
		api
			.opencodeAvailable()
			.then(setOpencodeAvailable)
			.catch(() => setOpencodeAvailable(false))
	}, [])

	// Poll OpenCode session status for the status bar.
	useEffect(() => {
		const api = termApi()
		if (!api || !settings.footer.showOpencode) return
		let cancelled = false
		const tick = () => {
			api
				.opencodeStatus(cwd || undefined)
				.then(s => {
					if (!cancelled) {
						setOpencode(s)
						setOpencodeAvailable(s.available)
					}
				})
				.catch(() => {
					if (!cancelled)
						setOpencode({
							available: false,
							sessionCount: 0,
							latest: null,
							projectMatch: false,
						})
				})
		}
		tick()
		// CLI spawn is heavier than sysinfo — floor at 5s.
		const ms = Math.max(5000, settings.footer.refreshMs || 1500)
		const timer = setInterval(tick, ms)
		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [cwd, settings.footer.showOpencode, settings.footer.refreshMs])

	/** Inject an OpenCode CLI command into the focused pane. */
	const writeOpencodeCmd = useCallback((cmd: string) => {
		const api = termApi()
		if (!api) return
		const tab = tabsRef.current.find(t => t.id === activeRef.current)
		const paneId = tab?.activePaneId
		if (!paneId) return
		api.ptyWrite(paneId, '\x03')
		setTimeout(() => api.ptyWrite(paneId, `${cmd}\r`), 50)
	}, [])

	/** Fresh OpenCode TUI in the focused pane. */
	const launchOpencode = useCallback(() => {
		writeOpencodeCmd('opencode')
	}, [writeOpencodeCmd])

	/** Continue a session (by id) or the last session (`-c`). */
	const continueOpencode = useCallback(
		(sessionId?: string) => {
			writeOpencodeCmd(sessionId ? `opencode -s ${sessionId}` : 'opencode -c')
		},
		[writeOpencodeCmd],
	)

	const runSnippet = useCallback((command: string, sendEnter: boolean) => {
		const api = termApi()
		if (!api) return
		const tab = tabsRef.current.find(t => t.id === activeRef.current)
		const paneId = tab?.activePaneId
		if (!paneId) return
		api.ptyWrite(paneId, sendEnter ? `${command}\r` : command)
	}, [])

	const activePaneActions = useCallback(() => {
		const tab = tabsRef.current.find(t => t.id === activeRef.current)
		if (!tab?.activePaneId) return undefined
		return getTermActions(tab.activePaneId)
	}, [])

	const showUpdateToast = useCallback((s: UpdateStatus) => {
		if (s.message) {
			setToast(s.message)
			window.setTimeout(() => setToast(null), 4000)
		}
	}, [])

	const checkUpdates = useCallback(async () => {
		const api = termApi()
		if (!api) return
		setToast('Checking for updates…')
		try {
			const s = (await api.updateCheck()) as UpdateStatus
			showUpdateToast(s)
			if (s.state === 'available') {
				const ok = await api.dialogConfirm({
					title: 'Update available',
					message: `Version ${s.version} is available. Download now?`,
					detail: `Current: ${s.currentVersion}`,
					buttons: ['Download', 'Later'],
				})
				if (ok) {
					const d = (await api.updateDownload()) as UpdateStatus
					showUpdateToast(d)
					if (d.state === 'downloaded') await api.updateInstall()
				}
			}
		} catch (e) {
			setToast(e instanceof Error ? e.message : String(e))
		}
	}, [showUpdateToast])

	useEffect(() => {
		const api = termApi()
		if (!api) return
		const off = api.onUpdateStatus(s => {
			const st = s as UpdateStatus
			if (st.state === 'downloaded') showUpdateToast(st)
			else if (st.state === 'available' && st.message) setToast(st.message)
		})
		return off
	}, [showUpdateToast])

	// Load settings (+ restore previous session on fresh launch)
	useEffect(() => {
		const api = termApi()
		if (!api) return
		api
			.settingsGet()
			.then(async s => {
				const merged = {...DEFAULT_SETTINGS, ...(s as AppSettings)}
				setSettings(merged)

				const openFresh = () => {
					const profileId =
						merged.startup.profileId || merged.terminal.defaultProfileId
					const start = merged.terminal.startDir.trim() || undefined
					const t = newTab(start, profileId)
					setTabs([t])
					setActiveId(t.id)
				}

				const wantSession =
					merged.startup.mode === 'session' && merged.tabs.restoreSession
				if (!wantSession) {
					openFresh()
					return
				}
				try {
					const session = await api.sessionGet()
					const saved = session?.tabs ?? []
					if (saved.length === 0) {
						openFresh()
						return
					}
					const restored: TabInfo[] = []
					for (const [i, st] of saved.entries()) {
						const root = normalizeSessionRoot(st.root)
						if (!root) continue
						tabSeq += 1
						restored.push({
							id: `tab-restored-${Date.now()}-${i}`,
							title: st.title || `Tab ${tabSeq}`,
							customTitle: st.customTitle,
							cwd: undefined,
							root,
							activePaneId: firstLeaf(root).paneId,
						})
					}
					if (restored.length > 0) {
						setTabs(restored)
						setActiveId(restored[0].id)
					} else {
						openFresh()
					}
				} catch {
					openFresh()
				}
			})
			.catch(() => undefined)
		const off = api.onSettingsChanged(s =>
			setSettings({...DEFAULT_SETTINGS, ...(s as AppSettings)}),
		)
		return off
	}, [])

	// Sys stats
	useEffect(() => {
		const api = termApi()
		if (!api) return
		api
			.sysGet()
			.then(s => setSys(s as SysStats))
			.catch(() => undefined)
		const off = api.onSysTick(s => setSys(s as SysStats))
		return off
	}, [])

	// Git status for the active pane: subscribe per-pane + global events.
	// Main tracks cwd per pty (= pane) id; the owning tab gets the title.
	const activePaneId = activeTab?.activePaneId ?? ''
	useEffect(() => {
		const api = termApi()
		if (!api || !activeId || !activePaneId) return
		const off1 = api.onGitChangedFor(activePaneId, st => {
			setGit(st as GitStatus)
			setCwd((st as GitStatus).cwd || '')
			setTabs(prev =>
				prev.map(t => {
					if (t.id !== activeId || t.customTitle) return t
					return {
						...t,
						cwd: (st as GitStatus).cwd,
						title: shortTitle((st as GitStatus).cwd, (st as GitStatus).branch),
					}
				}),
			)
		})
		const off2 = api.onGitChanged(msg => {
			const owner = tabsRef.current.find(t => findLeaf(t.root, msg.tabId))
			if (!owner || owner.id !== activeRef.current) return
			setGit(msg as unknown as GitStatus)
			const g = msg as unknown as GitStatus
			setCwd(g.cwd || '')
		})
		return () => {
			off1()
			off2()
		}
	}, [activeId, activePaneId])

	const closeTab = useCallback(async (id: string) => {
		if (settingsRef.current.tabs.confirmClose) {
			const tab = tabsRef.current.find(t => t.id === id)
			const label = tab?.title || 'this tab'
			const api = termApi()
			const ok = api
				? await api.dialogConfirm({
						message: `Close "${label}"?`,
						detail: 'The terminal session in this tab will be terminated.',
						title: 'Close tab',
						buttons: ['Close', 'Cancel'],
					})
				: window.confirm(`Close ${label}?`)
			if (!ok) return
		}
		setTabs(prev => {
			const closing = prev.find(t => t.id === id)
			if (closing) {
				const api = termApi()
				for (const leaf of collectLeaves(closing.root))
					api?.ptyKill(leaf.paneId)
			}
			if (prev.length === 1) {
				// Keep at least one tab: fresh tab with a single pane
				const startDir =
					settingsRef.current.terminal.startDir.trim() || undefined
				const nt = newTab(
					startDir,
					settingsRef.current.terminal.defaultProfileId,
				)
				setActiveId(nt.id)
				return [nt]
			}
			const idx = prev.findIndex(t => t.id === id)
			const next = prev.filter(t => t.id !== id)
			if (id === activeRef.current) {
				const at = next[Math.max(0, idx - 1)] || next[0]
				if (at) setActiveId(at.id)
			}
			return next
		})
	}, [])

	const addTab = useCallback(
		(cwdToUse?: string, profileId?: string) => {
			const startDir = settingsRef.current.terminal.startDir.trim()
			const pid = profileId || settingsRef.current.terminal.defaultProfileId
			const nt = newTab(
				cwdToUse ?? (startDir || git?.cwd || cwd || undefined),
				pid,
			)
			setTabs(prev => [...prev, nt])
			setActiveId(nt.id)
		},
		[git?.cwd, cwd],
	)

	const renameTab = useCallback((id: string, title: string) => {
		setTabs(prev =>
			prev.map(t => (t.id === id ? {...t, title, customTitle: title} : t)),
		)
	}, [])

	const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
		setTabs(prev => {
			if (
				fromIndex < 0 ||
				toIndex < 0 ||
				fromIndex >= prev.length ||
				toIndex >= prev.length
			)
				return prev
			const next = [...prev]
			const [moved] = next.splice(fromIndex, 1)
			if (!moved) return prev
			next.splice(toIndex, 0, moved)
			return next
		})
	}, [])

	const showCompletionToast = useCallback((paneId: string) => {
		if (!settingsRef.current.terminal.completionBell) return
		const tab = tabsRef.current.find(t => findLeaf(t.root, paneId))
		const label = tab?.title || 'Background pane'
		setToast(`${label} finished`)
		window.setTimeout(() => setToast(null), 2800)
	}, [])

	// Focus a pane within its tab.
	const focusPane = useCallback((tabId: string, paneId: string) => {
		setTabs(prev =>
			prev.map(t => (t.id === tabId ? {...t, activePaneId: paneId} : t)),
		)
	}, [])

	// Split the active pane; the new pane inherits the tab's current cwd.
	const splitPane = useCallback(
		(dir: SplitDir) => {
			const tabId = activeRef.current
			const tab = tabsRef.current.find(t => t.id === tabId)
			if (!tab || !findLeaf(tab.root, tab.activePaneId)) return
			const activeLeaf = findLeaf(tab.root, tab.activePaneId)
			const paneId = newPaneId()
			const newLeaf: PaneLeaf = {
				kind: 'leaf',
				paneId,
				cwd: git?.cwd || cwd || undefined,
				profileId:
					activeLeaf?.profileId ||
					settingsRef.current.terminal.defaultProfileId,
			}
			setTabs(prev =>
				prev.map(t =>
					t.id === tabId
						? {
								...t,
								root: splitLeaf(t.root, t.activePaneId, newLeaf, dir),
								activePaneId: paneId,
							}
						: t,
				),
			)
		},
		[git?.cwd, cwd],
	)

	// Drag a split divider to a new ratio.
	const resizeSplit = useCallback(
		(tabId: string, splitId: string, ratio: number) => {
			setTabs(prev =>
				prev.map(t =>
					t.id === tabId
						? {...t, root: updateSplitRatio(t.root, splitId, ratio)}
						: t,
				),
			)
		},
		[],
	)
	// Close the active pane; last pane closes the tab instead.
	const closePane = useCallback(() => {
		const tabId = activeRef.current
		const tab = tabsRef.current.find(t => t.id === tabId)
		if (!tab) return
		if (countLeaves(tab.root) <= 1) {
			closeTab(tabId)
			return
		}
		termApi()?.ptyKill(tab.activePaneId)
		setTabs(prev =>
			prev.map(t => {
				if (t.id !== tabId) return t
				const root = removeLeaf(t.root, t.activePaneId)
				if (!root) return t
				return {...t, root, activePaneId: firstLeaf(root).paneId}
			}),
		)
	}, [closeTab])

	// Switch tab (also dismisses the find bar).
	const selectTab = useCallback((id: string) => {
		setActiveId(id)
		setSearchOpen(false)
	}, [])

	// Menu / hotkey actions from main
	useEffect(() => {
		const api = termApi()
		if (!api) return
		const off = api.onTabAction(action => {
			const tabsNow = tabsRef.current
			const active = activeRef.current
			const idx = tabsNow.findIndex(t => t.id === active)
			if (action === 'new-tab') addTab()
			else if (action === 'close-tab') closeTab(active)
			else if (action === 'duplicate-tab') {
				const tab = tabsRef.current.find(t => t.id === active)
				const leaf = tab ? findLeaf(tab.root, tab.activePaneId) : null
				addTab(git?.cwd || cwd || undefined, leaf?.profileId)
			} else if (action === 'next-tab' && tabsNow.length > 1)
				selectTab(tabsNow[(idx + 1) % tabsNow.length]?.id || active)
			else if (action === 'prev-tab' && tabsNow.length > 1)
				selectTab(
					tabsNow[(idx - 1 + tabsNow.length) % tabsNow.length]?.id || active,
				)
			else if (action === 'open-settings') setShowSettings(true)
			else if (action === 'open-search') setSearchOpen(true)
			else if (action === 'open-palette') setPaletteOpen(true)
			else if (action === 'open-opencode') launchOpencode()
			else if (action === 'split-pane') splitPane('horizontal')
			else if (action === 'split-pane-vertical') splitPane('vertical')
			else if (action === 'close-pane') closePane()
			else if (action === 'clear-buffer') activePaneActions()?.clearBuffer()
			else if (action === 'mark-prompt') activePaneActions()?.addMark()
			else if (action === 'prev-mark') activePaneActions()?.jumpPrevMark()
			else if (action === 'next-mark') activePaneActions()?.jumpNextMark()
			else if (action === 'check-updates') void checkUpdates()
		})
		return off
	}, [
		addTab,
		closeTab,
		selectTab,
		splitPane,
		closePane,
		launchOpencode,
		activePaneActions,
		checkUpdates,
		git?.cwd,
		cwd,
	])

	// Keyboard shortcuts in renderer (works in dev + packaged)
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Never hijack keys typed into inputs (settings fields, find bar…).
			const target = e.target as HTMLElement | null
			if (
				target &&
				(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
			)
				return
			const mod = e.ctrlKey || e.metaKey
			const key = e.key.toLowerCase()
			if (mod && e.shiftKey && key === 't') {
				e.preventDefault()
				addTab()
			} else if (mod && e.shiftKey && key === 'f') {
				e.preventDefault()
				setSearchOpen(true)
			} else if (mod && e.shiftKey && key === 'p') {
				e.preventDefault()
				setPaletteOpen(true)
			} else if (mod && e.shiftKey && key === 'o') {
				e.preventDefault()
				launchOpencode()
			} else if (mod && e.shiftKey && key === 'w') {
				e.preventDefault()
				if (activeRef.current) closeTab(activeRef.current)
			} else if (mod && key === 'tab') {
				e.preventDefault()
				const ts = tabsRef.current
				const i = ts.findIndex(t => t.id === activeRef.current)
				const n = e.shiftKey
					? (i - 1 + ts.length) % ts.length
					: (i + 1) % ts.length
				const nt = ts[n]
				if (nt) selectTab(nt.id)
			} else if (mod && e.shiftKey && key === 'd') {
				e.preventDefault()
				addTab(git?.cwd || cwd || undefined)
			} else if (e.altKey && e.shiftKey && !mod && key === 'd') {
				// Split active pane horizontally (stacked), like Windows Terminal.
				e.preventDefault()
				splitPane('horizontal')
			} else if (e.altKey && e.shiftKey && !mod && key === 'v') {
				// Split active pane vertically (side-by-side).
				e.preventDefault()
				splitPane('vertical')
			} else if (e.altKey && e.shiftKey && !mod && key === 'c') {
				e.preventDefault()
				closePane()
			} else if (mod && e.shiftKey && key === 'k') {
				e.preventDefault()
				activePaneActions()?.clearBuffer()
			} else if (mod && e.shiftKey && key === 'm') {
				e.preventDefault()
				activePaneActions()?.addMark()
			} else if (mod && e.shiftKey && e.key === 'ArrowUp') {
				e.preventDefault()
				activePaneActions()?.jumpPrevMark()
			} else if (mod && e.shiftKey && e.key === 'ArrowDown') {
				e.preventDefault()
				activePaneActions()?.jumpNextMark()
			} else if (mod && e.shiftKey && key === 'u') {
				e.preventDefault()
				void checkUpdates()
			} else if (mod && key === ',') {
				e.preventDefault()
				setShowSettings(true)
			} else if (mod && /^[1-9]$/.test(key)) {
				const i = Number(key) - 1
				const t = tabsRef.current[Math.min(i, tabsRef.current.length - 1)]
				if (t && (key !== '9' || i < 8)) selectTab(t.id)
				else if (key === '9') {
					const last = tabsRef.current[tabsRef.current.length - 1]
					if (last) selectTab(last.id)
				}
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [
		addTab,
		closeTab,
		selectTab,
		splitPane,
		closePane,
		launchOpencode,
		activePaneActions,
		checkUpdates,
		git?.cwd,
		cwd,
	])

	const saveSettings = useCallback((next: AppSettings) => {
		setSettings(next)
		termApi()
			?.settingsSet(next)
			.catch(() => undefined)
	}, [])

	// Snapshot tabs (split trees + live per-pane cwds) for session restore.
	const persistSession = useCallback(async () => {
		const api = termApi()
		if (!api) return
		try {
			const tabsNow = tabsRef.current
			const ids = tabsNow.flatMap(t => collectLeaves(t.root).map(l => l.paneId))
			const cwds = new Map<string, string | null>()
			if (ids.length > 0) {
				for (const {id, cwd} of await api.ptyCwd(ids)) cwds.set(id, cwd)
			}
			await api.sessionSave({
				version: 1,
				tabs: tabsNow.map(t => ({
					title: t.customTitle || t.title,
					customTitle: t.customTitle,
					root: mapLeafCwd(t.root, cwds),
				})),
			})
		} catch {
			/* best-effort */
		}
	}, [])

	// Debounced save on any tab/pane change…
	useEffect(() => {
		if (!termApi()) return
		const timer = setTimeout(() => {
			void persistSession()
		}, 1500)
		return () => clearTimeout(timer)
	}, [tabs, persistSession])

	// …plus a fire-and-forget flush on unload (uses last-known cwds).
	useEffect(() => {
		const flush = () => {
			const api = termApi()
			if (!api) return
			try {
				api.sessionSaveSync({
					version: 1,
					tabs: tabsRef.current.map(t => ({
						title: t.customTitle || t.title,
						customTitle: t.customTitle,
						root: t.root,
					})),
				})
			} catch {
				/* noop */
			}
		}
		window.addEventListener('beforeunload', flush)
		return () => window.removeEventListener('beforeunload', flush)
	}, [])

	const paletteCommands: PaletteCommand[] = [
		{
			id: 'cmd:new-tab',
			title: 'New tab',
			hint: 'Ctrl+Shift+T',
			run: () => addTab(),
		},
		{
			id: 'cmd:close-tab',
			title: 'Close active tab',
			hint: 'Ctrl+Shift+W',
			run: () => {
				if (activeRef.current) closeTab(activeRef.current)
			},
		},
		{
			id: 'cmd:duplicate-tab',
			title: 'Duplicate active tab',
			hint: 'Ctrl+Shift+D',
			run: () => addTab(git?.cwd || cwd || undefined),
		},
		{
			id: 'cmd:find',
			title: 'Find in terminal…',
			hint: 'Ctrl+Shift+F',
			run: () => setSearchOpen(true),
		},
		{
			id: 'cmd:split-pane',
			title: 'Split pane horizontally',
			hint: 'Shift+Alt+D',
			run: () => splitPane('horizontal'),
		},
		{
			id: 'cmd:split-pane-vertical',
			title: 'Split pane vertically',
			hint: 'Shift+Alt+V',
			run: () => splitPane('vertical'),
		},
		{
			id: 'cmd:close-pane',
			title: 'Close active pane',
			hint: 'Shift+Alt+C',
			run: () => closePane(),
		},
		{
			id: 'cmd:settings',
			title: 'Open settings',
			hint: 'Ctrl+,',
			run: () => setShowSettings(true),
		},
		{
			id: 'cmd:opencode',
			title: 'Open OpenCode',
			hint: opencodeAvailable ? 'Ctrl+Shift+O' : 'not found on PATH',
			run: () => launchOpencode(),
		},
		{
			id: 'cmd:opencode-continue',
			title: 'Continue OpenCode session',
			hint: opencode?.latest
				? shortOcHint(opencode.latest.title)
				: 'opencode -c',
			run: () => continueOpencode(opencode?.latest?.id),
		},
		{
			id: 'cmd:clear-buffer',
			title: 'Clear buffer',
			hint: 'Ctrl+Shift+K',
			run: () => activePaneActions()?.clearBuffer(),
		},
		{
			id: 'cmd:mark-prompt',
			title: 'Mark prompt',
			hint: 'Ctrl+Shift+M',
			run: () => activePaneActions()?.addMark(),
		},
		{
			id: 'cmd:prev-mark',
			title: 'Jump to previous mark',
			hint: 'Ctrl+Shift+Up',
			run: () => activePaneActions()?.jumpPrevMark(),
		},
		{
			id: 'cmd:next-mark',
			title: 'Jump to next mark',
			hint: 'Ctrl+Shift+Down',
			run: () => activePaneActions()?.jumpNextMark(),
		},
		{
			id: 'cmd:check-updates',
			title: 'Check for updates…',
			hint: 'Ctrl+Shift+U',
			run: () => void checkUpdates(),
		},
		...settings.terminal.snippets.map(s => ({
			id: `cmd:snippet-${s.id}`,
			title: `Run: ${s.name}`,
			hint: s.command,
			run: () => runSnippet(s.command, s.sendEnter !== false),
		})),
		...settings.terminal.profiles.map(p => ({
			id: `cmd:new-profile-${p.id}`,
			title: `New tab: ${p.name}`,
			hint: p.id === settings.terminal.defaultProfileId ? 'default' : p.kind,
			run: () => addTab(undefined, p.id),
		})),
		{
			id: 'cmd:toggle-git',
			title: settings.footer.showGit ? 'Hide Git status' : 'Show Git status',
			run: () =>
				saveSettings({
					...settings,
					footer: {...settings.footer, showGit: !settings.footer.showGit},
				}),
		},
		{
			id: 'cmd:toggle-sys',
			title: settings.footer.showSys ? 'Hide PC stats' : 'Show PC stats',
			run: () =>
				saveSettings({
					...settings,
					footer: {...settings.footer, showSys: !settings.footer.showSys},
				}),
		},
		...tabs.map((t, i) => ({
			id: `cmd:goto-${t.id}`,
			title: `Go to tab ${i + 1}: ${t.title}`,
			hint: t.cwd,
			run: () => selectTab(t.id),
		})),
	]

	return (
		<div
			className="app"
			style={{background: settings.theme.bg, color: settings.theme.fg}}
		>
			<TabBar
				tabs={tabs}
				activeId={activeTab?.id || ''}
				profiles={settings.terminal.profiles}
				defaultProfileId={settings.terminal.defaultProfileId}
				onSelect={selectTab}
				onClose={closeTab}
				onNew={profileId => addTab(undefined, profileId)}
				onRename={renameTab}
				onReorder={reorderTabs}
				onOpenOpencode={launchOpencode}
				opencodeAvailable={opencodeAvailable}
				onOpenSettings={() => setShowSettings(true)}
			/>
			<div className="terminals">
				{searchOpen && activeTab && (
					<SearchBar
						tabId={activeTab.activePaneId}
						bg={settings.theme.bg}
						fg={settings.theme.fg}
						onClose={() => setSearchOpen(false)}
					/>
				)}
				{tabs.map(t => (
					<PaneLayout
						key={t.id}
						root={t.root}
						tabActive={t.id === activeTab?.id}
						activePaneId={t.activePaneId}
						fontFamily={effectiveFontFamily(settings.theme)}
						fontSize={settings.theme.fontSize}
						bg={settings.theme.bg}
						fg={settings.theme.fg}
						completionBell={settings.terminal.completionBell}
						scrollback={settings.terminal.scrollback}
						scrollbar={settings.terminal.scrollbar}
						onFocusPane={paneId => focusPane(t.id, paneId)}
						onResizeSplit={(splitId, ratio) =>
							resizeSplit(t.id, splitId, ratio)
						}
						onBackgroundIdle={showCompletionToast}
					/>
				))}
			</div>
			{toast && <div className="completion-toast">{toast}</div>}
			{!isElectron() && (
				<div className="web-warning">
					Web preview — PTY/Git/Sys need Electron. Run{' '}
					<code>bun run dev:electron</code>.
				</div>
			)}
			<StatusBar
				git={git}
				sys={sys}
				opencode={settings.footer.showOpencode ? opencode : null}
				settings={settings}
				cwd={cwd}
				onOpencodeContinue={continueOpencode}
			/>
			{showSettings && (
				<SettingsModal
					settings={settings}
					onChange={saveSettings}
					onClose={() => setShowSettings(false)}
				/>
			)}
			{paletteOpen && activeTab && (
				<CommandPalette
					tabId={activeTab.activePaneId}
					commands={paletteCommands}
					onClose={() => setPaletteOpen(false)}
				/>
			)}
		</div>
	)
}

function shortTitle(cwd: string, branch: string): string {
	const base = (cwd || '').split(/[/\\]/).filter(Boolean).pop() || 'shell'
	return branch ? `${base} ⎇${branch}` : base
}

function shortOcHint(title: string, max = 36): string {
	const t = title.trim() || '(untitled)'
	return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
