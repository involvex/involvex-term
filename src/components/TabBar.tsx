import type {PaneNode} from '../lib/panes'

export interface TabInfo {
	id: string
	title: string
	cwd?: string
	/** Split-pane tree; single leaf = classic full-terminal tab. */
	root: PaneNode
	activePaneId: string
}

interface Props {
	tabs: TabInfo[]
	activeId: string
	onSelect: (id: string) => void
	onClose: (id: string) => void
	onNew: () => void
	onOpenSettings: () => void
}

export default function TabBar({
	tabs,
	activeId,
	onSelect,
	onClose,
	onNew,
	onOpenSettings,
}: Props) {
	return (
		<div
			className="tabbar"
			role="tablist"
		>
			{tabs.map((t, i) => (
				<div
					key={t.id}
					role="tab"
					aria-selected={t.id === activeId}
					className={t.id === activeId ? 'tab tab-active' : 'tab'}
					onClick={() => onSelect(t.id)}
					title={t.cwd || t.title}
				>
					<span className="tab-index">{i + 1}</span>
					<span className="tab-title">{t.title}</span>
					<button
						type="button"
						className="tab-close"
						aria-label={`Close tab ${t.title}`}
						onClick={e => {
							e.stopPropagation()
							onClose(t.id)
						}}
					>
						×
					</button>
				</div>
			))}
			<button
				type="button"
				className="tab-new"
				onClick={onNew}
				title="New tab (Ctrl+Shift+T)"
			>
				+
			</button>
			<span className="tabbar-spacer" />
			<button
				type="button"
				className="tab-new"
				onClick={onOpenSettings}
				title="Settings (Ctrl+,)"
				aria-label="Open settings"
			>
				⚙
			</button>
		</div>
	)
}
