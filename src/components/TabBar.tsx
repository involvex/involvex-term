import {useRef, useState, type DragEvent} from 'react'
import type {PaneNode} from '../lib/panes'
import type {ShellProfile} from '../types'

export interface TabInfo {
	id: string
	title: string
	/** When set, git auto-title updates are skipped. */
	customTitle?: string
	cwd?: string
	/** Split-pane tree; single leaf = classic full-terminal tab. */
	root: PaneNode
	activePaneId: string
}

interface Props {
	tabs: TabInfo[]
	activeId: string
	profiles: ShellProfile[]
	defaultProfileId: string
	onSelect: (id: string) => void
	onClose: (id: string) => void
	onNew: (profileId?: string) => void
	onRename: (id: string, title: string) => void
	onReorder: (fromIndex: number, toIndex: number) => void
	onOpenOpencode: () => void
	opencodeAvailable: boolean
	onOpenSettings: () => void
}

export default function TabBar({
	tabs,
	activeId,
	profiles,
	defaultProfileId,
	onSelect,
	onClose,
	onNew,
	onRename,
	onReorder,
	onOpenOpencode,
	opencodeAvailable,
	onOpenSettings,
}: Props) {
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editValue, setEditValue] = useState('')
	const [menuOpen, setMenuOpen] = useState(false)
	const dragFrom = useRef<number | null>(null)

	const commitRename = (id: string) => {
		const v = editValue.trim()
		if (v) onRename(id, v)
		setEditingId(null)
	}

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
					draggable={editingId !== t.id}
					onDragStart={() => {
						dragFrom.current = i
					}}
					onDragOver={e => {
						e.preventDefault()
					}}
					onDrop={(e: DragEvent) => {
						e.preventDefault()
						const from = dragFrom.current
						dragFrom.current = null
						if (from == null || from === i) return
						onReorder(from, i)
					}}
					onClick={() => {
						if (editingId !== t.id) onSelect(t.id)
					}}
					onDoubleClick={e => {
						e.stopPropagation()
						setEditingId(t.id)
						setEditValue(t.customTitle || t.title)
					}}
					title={
						t.customTitle
							? `${t.customTitle}\n${t.cwd || ''}`
							: t.cwd || t.title
					}
				>
					<span className="tab-index">{i + 1}</span>
					{editingId === t.id ? (
						<input
							className="tab-rename"
							value={editValue}
							autoFocus
							onClick={e => e.stopPropagation()}
							onChange={e => setEditValue(e.target.value)}
							onBlur={() => commitRename(t.id)}
							onKeyDown={e => {
								if (e.key === 'Enter') commitRename(t.id)
								if (e.key === 'Escape') setEditingId(null)
							}}
						/>
					) : (
						<span className="tab-title">{t.title}</span>
					)}
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
			<div className="tab-new-wrap">
				<button
					type="button"
					className="tab-new"
					onClick={() => onNew()}
					title="New tab (Ctrl+Shift+T)"
				>
					+
				</button>
				<button
					type="button"
					className="tab-new tab-new-menu"
					aria-label="New tab with profile"
					title="New tab with profile"
					onClick={() => setMenuOpen(o => !o)}
				>
					▾
				</button>
				{menuOpen && (
					<div className="tab-profile-menu">
						{profiles.map(p => (
							<button
								key={p.id}
								type="button"
								className={
									p.id === defaultProfileId
										? 'tab-profile-item tab-profile-default'
										: 'tab-profile-item'
								}
								onClick={() => {
									setMenuOpen(false)
									onNew(p.id)
								}}
							>
								{p.name}
							</button>
						))}
					</div>
				)}
			</div>
			<span className="tabbar-spacer" />
			<button
				type="button"
				className="tab-new tab-opencode"
				onClick={onOpenOpencode}
				disabled={!opencodeAvailable}
				title={
					opencodeAvailable
						? 'Open OpenCode (Ctrl+Shift+O)'
						: 'OpenCode not found on PATH'
				}
				aria-label="Open OpenCode"
			>
				OC
			</button>
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
