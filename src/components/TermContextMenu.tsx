import {useEffect, useRef} from 'react'
import {createPortal} from 'react-dom'
import type {ContextHit} from '../lib/termContext'

export interface ContextMenuItem {
	id: string
	label: string
	hint?: string
	disabled?: boolean
	separator?: boolean
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
					<button
						key={item.id}
						type="button"
						role="menuitem"
						className="term-context-item"
						disabled={item.disabled}
						onClick={() => {
							item.run?.()
							onClose()
						}}
					>
						<span>{item.label}</span>
						{item.hint ? (
							<span className="term-context-hint">{item.hint}</span>
						) : null}
					</button>
				),
			)}
		</div>,
		document.body,
	)
}
