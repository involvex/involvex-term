import {describe, expect, it} from 'bun:test'
import {
	COMPLETION_GRACE_MS,
	COMPLETION_IDLE_MS,
	createCompletionTracker,
} from '../../src/lib/completionToast.ts'

const T0 = 1_000_000

describe('completion tracker (prompt-anchored)', () => {
	it('never toasts for the shell-init prompt, even with output in chunk', () => {
		const t = createCompletionTracker(T0)
		expect(t.prompt(true, true, T0 + 500)).toBe(false)
	})

	it('toasts when background output is followed by a fresh prompt', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		const r = t.data(true, true, T0 + 200)
		expect(r.shouldToast).toBe(false)
		expect(t.prompt(true, false, T0 + 900)).toBe(true)
	})

	it('toasts for a silent command (prompt text rides in the prompt chunk)', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		expect(t.prompt(true, true, T0 + 5_000)).toBe(true)
	})

	it('does not toast for a bare prompt redraw with no output', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		expect(t.prompt(true, false, T0 + 5_000)).toBe(false)
	})

	it('completes a prompt that arrived before its split text chunk', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		expect(t.prompt(true, false, T0 + 5_000)).toBe(false) // arms pending
		const r = t.data(true, true, T0 + 5_500)
		expect(r.shouldToast).toBe(true)
	})

	it('lets a stale pending window lapse without toasting', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		expect(t.prompt(true, false, T0 + 5_000)).toBe(false) // arms pending
		const r = t.data(true, true, T0 + 30_000)
		expect(r.shouldToast).toBe(false)
		expect(r.armIdle).toBe(false) // capable: legacy path stays off
	})

	it('toasts at most once per background stint', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		t.data(true, true, T0 + 200)
		expect(t.prompt(true, false, T0 + 900)).toBe(true)
		t.data(true, true, T0 + 1_200)
		expect(t.prompt(true, false, T0 + 2_000)).toBe(false)
		// Looking at the pane opens a new stint.
		t.noteForeground()
		t.data(true, true, T0 + 3_000)
		expect(t.prompt(true, false, T0 + 4_000)).toBe(true)
	})

	it('foreground activity clears armed and pending state', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, true, T0 + 100) // init prompt
		t.data(true, true, T0 + 200)
		t.data(false, true, T0 + 300)
		expect(t.prompt(true, false, T0 + 900)).toBe(false)
	})
})

describe('completion tracker (legacy idle fallback)', () => {
	it('toasts after idle past the spawn grace on prompt-incapable panes', () => {
		const t = createCompletionTracker(T0)
		const r = t.data(true, true, T0 + COMPLETION_GRACE_MS + 100)
		expect(r.shouldToast).toBe(false)
		expect(r.armIdle).toBe(true)
		expect(
			t.idleExpired(true, T0 + COMPLETION_GRACE_MS + 100 + COMPLETION_IDLE_MS),
		).toBe(true)
	})

	it('suppresses the restore-banner storm inside the spawn grace', () => {
		const t = createCompletionTracker(T0)
		const r = t.data(true, true, T0 + 500)
		expect(r.armIdle).toBe(false)
		expect(t.idleExpired(true, T0 + 500 + COMPLETION_IDLE_MS)).toBe(false)
	})

	it('disables the idle path once a prompt OSC proves capability', () => {
		const t = createCompletionTracker(T0)
		t.prompt(true, false, T0 + COMPLETION_GRACE_MS + 100)
		const r = t.data(true, true, T0 + COMPLETION_GRACE_MS + 200)
		expect(r.armIdle).toBe(false)
		expect(
			t.idleExpired(true, T0 + COMPLETION_GRACE_MS + 200 + COMPLETION_IDLE_MS),
		).toBe(false)
	})
})
