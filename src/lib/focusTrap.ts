/**
 * Trap Tab focus inside a dialog element and restore focus on cleanup.
 */
export function trapFocus(container: HTMLElement): () => void {
	const previouslyFocused =
		document.activeElement instanceof HTMLElement
			? document.activeElement
			: null

	const focusables = (): HTMLElement[] =>
		Array.from(
			container.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
			),
		).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'Tab') return
		const items = focusables()
		if (items.length === 0) {
			e.preventDefault()
			return
		}
		const first = items[0]
		const last = items[items.length - 1]
		const active = document.activeElement
		if (e.shiftKey) {
			if (active === first || !container.contains(active)) {
				e.preventDefault()
				last.focus()
			}
		} else if (active === last || !container.contains(active)) {
			e.preventDefault()
			first.focus()
		}
	}

	container.addEventListener('keydown', onKeyDown)
	const items = focusables()
	;(items[0] ?? container).focus()

	return () => {
		container.removeEventListener('keydown', onKeyDown)
		previouslyFocused?.focus()
	}
}
