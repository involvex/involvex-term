import {describe, expect, it} from 'bun:test'
import type {BrowserWindow} from 'electron'
import {safeSend} from '../../electron/safeSend'

/**
 * Fakes just enough of a BrowserWindow to model the teardown race.
 *
 * The real crash was `TypeError: Object has been destroyed` thrown from a pty
 * socket read after the window closed, because `win?.webContents.send(...)` only
 * covers "no window yet" and not "the window is gone".
 */
function fakeWindow(opts: {
	destroyed?: boolean
	contentsDestroyed?: boolean
	sendThrows?: boolean
}) {
	const sent: {channel: string; args: unknown[]}[] = []
	const win = {
		isDestroyed: () => opts.destroyed === true,
		webContents: {
			isDestroyed: () => opts.contentsDestroyed === true,
			send: (channel: string, ...args: unknown[]) => {
				if (opts.sendThrows) {
					throw new TypeError('Object has been destroyed')
				}
				sent.push({channel, args})
			},
		},
	}
	return {win: win as unknown as BrowserWindow, sent}
}

describe('safeSend', () => {
	it('forwards the channel and every argument to a live window', () => {
		const {win, sent} = fakeWindow({})
		expect(safeSend(win, 'pty:data-p1', 'hello')).toBe(true)
		expect(sent).toEqual([{channel: 'pty:data-p1', args: ['hello']}])
	})

	it('passes multiple arguments through unchanged', () => {
		// The prompt event sends an object as a second argument; dropping or
		// reordering arguments would silently corrupt it.
		const {win, sent} = fakeWindow({})
		safeSend(win, 'pty:prompt-p1', {hadOutput: true})
		expect(sent[0]).toEqual({
			channel: 'pty:prompt-p1',
			args: [{hadOutput: true}],
		})
	})

	it('does not send to a destroyed window', () => {
		// The regression: the window is closed but `win` still references it, so
		// the optional chain passes and Electron throws.
		const {win, sent} = fakeWindow({destroyed: true})
		expect(safeSend(win, 'pty:data-p1', 'x')).toBe(false)
		expect(sent).toEqual([])
	})

	it('does not send when only the webContents is destroyed', () => {
		// A window can be mid-teardown: the BrowserWindow reports alive while
		// its webContents is already gone.
		const {win, sent} = fakeWindow({contentsDestroyed: true})
		expect(safeSend(win, 'sys:tick', {})).toBe(false)
		expect(sent).toEqual([])
	})

	it('swallows a send that throws mid-teardown', () => {
		// Not redundant with the isDestroyed checks: destruction can land
		// between the check and the send.
		const {win} = fakeWindow({sendThrows: true})
		expect(safeSend(win, 'pty:exit-p1')).toBe(false)
	})

	it('tolerates no window at all', () => {
		expect(safeSend(null, 'git:changed')).toBe(false)
		expect(safeSend(undefined, 'git:changed')).toBe(false)
	})
})
