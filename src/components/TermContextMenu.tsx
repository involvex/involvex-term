import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import type {ContextHit} from '../lib/termContext'

export type ContextMenuIcon =
	| 'find'
	| 'duplicate'
	| 'split'
	| 'swap'
	| 'move'
	| 'close-other'
	| 'close-pane'
	| 'close-tab'
	| 'pin'
	| 'rename'
	| 'check'
	| 'color'
	| 'export'

export interface ContextMenuItem {
	id: string
	label: string
	hint?: string
	disabled?: boolean
	separator?: boolean
	icon?: ContextMenuIcon
	children?: ContextMenuItem[]
	run?: () => void
}

export interface TermContextMenuState {
	x: number
	y: number
	hit: ContextHit | null
	hasSelection: boolean
	items: ContextMenuItem[]
}

interface Props {
	menu: TermContextMenuState
	onClose: () => void
}

function MenuIcon({name}: {name: ContextMenuIcon}) {
	const common = {
		width: 16,
		height: 16,
		viewBox: '0 0 16 16',
		fill: 'currentColor',
		'aria-hidden': true,
	} as const
	switch (name) {
		case 'find':
			return (
				<svg {...common}>
					<path d="M6.5 2a4.5 4.5 0 0 1 3.54 7.26l3.2 3.2-.7.7-3.2-3.2A4.5 4.5 0 1 1 6.5 2zm0 1.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
				</svg>
			)
		case 'duplicate':
			return (
				<svg {...common}>
					<path d="M4 3.5h7v1H4v-1zm0 2.5h7v7H4V6zm1.5 1.5v4h4v-4h-4zM9 4.5h2.5V7H9V4.5z" />
				</svg>
			)
		case 'split':
			return (
				<svg {...common}>
					<path d="M2 2h12v12H2V2zm1 1v4.5h4.5V3H3zm5.5 0V7H13V3H8.5zM3 8.5h4.5V13H3V8.5zm5.5 0H13V13H8.5V8.5z" />
				</svg>
			)
		case 'swap':
			return (
				<svg {...common}>
					<path d="M3 5.5h7.5l-1.4-1.4.7-.7 2.6 2.6-2.6 2.6-.7-.7L10.5 7.5H3v-2zm10 5H5.5l1.4 1.4-.7.7-2.6-2.6 2.6-2.6.7.7L5.5 8.5H13v2z" />
				</svg>
			)
		case 'move':
			return (
				<svg {...common}>
					<path d="M9 2.5 11.5 5H9.5v3h3V6.5l2.5 2.5-2.5 2.5V10h-3v3H9.5L7 10.5 9 8V6.5H6v3H4.5L2 7l2.5-2.5V6h3V3h1.5z" />
				</svg>
			)
		case 'close-other':
		case 'close-pane':
			return (
				<svg {...common}>
					<path d="M3 3h7v1H4v9h9v-6h1v7H3V3zm8-1 4 4-1 1-4-4 1-1z" />
				</svg>
			)
		case 'close-tab':
			return (
				<svg {...common}>
					<path d="M4 4h8v8H4V4zm1.5 1.5v5h5v-5h-5zm1.8 1.2.7.7L7.5 7.2 8.5 8.2l-.7.7-1-1-1 1-.7-.7 1-1-1-1z" />
				</svg>
			)
		case 'pin':
			return (
				<svg {...common}>
					<path d="M8 2.5 9.5 5H12l-2 2.2.8 3.8L8 9.5 5.2 11l.8-3.8L4 5h2.5L8 2.5zm0 8.2V14" />
				</svg>
			)
		case 'rename':
			return (
				<svg {...common}>
					<path d="M9.5 2.5 13.5 6.5 6 14H2v-4L9.5 2.5zm0 1.4L3.5 10v2.5H6L12.1 4.9 9.5 3.9z" />
				</svg>
			)
		case 'check':
			return (
				<svg {...common}>
					<path d="M6.5 11.2 3.2 7.9l.9-.9 2.4 2.4 5-5 .9.9-5.9 5.9z" />
				</svg>
			)
		case 'color':
			return (
				<svg {...common}>
					<path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 1.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM5.5 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm5 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM8 12a1.2 1.2 0 1 0 0-2.4A1.2 1.2 0 0 0 8 12z" />
				</svg>
			)
		case 'export':
			return (
				<svg {...common}>
					<path d="M8 2v7.2L5.8 7l-.8.8L8.5 11l3.5-3.2-.8-.8L9 9.2V2H8zM3 12v2h10v-2h-1v1H4v-1H3z" />
				</svg>
			)
		default:
			return null
	}
}

function ContextMenuRow({
	item,
	onClose,
	depth,
}: {
	item: ContextMenuItem
	onClose: () => void
	depth: number
}) {
	const [open, setOpen] = useState(false)
	const rowRef = useRef<HTMLDivElement>(null)
	const hasChildren = Boolean(item.children?.length)

	useEffect(() => {
		if (!open) return
		const onDown = (e: MouseEvent) => {
			if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		window.addEventListener('mousedown', onDown, true)
		return () => window.removeEventListener('mousedown', onDown, true)
	}, [open])

	return (
		<div
			ref={rowRef}
			className="term-context-row"
			onMouseEnter={() => {
				if (hasChildren && !item.disabled) setOpen(true)
			}}
			onMouseLeave={() => setOpen(false)}
		>
			<button
				type="button"
				role={hasChildren ? 'menuitem' : 'menuitem'}
				aria-haspopup={hasChildren ? true : undefined}
				aria-expanded={hasChildren ? open : undefined}
				className="term-context-item"
				disabled={item.disabled}
				onClick={() => {
					if (hasChildren) {
						setOpen(v => !v)
						return
					}
					item.run?.()
					onClose()
				}}
			>
				<span className="term-context-label">
					{item.icon ? (
						<span className="term-context-icon">
							<MenuIcon name={item.icon} />
						</span>
					) : (
						<span className="term-context-icon term-context-icon-spacer" />
					)}
					<span>{item.label}</span>
				</span>
				{item.hint ? (
					<span className="term-context-hint">{item.hint}</span>
				) : hasChildren ? (
					<span
						className="term-context-chevron"
						aria-hidden
					>
						›
					</span>
				) : null}
			</button>
			{hasChildren && open && !item.disabled ? (
				<div
					className="term-context-submenu"
					style={{marginLeft: depth > 0 ? 0 : undefined}}
					role="menu"
				>
					{item.children!.map((child, i) =>
						child.separator ? (
							<div
								key={`sep-${i}`}
								className="term-context-sep"
								role="separator"
							/>
						) : (
							<ContextMenuRow
								key={child.id}
								item={child}
								onClose={onClose}
								depth={depth + 1}
							/>
						),
					)}
				</div>
			) : null}
		</div>
	)
}

export default function TermContextMenu({menu, onClose}: Props) {
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		const onDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose()
		}
		window.addEventListener('keydown', onKey)
		window.addEventListener('mousedown', onDown, true)
		return () => {
			window.removeEventListener('keydown', onKey)
			window.removeEventListener('mousedown', onDown, true)
		}
	}, [onClose])

	useEffect(() => {
		const el = ref.current
		if (!el) return
		const pad = 8
		const rect = el.getBoundingClientRect()
		let left = menu.x
		let top = menu.y
		if (left + rect.width > window.innerWidth - pad)
			left = Math.max(pad, window.innerWidth - rect.width - pad)
		if (top + rect.height > window.innerHeight - pad)
			top = Math.max(pad, window.innerHeight - rect.height - pad)
		el.style.left = `${left}px`
		el.style.top = `${top}px`
	}, [menu.x, menu.y, menu.items])

	return createPortal(
		<div
			ref={ref}
			className="term-context-menu"
			style={{left: menu.x, top: menu.y}}
			role="menu"
			aria-label="Terminal context menu"
		>
			{menu.items.map((item, i) =>
				item.separator ? (
					<div
						key={`sep-${i}`}
						className="term-context-sep"
						role="separator"
					/>
				) : (
					<ContextMenuRow
						key={item.id}
						item={item}
						onClose={onClose}
						depth={0}
					/>
				),
			)}
		</div>,
		document.body,
	)
}
