import {
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import './App.css'
import type {PaletteCommand} from './commands'
import PaneLayout from './components/PaneLayout'
import StatusBar from './components/StatusBar'
import TabBar, {type TabInfo} from './components/TabBar'
import {useTabBindings} from './hooks/useTabBindings'
import {
	assignPaneAgentLabels,
	pruneAgentBindings,
	type PaneAgentInfo,
	type PaneLaunchBinding,
} from './lib/agentLabels'
import {defaultAgentTools, resolveActiveAgent} from './lib/agents'
import {matchHotkey} from './lib/hotkeys'
import {
	collectLeaves,
	countLeaves,
	findLeaf,
	findNeighborPane,
	findSplitRatio,
	firstLeaf,
	insertPaneIntoTree,
	keepOnlyPane,
	mapLeafCwd,
	newPaneId,
	normalizeSessionRoot,
	removeLeaf,
	splitLeaf,
	splitLeafToward,
	swapPanes,
	updateSplitRatio,
	type PaneDirection,
	type PaneInsertPosition,
	type PaneLeaf,
	type PaneNode,
	type SplitDir,
} from './lib/panes'
import {getTermActions} from './lib/termActions'
import {
	isElectron,
	termApi,
	type AppSettings,
	type CliCommand,
	type GitStatus,
	type OpencodeStatus,
	type PluginCommand,
	type PluginStatusBarSegment,
	type ProcInfo,
	type QuickCommand,
	type SysStats,
	type UpdateStatus,
} from './types'
// Overlay bundles split out of the initial chunk: settings/palette/about/
// search are only fetched on first open, not on startup.
const AboutModal = lazy(() => import('./components/AboutModal'))
const CommandPalette = lazy(() => import('./components/CommandPalette'))
const ProcessManager = lazy(() => import('./components/ProcessManager'))
const SearchBar = lazy(() => import('./components/SearchBar'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))

const EMPTY_PANE_AGENTS: Record<string, PaneAgentInfo> = {}

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
		showCwd: true,
		modulesOrder: ['git', 'opencode', 'sys', 'cwd'],
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
		'toggle-app': 'Ctrl+`',
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
		quickCommands: [],
	},
	agent: {
		activeId: 'opencode',
		tools: defaultAgentTools(),
		envHooks: {enabled: false, includeGit: true},
		showPaneLabels: true,
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
	plugins: {enabled: false},
	quake: {
		enabled: false,
		hotkey: 'Alt+`',
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
	const [bootstrapped, setBootstrapped] = useState(false)
	const [tabs, setTabs] = useState<TabInfo[]>([])
	const [activeId, setActiveId] = useState<string>('')
	const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
	const [showSettings, setShowSettings] = useState(false)
	const [showAbout, setShowAbout] = useState(false)
	const [showProcesses, setShowProcesses] = useState(false)
	/** Background-refreshed process cache so the manager opens instantly. */
	const [procs, setProcs] = useState<ProcInfo[]>([])
	const [pluginCommands, setPluginCommands] = useState<PluginCommand[]>([])
	const [pluginStatusBar, setPluginStatusBar] = useState<
		PluginStatusBarSegment[]
	>([])
	const [git, setGit] = useState<GitStatus | null>(null)
	const [sys, setSys] = useState<SysStats | null>(null)
	const [cwd, setCwd] = useState('')
	const [searchOpen, setSearchOpen] = useState(false)
	const [paletteOpen, setPaletteOpen] = useState(false)
	const [opencode, setOpencode] = useState<OpencodeStatus | null>(null)
	const [agentAvailable, setAgentAvailable] = useState(true)
	const [toast, setToast] = useState<string | null>(null)
	/** paneId → launch/continue binding (cleared when session ends). */
	const [agentBindings, setAgentBindings] = useState<
		Record<string, PaneLaunchBinding>
	>({})
	/** Computed agent labels keyed by paneId. */
	const [paneAgents, setPaneAgents] = useState<Record<string, PaneAgentInfo>>(
		{},
	)
	// Latest-value refs for use inside IPC callbacks (synced in effects,
	// never written during render).
	const tabsRef = useRef(tabs)
	const activeRef = useRef(activeId)
	const agentBindingsRef = useRef(agentBindings)
	useEffect(() => {
		tabsRef.current = tabs
	}, [tabs])
	useEffect(() => {
		activeRef.current = activeId
	}, [activeId])
	useEffect(() => {
		agentBindingsRef.current = agentBindings
	}, [agentBindings])
	const settingsRef = useRef(settings)
	useEffect(() => {
		settingsRef.current = settings
	}, [settings])
	const toastTimer = useRef<number | null>(null)
	const cwdRef = useRef(cwd)
	useEffect(() => {
		cwdRef.current = cwd
	}, [cwd])

	const activeTab = tabs.find(t => t.id === activeId) || tabs[0]
	const activeAgent = resolveActiveAgent(
		settings.agent?.tools,
		settings.agent?.activeId,
	)
	const showPaneLabels = settings.agent?.showPaneLabels !== false
	const pollOpencode =
		activeAgent.sessionProvider === 'opencode' &&
		(settings.footer.showOpencode || showPaneLabels)

	// Detect active agent CLI on PATH.
	useEffect(() => {
		const api = termApi()
		if (!api) return
		const check =
			activeAgent.sessionProvider === 'opencode'
				? api.opencodeAvailable()
				: api.agentWhich(activeAgent.binary)
		check
			.then(ok => {
				setAgentAvailable(ok)
			})
			.catch(() => setAgentAvailable(false))
	}, [activeAgent.binary, activeAgent.sessionProvider])

	// Poll OpenCode sessions when footer OC is shown and/or pane labels are on.
	// Interval-only: this must NOT re-fire on tabs/cwd changes, or every
	// prompt's git refresh cascades into an immediate `opencode session list`
	// CLI spawn. Overlapping ticks are skipped (the CLI takes seconds).
	useEffect(() => {
		const api = termApi()
		if (!api || !pollOpencode) return
		let cancelled = false
		let inFlight = false
		const tick = async () => {
			if (inFlight) return
			if (typeof document !== 'undefined' && document.hidden) return
			inFlight = true
			try {
				const tabsNow = tabsRef.current
				const ids = tabsNow.flatMap(t =>
					collectLeaves(t.root).map(l => l.paneId),
				)
				let cwds: Record<string, string> = {}
				try {
					if (ids.length > 0) {
						for (const {id, cwd} of await api.ptyCwd(ids)) {
							if (cwd) cwds[id] = cwd
						}
						// Fall back to leaf-stamped cwd from the split tree.
						for (const t of tabsNow) {
							for (const leaf of collectLeaves(t.root)) {
								if (!cwds[leaf.paneId] && leaf.cwd) cwds[leaf.paneId] = leaf.cwd
							}
						}
					}
				} catch {
					cwds = {}
					for (const t of tabsNow) {
						for (const leaf of collectLeaves(t.root)) {
							if (leaf.cwd) cwds[leaf.paneId] = leaf.cwd
						}
					}
				}
				if (cancelled) return

				const focusCwd =
					(activeRef.current &&
						tabsNow.find(t => t.id === activeRef.current)?.activePaneId &&
						cwds[
							tabsNow.find(t => t.id === activeRef.current)?.activePaneId || ''
						]) ||
					cwdRef.current ||
					undefined

				try {
					const s = await api.opencodeStatus(focusCwd)
					if (cancelled) return
					setOpencode(s)
					setAgentAvailable(s.available)

					const paneIds = new Set(ids)
					const pruned = pruneAgentBindings(
						agentBindingsRef.current,
						paneIds,
						s.sessions ?? [],
						Date.now(),
						s.truncated === true,
					)
					if (
						Object.keys(pruned).length !==
							Object.keys(agentBindingsRef.current).length ||
						Object.keys(pruned).some(
							k => pruned[k] !== agentBindingsRef.current[k],
						)
					) {
						setAgentBindings(pruned)
						agentBindingsRef.current = pruned
					}

					if (showPaneLabels && s.available) {
						const panes = ids.map(paneId => ({
							paneId,
							cwd: cwds[paneId],
						}))
						const assigned = assignPaneAgentLabels({
							panes,
							sessions: s.sessions ?? [],
							bindings: pruned,
							agentLabel: activeAgent.label,
						})
						const next: Record<string, PaneAgentInfo> = {}
						for (const [id, info] of assigned) next[id] = info
						setPaneAgents(next)
					} else {
						setPaneAgents({})
					}
				} catch {
					if (cancelled) return
					setOpencode({
						available: false,
						sessionCount: 0,
						latest: null,
						projectMatch: false,
						sessions: [],
						truncated: false,
					})
					setPaneAgents({})
				}
			} finally {
				inFlight = false
			}
		}
		void tick()
		const ms = Math.max(5000, settings.footer.refreshMs || 1500)
		const timer = setInterval(() => {
			void tick()
		}, ms)
		return () => {
			cancelled = true
			clearInterval(timer)
		}
	}, [
		pollOpencode,
		showPaneLabels,
		settings.footer.refreshMs,
		activeAgent.sessionProvider,
		activeAgent.label,
	])

	/** Inject an agent CLI command into the focused pane. */
	const writeAgentCmd = useCallback((cmd: string) => {
		const api = termApi()
		if (!api) return
		const tab = tabsRef.current.find(t => t.id === activeRef.current)
		const paneId = tab?.activePaneId
		if (!paneId) return
		api.ptyWrite(paneId, '\x03')
		setTimeout(() => api.ptyWrite(paneId, `${cmd}\r`), 50)
		return paneId
	}, [])

	const bindAgentPane = useCallback(
		(paneId: string | undefined, sessionId?: string) => {
			if (!paneId) return
			const agent = resolveActiveAgent(
				settingsRef.current.agent?.tools,
				settingsRef.current.agent?.activeId,
			)
			setAgentBindings(prev => {
				const next = {
					...prev,
					[paneId]: {
						sessionId,
						agentLabel: agent.label,
						agentName: agent.name,
						launchedAt: Date.now(),
					},
				}
				agentBindingsRef.current = next
				return next
			})
		},
		[],
	)

	const launchAgent = useCallback(() => {
		const agent = resolveActiveAgent(
			settingsRef.current.agent?.tools,
			settingsRef.current.agent?.activeId,
		)
		const paneId = writeAgentCmd(agent.command)
		bindAgentPane(paneId)
	}, [writeAgentCmd, bindAgentPane])

	const continueAgent = useCallback(
		(sessionId?: string) => {
			const agent = resolveActiveAgent(
				settingsRef.current.agent?.tools,
				settingsRef.current.agent?.activeId,
			)
			if (agent.sessionProvider === 'opencode' && sessionId) {
				const paneId = writeAgentCmd(`opencode -s ${sessionId}`)
				bindAgentPane(paneId, sessionId)
				return
			}
			const paneId = agent.continueCommand
				? writeAgentCmd(agent.continueCommand)
				: writeAgentCmd(agent.command)
			bindAgentPane(paneId, sessionId)
		},
		[writeAgentCmd, bindAgentPane],
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
		if (!api) {
			queueMicrotask(() => {
				const t = newTab()
				setTabs([t])
				setActiveId(t.id)
				setBootstrapped(true)
			})
			return
		}
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
					const startFallback = merged.terminal.startDir.trim() || undefined
					const restored: TabInfo[] = []
					for (const [i, st] of saved.entries()) {
						const root = normalizeSessionRoot(st.root, startFallback)
						if (!root) continue
						tabSeq += 1
						restored.push({
							id: `tab-restored-${Date.now()}-${i}`,
							title: st.title || `Tab ${tabSeq}`,
							customTitle: st.customTitle,
							pinned: st.pinned === true,
							color: st.color,
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
			.catch(() => {
				const t = newTab()
				setTabs([t])
				setActiveId(t.id)
			})
			.finally(() => setBootstrapped(true))
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

	// Process list cache: refreshed in the background (paused while the
	// manager is open — it runs its own faster poll then) so reopening
	// the panel shows rows instantly instead of a fresh load.
	const showProcessesRef = useRef(showProcesses)
	useEffect(() => {
		showProcessesRef.current = showProcesses
	}, [showProcesses])
	useEffect(() => {
		const api = termApi()
		if (!api || typeof api.procList !== 'function') return
		let cancelled = false
		let busy = false
		const tick = async () => {
			if (busy || showProcessesRef.current) return
			if (typeof document !== 'undefined' && document.hidden) return
			busy = true
			try {
				const list = await api.procList()
				if (!cancelled && Array.isArray(list) && list.length > 0) setProcs(list)
			} catch {
				/* keep stale cache */
			} finally {
				busy = false
			}
		}
		const warmup = setTimeout(() => void tick(), 3000)
		const timer = setInterval(() => void tick(), 5000)
		return () => {
			cancelled = true
			clearTimeout(warmup)
			clearInterval(timer)
		}
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
			// Bail out when nothing visible changed: rebuilding `tabs`
			// identity here re-fires the opencode poll + session persist
			// effects, so an unconditional update turns every prompt's git
			// refresh into a full update cascade.
			setTabs(prev => {
				const cur = prev.find(t => t.id === activeId)
				if (!cur || cur.customTitle) return prev
				const cwd = (st as GitStatus).cwd
				const title = shortTitle(
					(st as GitStatus).cwd,
					(st as GitStatus).branch,
				)
				if (cur.cwd === cwd && cur.title === title) return prev
				return prev.map(t => (t.id === activeId ? {...t, cwd, title} : t))
			})
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
		const tab = tabsRef.current.find(t => t.id === id)
		const label = tab?.title || 'this tab'
		const api = termApi()
		if (tab?.pinned) {
			const ok = api
				? await api.dialogConfirm({
						message: `Unpin and close "${label}"?`,
						detail: 'This tab is pinned.',
						title: 'Close pinned tab',
						buttons: ['Close', 'Cancel'],
					})
				: window.confirm(`Unpin and close ${label}?`)
			if (!ok) return
		} else if (settingsRef.current.tabs.confirmClose) {
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
				const killApi = termApi()
				for (const leaf of collectLeaves(closing.root))
					killApi?.ptyKill(leaf.paneId)
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

	const togglePinTab = useCallback((id: string) => {
		setTabs(prev =>
			prev.map(t => (t.id === id ? {...t, pinned: !t.pinned} : t)),
		)
	}, [])

	const setTabColor = useCallback((id: string, color: string | undefined) => {
		setTabs(prev => prev.map(t => (t.id === id ? {...t, color} : t)))
	}, [])

	const exportTabBuffer = useCallback(async (tabId: string) => {
		const tab = tabsRef.current.find(t => t.id === tabId)
		if (!tab) return
		const actions = getTermActions(tab.activePaneId)
		const text = actions?.exportBuffer() ?? ''
		const api = termApi()
		if (!api) {
			await navigator.clipboard?.writeText(text)
			setToast('Buffer copied to clipboard')
			window.setTimeout(() => setToast(null), 2800)
			return
		}
		const res = await api.dialogSaveText({
			content: text,
			defaultPath: `${(tab.customTitle || tab.title || 'terminal').replace(/[<>:"/\\|?*]/g, '_')}.txt`,
			title: 'Export terminal text',
		})
		if (res.ok) {
			setToast(`Exported ${res.path}`)
			window.setTimeout(() => setToast(null), 2800)
		} else if (res.error && res.error !== 'canceled') {
			setToast(res.error)
			window.setTimeout(() => setToast(null), 2800)
		}
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

	// leaf.cwd is only the spawn dir; main tracks the live one via OSC 7 / 9;9.
	const livePaneCwd = useCallback(
		async (tab: TabInfo, paneId: string): Promise<string | undefined> => {
			const live = await termApi()
				?.ptyCwd([paneId])
				.then(r => r[0]?.cwd ?? null)
				.catch(() => null)
			return (
				live ||
				findLeaf(tab.root, paneId)?.cwd ||
				(tab.id === activeRef.current ? git?.cwd || cwd : undefined) ||
				undefined
			)
		},
		[git?.cwd, cwd],
	)

	const duplicateTab = useCallback(
		async (id: string, paneId?: string) => {
			const tab = tabsRef.current.find(t => t.id === id)
			if (!tab) return
			const sourcePaneId = paneId ?? tab.activePaneId
			const leaf = findLeaf(tab.root, sourcePaneId)
			addTab(await livePaneCwd(tab, sourcePaneId), leaf?.profileId)
		},
		[addTab, livePaneCwd],
	)

	const closeOtherTabs = useCallback(
		async (keepId: string) => {
			const toClose = tabsRef.current.filter(t => t.id !== keepId && !t.pinned)
			for (const t of toClose) await closeTab(t.id)
		},
		[closeTab],
	)

	const closeTabsToRight = useCallback(
		async (id: string) => {
			const idx = tabsRef.current.findIndex(t => t.id === id)
			if (idx < 0) return
			const toClose = tabsRef.current.slice(idx + 1).filter(t => !t.pinned)
			for (const t of toClose) await closeTab(t.id)
		},
		[closeTab],
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

	// Move a pane from one tab to another (drag-drop or context menu).
	// The pane keeps its paneId, so its TerminalView stays mounted and the
	// shell survives the move — no pty is killed here.
	const movePaneToTab = useCallback(
		(
			paneId: string,
			fromTabId: string,
			toTabId: string,
			position: PaneInsertPosition = 'right',
		) => {
			if (fromTabId === toTabId) return
			const source = tabsRef.current.find(t => t.id === fromTabId)
			const target = tabsRef.current.find(t => t.id === toTabId)
			if (!source || !target) return
			const leaf = findLeaf(source.root, paneId)
			if (!leaf) return
			if (countLeaves(source.root) <= 1) return
			const moved: PaneLeaf = {...leaf}
			setTabs(prev =>
				prev.map(t => {
					if (t.id === fromTabId) {
						const root = removeLeaf(t.root, paneId)
						if (!root) return t
						return {
							...t,
							root,
							activePaneId:
								paneId === t.activePaneId
									? firstLeaf(root).paneId
									: t.activePaneId,
						}
					}
					if (t.id === toTabId) {
						return {
							...t,
							root: insertPaneIntoTree(t.root, moved, position),
							activePaneId: paneId,
						}
					}
					return t
				}),
			)
			setActiveId(toTabId)
		},
		[],
	)

	const showCompletionToast = useCallback((paneId: string) => {
		if (!settingsRef.current.terminal.completionBell) return
		const tab = tabsRef.current.find(t => findLeaf(t.root, paneId))
		const label = tab?.title || 'Background pane'
		setToast(`${label} finished`)
		if (toastTimer.current) clearTimeout(toastTimer.current)
		toastTimer.current = window.setTimeout(() => setToast(null), 2800)
	}, [])

	// Focus a pane within its tab.
	const focusPane = useCallback((tabId: string, paneId: string) => {
		setTabs(prev =>
			prev.map(t => (t.id === tabId ? {...t, activePaneId: paneId} : t)),
		)
	}, [])

	// Title honesty: main resolves the spawn dir (saved cwd → startDir →
	// home) and returns it. Apply it unless the user named the tab, so the
	// display matches the real shell dir before the first OSC7 arrives.
	const resolveTabCwd = useCallback(
		(tabId: string, _paneId: string, cwd: string) => {
			if (!cwd) return
			setTabs(prev => {
				const cur = prev.find(t => t.id === tabId)
				if (!cur || cur.customTitle) return prev
				const title = shortTitle(cwd, '')
				if (cur.cwd === cwd && cur.title === title) return prev
				return prev.map(t => (t.id === tabId ? {...t, cwd, title} : t))
			})
		},
		[],
	)

	// Split a pane; the new pane inherits the target pane's live cwd/profile.
	const splitInto = useCallback(
		async (
			tabId: string,
			targetPaneId: string | undefined,
			insert: (root: PaneNode, paneId: string, leaf: PaneLeaf) => PaneNode,
			opts?: {cwd?: string; profileId?: string},
		) => {
			const tab = tabsRef.current.find(t => t.id === tabId)
			if (!tab) return
			const paneId = targetPaneId ?? tab.activePaneId
			const target = findLeaf(tab.root, paneId)
			if (!target) return
			const newLeaf: PaneLeaf = {
				kind: 'leaf',
				paneId: newPaneId(),
				cwd: opts?.cwd || (await livePaneCwd(tab, paneId)),
				profileId:
					opts?.profileId ||
					target.profileId ||
					settingsRef.current.terminal.defaultProfileId,
			}
			setTabs(prev =>
				prev.map(t =>
					t.id === tabId && findLeaf(t.root, paneId)
						? {
								...t,
								root: insert(t.root, paneId, newLeaf),
								activePaneId: newLeaf.paneId,
							}
						: t,
				),
			)
		},
		[livePaneCwd],
	)

	const splitPane = useCallback(
		(dir: SplitDir, targetPaneId?: string) => {
			void splitInto(activeRef.current, targetPaneId, (root, id, leaf) =>
				splitLeaf(root, id, leaf, dir),
			)
		},
		[splitInto],
	)

	const splitPaneOnTab = useCallback(
		(tabId: string, dir: SplitDir) => {
			setActiveId(tabId)
			activeRef.current = tabId
			void splitInto(tabId, undefined, (root, id, leaf) =>
				splitLeaf(root, id, leaf, dir),
			)
		},
		[splitInto],
	)

	// wt-style CLI (`involvex-term sp|nt -d <dir>`) forwarded from main.
	const runCli = useCallback(
		(cmd: CliCommand) => {
			const profiles = settingsRef.current.terminal.profiles
			const want = cmd.profile?.toLowerCase()
			const profileId = want
				? profiles.find(
						p => p.id.toLowerCase() === want || p.name.toLowerCase() === want,
					)?.id
				: undefined
			if (cmd.kind === 'new-tab') {
				addTab(cmd.dir, profileId)
				return
			}
			void splitInto(
				activeRef.current,
				undefined,
				(root, id, leaf) => splitLeaf(root, id, leaf, cmd.direction),
				{cwd: cmd.dir, profileId},
			)
		},
		[addTab, splitInto],
	)

	useEffect(() => {
		const api = termApi()
		if (!api || !bootstrapped) return
		const off = api.onCliCommand(runCli)
		void api.cliPending().then(list => list.forEach(runCli))
		return off
	}, [bootstrapped, runCli])

	// Local plugins (~/.involvex-term/plugins, opt-in): commands + status bar.
	useEffect(() => {
		const api = termApi()
		if (!api || !bootstrapped) return
		void api.pluginList().then(r => {
			setPluginCommands(r.commands)
			setPluginStatusBar(r.statusBar)
		})
		return api.onPluginChanged(msg => {
			setPluginCommands(msg.commands)
			setPluginStatusBar(msg.statusBar)
		})
	}, [bootstrapped])

	const splitPaneToward = useCallback(
		(toward: PaneDirection, targetPaneId?: string) => {
			void splitInto(activeRef.current, targetPaneId, (root, id, leaf) =>
				splitLeafToward(root, id, leaf, toward),
			)
		},
		[splitInto],
	)

	const swapPane = useCallback(
		(toward: PaneDirection, targetPaneId?: string) => {
			const tabId = activeRef.current
			const tab = tabsRef.current.find(t => t.id === tabId)
			if (!tab) return
			const paneId = targetPaneId ?? tab.activePaneId
			const other = findNeighborPane(tab.root, paneId, toward)
			if (!other) return
			setTabs(prev =>
				prev.map(t =>
					t.id === tabId ? {...t, root: swapPanes(t.root, paneId, other)} : t,
				),
			)
		},
		[],
	)

	const closeOtherPanes = useCallback((targetPaneId?: string) => {
		const tabId = activeRef.current
		const tab = tabsRef.current.find(t => t.id === tabId)
		if (!tab) return
		const keepId = targetPaneId ?? tab.activePaneId
		const kept = keepOnlyPane(tab.root, keepId)
		if (!kept || countLeaves(tab.root) <= 1) return
		for (const leaf of collectLeaves(tab.root)) {
			if (leaf.paneId !== keepId) termApi()?.ptyKill(leaf.paneId)
		}
		setTabs(prev =>
			prev.map(t =>
				t.id === tabId ? {...t, root: kept, activePaneId: keepId} : t,
			),
		)
	}, [])

	// Drag a split divider to a new ratio.
	const resizeSplit = useCallback(
		(tabId: string, splitId: string, ratio: number) => {
			const next = Math.min(0.9, Math.max(0.1, ratio))
			setTabs(prev =>
				prev.map(t => {
					if (t.id !== tabId) return t
					// Bail out when the effective ratio is unchanged, mirroring the
					// guard on the git-title path below. Rebuilding `tabs` identity
					// invalidates the memoized PaneLayout for every tab, so an
					// unconditional write here turns one divider drag into a
					// whole-tree re-render storm.
					const cur = findSplitRatio(t.root, splitId)
					if (cur !== undefined && Math.abs(cur - next) < 1e-4) return t
					return {...t, root: updateSplitRatio(t.root, splitId, next)}
				}),
			)
		},
		[],
	)
	// Close a pane; last pane closes the tab instead.
	const closePane = useCallback(
		(targetPaneId?: string) => {
			const tabId = activeRef.current
			const tab = tabsRef.current.find(t => t.id === tabId)
			if (!tab) return
			const paneId = targetPaneId ?? tab.activePaneId
			if (countLeaves(tab.root) <= 1) {
				closeTab(tabId)
				return
			}
			termApi()?.ptyKill(paneId)
			setTabs(prev =>
				prev.map(t => {
					if (t.id !== tabId) return t
					const root = removeLeaf(t.root, paneId)
					if (!root) return t
					const nextActive =
						paneId === t.activePaneId ? firstLeaf(root).paneId : t.activePaneId
					return {...t, root, activePaneId: nextActive}
				}),
			)
		},
		[closeTab],
	)

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
			else if (action === 'duplicate-tab') void duplicateTab(active)
			else if (action === 'next-tab' && tabsNow.length > 1)
				selectTab(tabsNow[(idx + 1) % tabsNow.length]?.id || active)
			else if (action === 'prev-tab' && tabsNow.length > 1)
				selectTab(
					tabsNow[(idx - 1 + tabsNow.length) % tabsNow.length]?.id || active,
				)
			else if (action === 'open-settings') setShowSettings(true)
			else if (action === 'open-about') setShowAbout(true)
			else if (action === 'open-search') setSearchOpen(true)
			else if (action === 'open-palette') setPaletteOpen(true)
			else if (action === 'open-opencode') launchAgent()
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
		duplicateTab,
		selectTab,
		splitPane,
		closePane,
		launchAgent,
		activePaneActions,
		checkUpdates,
	])

	// Keyboard shortcuts in renderer (works in dev + packaged).
	// Pane Alt+Shift chords are primarily handled in main via before-input-event;
	// this path still honors remapped settings.hotkeys as a fallback.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			// Never hijack keys typed into inputs (settings fields, find bar…).
			const target = e.target as HTMLElement | null
			if (
				target &&
				(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
			)
				return
			const hk = settingsRef.current.hotkeys
			const hit = (id: string, fallback: string) =>
				matchHotkey(e, hk[id] || fallback)

			if (hit('new-tab', 'Ctrl+Shift+T')) {
				e.preventDefault()
				addTab()
			} else if (hit('find', 'Ctrl+Shift+F')) {
				e.preventDefault()
				setSearchOpen(true)
			} else if (hit('palette', 'Ctrl+Shift+P')) {
				e.preventDefault()
				setPaletteOpen(true)
			} else if (hit('opencode', 'Ctrl+Shift+O')) {
				e.preventDefault()
				launchAgent()
			} else if (hit('close-tab', 'Ctrl+Shift+W')) {
				e.preventDefault()
				if (activeRef.current) void closeTab(activeRef.current)
			} else if (hit('next-tab', 'Ctrl+Tab')) {
				e.preventDefault()
				const ts = tabsRef.current
				const i = ts.findIndex(t => t.id === activeRef.current)
				const nt = ts[(i + 1) % ts.length]
				if (nt) selectTab(nt.id)
			} else if (hit('prev-tab', 'Ctrl+Shift+Tab')) {
				e.preventDefault()
				const ts = tabsRef.current
				const i = ts.findIndex(t => t.id === activeRef.current)
				const nt = ts[(i - 1 + ts.length) % ts.length]
				if (nt) selectTab(nt.id)
			} else if (hit('duplicate-tab', 'Ctrl+Shift+D')) {
				e.preventDefault()
				if (activeRef.current) void duplicateTab(activeRef.current)
			} else if (hit('split-pane', 'Shift+Alt+D')) {
				e.preventDefault()
				splitPane('horizontal')
			} else if (hit('split-pane-vertical', 'Shift+Alt+V')) {
				e.preventDefault()
				splitPane('vertical')
			} else if (hit('close-pane', 'Shift+Alt+C')) {
				e.preventDefault()
				closePane()
			} else if (hit('clear-buffer', 'Ctrl+Shift+K')) {
				e.preventDefault()
				activePaneActions()?.clearBuffer()
			} else if (hit('mark-prompt', 'Ctrl+Shift+M')) {
				e.preventDefault()
				activePaneActions()?.addMark()
			} else if (hit('prev-mark', 'Ctrl+Shift+Up')) {
				e.preventDefault()
				activePaneActions()?.jumpPrevMark()
			} else if (hit('next-mark', 'Ctrl+Shift+Down')) {
				e.preventDefault()
				activePaneActions()?.jumpNextMark()
			} else if (hit('check-updates', 'Ctrl+Shift+U')) {
				e.preventDefault()
				void checkUpdates()
			} else if (hit('settings', 'Ctrl+,')) {
				e.preventDefault()
				setShowSettings(true)
			} else if (hit('toggle-app', 'Ctrl+`')) {
				e.preventDefault()
				termApi()?.windowToggleApp()
			} else if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
				const key = e.key
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
		launchAgent,
		activePaneActions,
		checkUpdates,
		duplicateTab,
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
					pinned: t.pinned || undefined,
					color: t.color,
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
						pinned: t.pinned || undefined,
						color: t.color,
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

	const paletteCommands: PaletteCommand[] = useMemo(
		() => [
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
				run: () => {
					if (activeRef.current) void duplicateTab(activeRef.current)
				},
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
				hint: settings.hotkeys['split-pane'] || 'Shift+Alt+D',
				run: () => splitPane('horizontal'),
			},
			{
				id: 'cmd:split-pane-vertical',
				title: 'Split pane vertically',
				hint: settings.hotkeys['split-pane-vertical'] || 'Shift+Alt+V',
				run: () => splitPane('vertical'),
			},
			{
				id: 'cmd:close-pane',
				title: 'Close active pane',
				hint: settings.hotkeys['close-pane'] || 'Shift+Alt+C',
				run: () => closePane(),
			},
			{
				id: 'cmd:settings',
				title: 'Open settings',
				hint: 'Ctrl+,',
				run: () => setShowSettings(true),
			},
			{
				id: 'cmd:processes',
				title: 'Open process manager',
				run: () => setShowProcesses(true),
			},
			{
				id: 'cmd:opencode',
				title: `Open ${activeAgent.name}`,
				hint: agentAvailable ? 'Ctrl+Shift+O' : 'not found on PATH',
				run: () => launchAgent(),
			},
			{
				id: 'cmd:opencode-continue',
				title: `Continue ${activeAgent.name}`,
				hint:
					activeAgent.sessionProvider === 'opencode' && opencode?.latest
						? shortOcHint(opencode.latest.title)
						: activeAgent.continueCommand || activeAgent.command,
				run: () => continueAgent(opencode?.latest?.id),
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
			{
				id: 'cmd:about',
				title: 'About Involvex-Term',
				run: () => setShowAbout(true),
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
			{
				id: 'cmd:toggle-agent',
				title: settings.footer.showOpencode
					? `Hide ${activeAgent.name} status`
					: `Show ${activeAgent.name} status`,
				run: () =>
					saveSettings({
						...settings,
						footer: {
							...settings.footer,
							showOpencode: !settings.footer.showOpencode,
						},
					}),
			},
			...tabs.map((t, i) => ({
				id: `cmd:goto-${t.id}`,
				title: `Go to tab ${i + 1}: ${t.title}`,
				hint: t.cwd,
				run: () => selectTab(t.id),
			})),
			...pluginCommands.map(c => ({
				id: `plugin:${c.id}`,
				title: c.title,
				hint: c.hint,
				run: () => void termApi()?.runPluginCommand(c.id),
			})),
		],
		[
			addTab,
			closeTab,
			duplicateTab,
			selectTab,
			splitPane,
			closePane,
			launchAgent,
			continueAgent,
			activePaneActions,
			checkUpdates,
			runSnippet,
			settings,
			tabs,
			pluginCommands,
			opencode,
			agentAvailable,
			activeAgent.name,
			activeAgent.sessionProvider,
			activeAgent.continueCommand,
			activeAgent.command,
			saveSettings,
		],
	)

	// Stable per-render callbacks: inline arrows in JSX would defeat the
	// memo() on PaneLayout/StatusBar (new fn identity every sys/git tick).
	const handleToast = useCallback((msg: string) => {
		setToast(msg)
		window.setTimeout(() => setToast(null), 2800)
	}, [])
	const handleGitRefreshed = useCallback((s: GitStatus) => {
		setGit(s)
		if (s.cwd) setCwd(s.cwd)
	}, [])
	const emptyAgents = showPaneLabels ? paneAgents : EMPTY_PANE_AGENTS
	const fontFamily = useMemo(
		() => effectiveFontFamily(settings.theme),
		[settings.theme],
	)
	// Stable TabBar callbacks (inline arrows would defeat memo()).
	const handleCloseTabId = useCallback(
		(id: string) => void closeTab(id),
		[closeTab],
	)
	const handleNewTab = useCallback(
		(profileId?: string) => addTab(undefined, profileId),
		[addTab],
	)
	const handleDuplicateTabId = useCallback(
		(id: string) => void duplicateTab(id),
		[duplicateTab],
	)
	const handleSplitOnTab = useCallback(
		(id: string, dir: 'horizontal' | 'vertical') => splitPaneOnTab(id, dir),
		[splitPaneOnTab],
	)
	const handleExportBuffer = useCallback(
		(id: string) => void exportTabBuffer(id),
		[exportTabBuffer],
	)
	const handleCloseOthers = useCallback(
		(id: string) => void closeOtherTabs(id),
		[closeOtherTabs],
	)
	const handleCloseToRight = useCallback(
		(id: string) => void closeTabsToRight(id),
		[closeTabsToRight],
	)
	const handleQuickCommand = useCallback(
		(cmd: QuickCommand) => runSnippet(cmd.command, cmd.sendEnter !== false),
		[runSnippet],
	)
	const handleOpenSettings = useCallback(() => setShowSettings(true), [])
	const handleOpenProcesses = useCallback(() => setShowProcesses(true), [])
	const handleCloseProcesses = useCallback(() => setShowProcesses(false), [])
	const handleCloseSearch = useCallback(() => setSearchOpen(false), [])
	const handleClosePalette = useCallback(() => setPaletteOpen(false), [])
	const handleCloseSettings = useCallback(() => setShowSettings(false), [])
	const handleCloseAbout = useCallback(() => setShowAbout(false), [])
	const handleSearchFocusPane = useCallback(
		(paneId: string) => {
			if (activeTab) focusPane(activeTab.id, paneId)
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[activeTab?.id, focusPane],
	)

	const tabBindings = useTabBindings({
		tabs,
		focusPane,
		resizeSplit,
		resolveTabCwd,
		splitPaneToward,
		swapPane,
		movePaneToTab,
		closePane,
		closeOtherPanes,
		duplicateTab,
		closeTab,
		setSearchOpen,
	})

	return (
		<div
			className="app"
			style={{background: settings.theme.bg, color: settings.theme.fg}}
		>
			{!bootstrapped || tabs.length === 0 ? (
				<div className="web-warning">Starting…</div>
			) : (
				<>
					<TabBar
						tabs={tabs}
						activeId={activeTab?.id || ''}
						profiles={settings.terminal.profiles}
						defaultProfileId={settings.terminal.defaultProfileId}
						quickCommands={settings.terminal.quickCommands ?? []}
						agentLabel={activeAgent.label}
						agentName={activeAgent.name}
						agentAvailable={agentAvailable}
						paneAgents={emptyAgents}
						onSelect={selectTab}
						onClose={handleCloseTabId}
						onNew={handleNewTab}
						onRename={renameTab}
						onReorder={reorderTabs}
						onMovePaneToTab={movePaneToTab}
						onTogglePin={togglePinTab}
						onSetColor={setTabColor}
						onDuplicate={handleDuplicateTabId}
						onSplit={handleSplitOnTab}
						onExportBuffer={handleExportBuffer}
						onCloseOthers={handleCloseOthers}
						onCloseToRight={handleCloseToRight}
						onQuickCommand={handleQuickCommand}
						onOpenAgent={launchAgent}
						onOpenProcesses={handleOpenProcesses}
						onOpenSettings={handleOpenSettings}
					/>
					<div className="terminals">
						{searchOpen && activeTab && (
							<Suspense fallback={null}>
								<SearchBar
									root={activeTab.root}
									activePaneId={activeTab.activePaneId}
									bg={settings.theme.bg}
									fg={settings.theme.fg}
									onClose={handleCloseSearch}
									onFocusPane={handleSearchFocusPane}
								/>
							</Suspense>
						)}
						{tabBindings.map(b => (
							<PaneLayout
								key={b.tab.id}
								root={b.tab.root}
								tabId={b.tab.id}
								tabActive={b.tab.id === activeTab?.id}
								activePaneId={b.tab.activePaneId}
								fontFamily={fontFamily}
								fontSize={settings.theme.fontSize}
								bg={settings.theme.bg}
								fg={settings.theme.fg}
								completionBell={settings.terminal.completionBell}
								scrollback={settings.terminal.scrollback}
								scrollbar={settings.terminal.scrollbar}
								paneAgents={emptyAgents}
								onFocusPane={b.focusPane}
								onResizeSplit={b.resizeSplit}
								onBackgroundPrompt={showCompletionToast}
								onResolvedCwd={b.resolveCwd}
								onToast={handleToast}
								onPaneMenu={b.paneMenu}
							/>
						))}
					</div>
					{toast && <div className="completion-toast">{toast}</div>}
					{!isElectron() && (
						<div className="web-warning">
							Web preview — PTY/Git/Sys need Electron. Run{' '}
							<code>bun run dev</code>.
						</div>
					)}
					<StatusBar
						git={git}
						sys={sys}
						opencode={settings.footer.showOpencode ? opencode : null}
						settings={settings}
						cwd={cwd}
						onSettingsChange={saveSettings}
						onOpencodeContinue={continueAgent}
						onOpencodeNew={launchAgent}
						onGitRefreshed={handleGitRefreshed}
						pluginSegments={pluginStatusBar}
						onToast={handleToast}
					/>
				</>
			)}
			{showSettings && (
				<Suspense fallback={null}>
					<SettingsModal
						settings={settings}
						onChange={saveSettings}
						onClose={handleCloseSettings}
					/>
				</Suspense>
			)}
			{showAbout && (
				<Suspense fallback={null}>
					<AboutModal onClose={handleCloseAbout} />
				</Suspense>
			)}
			{showProcesses && (
				<Suspense fallback={null}>
					<ProcessManager
						bg={settings.theme.bg}
						fg={settings.theme.fg}
						initialProcs={procs}
						onClose={handleCloseProcesses}
						onToast={handleToast}
						onProcs={setProcs}
					/>
				</Suspense>
			)}
			{paletteOpen && activeTab && (
				<Suspense fallback={null}>
					<CommandPalette
						tabId={activeTab.activePaneId}
						commands={paletteCommands}
						onClose={handleClosePalette}
					/>
				</Suspense>
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
