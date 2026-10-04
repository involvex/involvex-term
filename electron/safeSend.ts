import type {BrowserWindow} from 'electron'

/**
 * Send to a window that may already be gone. Returns whether it was delivered.
 *
 * `win?.webContents.send(...)` only covers "no window yet". It does not cover
 * "the window was closed", which is the common case here: once a BrowserWindow
 * is closed, `win` still references the destroyed object, so the optional chain
 * passes and Electron throws `TypeError: Object has been destroyed`.
 *
 * That throw lands wherever the send happened to be called from. Most of them
 * are timer or socket callbacks that outlive the window, so it surfaces as an
 * uncaught exception in the main process and an "A JavaScript error occurred in
 * the main process" dialog. A pty socket read is the reliable trigger: closing
 * the window destroys it *before* `will-quit` runs `killAllPtys`, and ConPTY
 * data already queued on the socket is still delivered afterwards.
 *
 * The try/catch is not redundant with the checks: teardown can land between
 * them, and a race that only shows up on shutdown is exactly the kind that
 * survives review and reaches a release build.
 */
export function safeSend(
	target: BrowserWindow | null | undefined,
	channel: string,
	...args: unknown[]
): boolean {
	if (!target || target.isDestroyed()) return false
	const contents = target.webContents
	if (!contents || contents.isDestroyed()) return false
	try {
		contents.send(channel, ...args)
		return true
	} catch {
		return false
	}
}
