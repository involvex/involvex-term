/** Imperative actions for the focused xterm instance (clear / marks). */
import type {IMarker, Terminal} from '@xterm/xterm'

export interface TermActions {
	clearBuffer: () => void
	addMark: () => void
	jumpPrevMark: () => void
	jumpNextMark: () => void
}

const registry = new Map<string, TermActions>()

export function registerTermActions(
	paneId: string,
	actions: TermActions,
): void {
	registry.set(paneId, actions)
}

export function unregisterTermActions(paneId: string): void {
	registry.delete(paneId)
}

export function getTermActions(paneId: string): TermActions | undefined {
	return registry.get(paneId)
}

export function createMarkController(term: Terminal): {
	addMark: () => void
	jumpPrev: () => void
	jumpNext: () => void
	dispose: () => void
} {
	const marks: IMarker[] = []
	let cursor = -1

	const prune = () => {
		for (let i = marks.length - 1; i >= 0; i--) {
			if (marks[i].isDisposed) marks.splice(i, 1)
		}
		if (cursor >= marks.length) cursor = marks.length - 1
	}

	return {
		addMark: () => {
			prune()
			const m = term.registerMarker(0)
			if (!m) return
			marks.push(m)
			cursor = marks.length - 1
		},
		jumpPrev: () => {
			prune()
			if (marks.length === 0) return
			if (cursor < 0) cursor = marks.length - 1
			else cursor = Math.max(0, cursor - 1)
			const m = marks[cursor]
			if (m && !m.isDisposed) term.scrollToLine(m.line)
		},
		jumpNext: () => {
			prune()
			if (marks.length === 0) return
			if (cursor < 0) cursor = 0
			else cursor = Math.min(marks.length - 1, cursor + 1)
			const m = marks[cursor]
			if (m && !m.isDisposed) term.scrollToLine(m.line)
		},
		dispose: () => {
			for (const m of marks) {
				try {
					m.dispose()
				} catch {
					/* noop */
				}
			}
			marks.length = 0
		},
	}
}
