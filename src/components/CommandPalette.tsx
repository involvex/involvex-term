import {useEffect, useMemo, useRef, useState} from 'react'
import {
	filterCommands,
	loadPaletteMru,
	rememberPaletteCommand,
	type PaletteCommand,
} from '../commands'
import {focusTerm} from '../lib/focusTerm'
import {trapFocus} from '../lib/focusTrap'

interface Props {
	tabId: string
	commands: PaletteCommand[]
	onClose: () => void
}

export default function CommandPalette({tabId, commands, onClose}: Props) {
	const [filter, setFilter] = useState('')
	const [index, setIndex] = useState(0)
	const [mru, setMru] = useState(() => loadPaletteMru())
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	const visible = useMemo(
		() => filterCommands(commands, filter, mru),
		[commands, filter, mru],
	)

	const dialogRef = useRef<HTMLDivElement>(null)
	const activeId = visible[index]?.id

	useEffect(() => {
		const el = dialogRef.current
		if (!el) return
		return trapFocus(el)
	}, [])

	useEffect(() => {
		const el = listRef.current?.children[index] as HTMLElement | undefined
		el?.scrollIntoView({block: 'nearest'})
	}, [index, visible])

	const close = () => {
		onClose()
		focusTerm(tabId)
	}

	const run = (cmd: PaletteCommand | undefined) => {
		if (!cmd) return
		rememberPaletteCommand(cmd.id)
		setMru(loadPaletteMru())
		onClose()
		focusTerm(tabId)
		cmd.run()
	}

	return (
		<div
			className="modal-backdrop"
			onClick={close}
		>
			<div
				ref={dialogRef}
				className="modal palette"
				onClick={e => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Command palette"
			>
				<input
					ref={inputRef}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="palette-listbox"
					aria-activedescendant={
						activeId ? `palette-opt-${activeId}` : undefined
					}
					value={filter}
					placeholder="Type a command, branch, session, or tab…"
					aria-label="Command palette"
					onChange={e => {
						setFilter(e.target.value)
						setIndex(0)
					}}
					onKeyDown={e => {
						if (e.key === 'ArrowDown') {
							e.preventDefault()
							setIndex(i => Math.min(i + 1, Math.max(0, visible.length - 1)))
						} else if (e.key === 'ArrowUp') {
							e.preventDefault()
							setIndex(i => Math.max(i - 1, 0))
						} else if (e.key === 'Enter') {
							e.preventDefault()
							run(visible[index])
						} else if (e.key === 'Escape') {
							e.preventDefault()
							close()
						}
					}}
				/>
				<div
					id="palette-listbox"
					className="palette-list"
					ref={listRef}
					role="listbox"
				>
					{visible.map((c, i) => (
						<div
							key={c.id}
							id={`palette-opt-${c.id}`}
							role="option"
							aria-selected={i === index}
							data-selected={i === index}
							className={i === index ? 'palette-item selected' : 'palette-item'}
							onClick={() => run(c)}
							onMouseMove={() => {
								if (i !== index) setIndex(i)
							}}
						>
							<span>{c.title}</span>
							{c.hint && <span className="footer-dim">{c.hint}</span>}
						</div>
					))}
					{visible.length === 0 && (
						<div className="palette-item footer-dim">No matching commands</div>
					)}
				</div>
			</div>
		</div>
	)
}
