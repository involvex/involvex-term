import {afterEach, describe, expect, it} from 'bun:test'
import {listFocusable, trapFocus} from '../../src/lib/focusTrap.ts'

type Listener = (e: {
	key: string
	shiftKey: boolean
	preventDefault: () => void
}) => void

/**
 * Minimal DOM stand-in — bun test has no document/HTMLElement by default.
 * Implements only what trapFocus / listFocusable touch.
 */
class FakeEl {
	tagName: string
	offsetParent: object | null = {}
	attrs = new Map<string, string>()
	children: FakeEl[] = []
	listeners = new Map<string, Set<Listener>>()
	href?: string

	constructor(tagName: string) {
		this.tagName = tagName.toUpperCase()
	}

	focus(): void {
		fakeDoc.activeElement = this
	}

	hasAttribute(name: string): boolean {
		return this.attrs.has(name)
	}

	getAttribute(name: string): string | null {
		return this.attrs.get(name) ?? null
	}

	setAttribute(name: string, value: string): void {
		this.attrs.set(name, value)
	}

	addEventListener(type: string, cb: Listener): void {
		let set = this.listeners.get(type)
		if (!set) {
			set = new Set()
			this.listeners.set(type, set)
		}
		set.add(cb)
	}

	removeEventListener(type: string, cb: Listener): void {
		this.listeners.get(type)?.delete(cb)
	}

	dispatch(type: string, e: Parameters<Listener>[0]): void {
		for (const cb of this.listeners.get(type) ?? []) cb(e)
	}

	contains(node: FakeEl | null): boolean {
		if (!node) return false
		if (node === this) return true
		return this.children.some(c => c.contains(node))
	}

	querySelectorAll(_sel: string): FakeEl[] {
		const out: FakeEl[] = []
		const walk = (el: FakeEl) => {
			for (const child of el.children) {
				out.push(child)
				walk(child)
			}
		}
		walk(this)
		return out.filter(el => {
			const tag = el.tagName
			if (el.hasAttribute('disabled')) return false
			if (tag === 'A' && el.href) return true
			if (
				tag === 'BUTTON' ||
				tag === 'TEXTAREA' ||
				tag === 'INPUT' ||
				tag === 'SELECT'
			)
				return true
			const tab = el.getAttribute('tabindex')
			return tab !== null && tab !== '-1'
		})
	}

	append(...kids: FakeEl[]): void {
		this.children.push(...kids)
	}
}

const fakeDoc = {
	activeElement: null as FakeEl | null,
}

const originalDocument = (globalThis as {document?: unknown}).document

afterEach(() => {
	if (originalDocument === undefined)
		delete (globalThis as {document?: unknown}).document
	else (globalThis as {document: unknown}).document = originalDocument
	fakeDoc.activeElement = null
})

function installDoc(initial: FakeEl | null = null): void {
	fakeDoc.activeElement = initial
	;(globalThis as {document: typeof fakeDoc}).document = fakeDoc
}

function button(label: string, disabled = false): FakeEl {
	const el = new FakeEl('button')
	if (disabled) el.setAttribute('disabled', '')
	el.setAttribute('data-label', label)
	return el
}

describe('listFocusable', () => {
	it('skips disabled and display-none (null offsetParent) controls', () => {
		installDoc()
		const root = new FakeEl('div')
		const ok = button('ok')
		const disabled = button('no', true)
		const hidden = button('hid')
		hidden.offsetParent = null
		root.append(ok, disabled, hidden)
		expect(listFocusable(root as unknown as HTMLElement)).toEqual([
			ok as unknown as HTMLElement,
		])
	})
})

describe('trapFocus', () => {
	it('moves focus to the first focusable on install', () => {
		const outside = button('outside')
		installDoc(outside)
		const root = new FakeEl('div')
		const first = button('a')
		const second = button('b')
		root.append(first, second)
		const release = trapFocus(root as unknown as HTMLElement)
		expect(fakeDoc.activeElement).toBe(first)
		release()
	})

	it('cycles Tab from last to first and Shift+Tab from first to last', () => {
		installDoc()
		const root = new FakeEl('div')
		const first = button('a')
		const second = button('b')
		root.append(first, second)
		const release = trapFocus(root as unknown as HTMLElement)
		expect(fakeDoc.activeElement).toBe(first)

		second.focus()
		let prevented = false
		root.dispatch('keydown', {
			key: 'Tab',
			shiftKey: false,
			preventDefault: () => {
				prevented = true
			},
		})
		expect(prevented).toBe(true)
		expect(fakeDoc.activeElement).toBe(first)

		prevented = false
		first.focus()
		root.dispatch('keydown', {
			key: 'Tab',
			shiftKey: true,
			preventDefault: () => {
				prevented = true
			},
		})
		expect(prevented).toBe(true)
		expect(fakeDoc.activeElement).toBe(second)
		release()
	})

	it('restores previously focused element on cleanup', () => {
		const outside = button('outside')
		installDoc(outside)
		const root = new FakeEl('div')
		root.append(button('a'))
		const release = trapFocus(root as unknown as HTMLElement)
		expect(fakeDoc.activeElement).not.toBe(outside)
		release()
		expect(fakeDoc.activeElement).toBe(outside)
	})

	it('prevents Tab when there are no focusable children', () => {
		installDoc()
		const root = new FakeEl('div')
		const release = trapFocus(root as unknown as HTMLElement)
		let prevented = false
		root.dispatch('keydown', {
			key: 'Tab',
			shiftKey: false,
			preventDefault: () => {
				prevented = true
			},
		})
		expect(prevented).toBe(true)
		release()
	})

	it('removes the keydown listener on cleanup', () => {
		installDoc()
		const root = new FakeEl('div')
		root.append(button('a'), button('b'))
		const release = trapFocus(root as unknown as HTMLElement)
		release()
		expect(root.listeners.get('keydown')?.size ?? 0).toBe(0)
	})
})
