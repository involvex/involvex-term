/**
 * Trap Tab focus inside a dialog element and restore focus on cleanup.
 */

/** Duck-type check so unit tests can stub elements without a real DOM. */
function asFocusable(el: EventTarget | null): HTMLElement | null {
	if (!el || typeof (el as HTMLElement).focus !== 'function') return null
	return el as HTMLElement
}

export function listFocusable(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
}

export function trapFocus(container: HTMLElement): () => void {
	const previouslyFocused = asFocusable(document.activeElement)

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key !== 'Tab') return
		const items = listFocusable(container)
		if (items.length === 0) {
			e.preventDefault()
			return
		}
		const first = items[0]
		const last = items[items.length - 1]
		const active = asFocusable(document.activeElement)
		if (e.shiftKey) {
			if (active === first || !active || !container.contains(active)) {
				e.preventDefault()
				last.focus()
			}
		} else if (active === last || !active || !container.contains(active)) {
			e.preventDefault()
			first.focus()
		}
	}

	container.addEventListener('keydown', onKeyDown)
	const items = listFocusable(container)
	;(items[0] ?? container).focus()

	return () => {
		container.removeEventListener('keydown', onKeyDown)
		previouslyFocused?.focus()
	}
}
