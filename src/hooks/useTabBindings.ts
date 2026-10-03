import {useMemo} from 'react'
import type {TabInfo} from '../components/TabBar'
import type {PaneDirection, PaneInsertPosition} from '../lib/panes'

export interface TabPaneMenu {
	onFind: (paneId: string) => void
	onSplitToward: (paneId: string, toward: PaneDirection) => void
	onSwap: (paneId: string, toward: PaneDirection) => void
	onMoveToTab: (paneId: string, toTabId: string) => void
	moveTargets: Array<{id: string; title: string}>
	onClosePane: (paneId: string) => void
	onCloseOtherPanes: (paneId: string) => void
	onDuplicateTab: (paneId: string) => void
	onCloseTab: () => void
}

export interface TabBinding {
	tab: TabInfo
	focusPane: (paneId: string) => void
	resizeSplit: (splitId: string, ratio: number) => void
	resolveCwd: (paneId: string, cwd: string) => void
	paneMenu: TabPaneMenu
}

export interface TabBindingsInput {
	tabs: TabInfo[]
	focusPane: (tabId: string, paneId: string) => void
	resizeSplit: (tabId: string, splitId: string, ratio: number) => void
	resolveTabCwd: (tabId: string, paneId: string, cwd: string) => void
	splitPaneToward: (toward: PaneDirection, targetPaneId?: string) => void
	swapPane: (toward: PaneDirection, targetPaneId?: string) => void
	movePaneToTab: (
		paneId: string,
		fromTabId: string,
		toTabId: string,
		position?: PaneInsertPosition,
	) => void
	closePane: (targetPaneId?: string) => void
	closeOtherPanes: (targetPaneId?: string) => void
	duplicateTab: (id: string, paneId?: string) => Promise<void>
	closeTab: (id: string) => Promise<void>
	setSearchOpen: (open: boolean) => void
}

/**
 * Per-tab stable bindings for PaneLayout. Recomputed only when the tab set
 * or a structural callback changes — NOT on sys/git/opencode ticks, so the
 * memoized PaneLayout skips re-render for untouched tabs.
 */
export function useTabBindings(deps: TabBindingsInput): TabBinding[] {
	const {
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
	} = deps
	return useMemo(
		() =>
			tabs.map((t): TabBinding => ({
				tab: t,
				focusPane: paneId => focusPane(t.id, paneId),
				resizeSplit: (splitId, ratio) => resizeSplit(t.id, splitId, ratio),
				resolveCwd: (paneId, c) => resolveTabCwd(t.id, paneId, c),
				paneMenu: {
					onFind: paneId => {
						focusPane(t.id, paneId)
						setSearchOpen(true)
					},
					onSplitToward: (paneId, toward) => {
						focusPane(t.id, paneId)
						splitPaneToward(toward, paneId)
					},
					onSwap: (paneId, toward) => {
						focusPane(t.id, paneId)
						swapPane(toward, paneId)
					},
					onMoveToTab: (paneId, toTabId) => {
						focusPane(t.id, paneId)
						movePaneToTab(paneId, t.id, toTabId, 'right')
					},
					moveTargets: tabs
						.filter(x => x.id !== t.id)
						.map(x => ({
							id: x.id,
							title: x.customTitle || x.title,
						})),
					onClosePane: paneId => {
						focusPane(t.id, paneId)
						closePane(paneId)
					},
					onCloseOtherPanes: paneId => {
						focusPane(t.id, paneId)
						closeOtherPanes(paneId)
					},
					onDuplicateTab: paneId => void duplicateTab(t.id, paneId),
					onCloseTab: () => closeTab(t.id),
				},
			})),
		[
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
		],
	)
}
