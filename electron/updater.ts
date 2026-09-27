/**
 * GitHub Releases auto-update via electron-updater.
 * Only meaningful for packaged installs (NSIS / AppImage); portable
 * release/latest junctions get a Releases-page fallback.
 */
import type {BrowserWindow} from 'electron'
import {app, dialog, shell} from 'electron'
import {autoUpdater} from 'electron-updater'

export type UpdateState =
	| 'idle'
	| 'checking'
	| 'available'
	| 'not-available'
	| 'downloading'
	| 'downloaded'
	| 'error'

export interface UpdateStatus {
	state: UpdateState
	version?: string
	currentVersion: string
	message?: string
	percent?: number
}

let status: UpdateStatus = {
	state: 'idle',
	currentVersion: app.getVersion(),
}
let wired = false
let winRef: BrowserWindow | null = null

function emit(next: Partial<UpdateStatus>): void {
	status = {
		...status,
		...next,
		currentVersion: app.getVersion(),
	}
	winRef?.webContents.send('update:status', status)
}

function wireUpdater(): void {
	if (wired) return
	wired = true
	autoUpdater.autoDownload = false
	autoUpdater.autoInstallOnAppQuit = true

	autoUpdater.on('checking-for-update', () => {
		emit({state: 'checking', message: 'Checking for updates…'})
	})
	autoUpdater.on('update-available', info => {
		emit({
			state: 'available',
			version: info.version,
			message: `Update ${info.version} available`,
		})
	})
	autoUpdater.on('update-not-available', info => {
		emit({
			state: 'not-available',
			version: info.version,
			message: `You're on the latest version (${app.getVersion()})`,
		})
	})
	autoUpdater.on('download-progress', p => {
		emit({
			state: 'downloading',
			percent: Math.round(p.percent),
			message: `Downloading… ${Math.round(p.percent)}%`,
		})
	})
	autoUpdater.on('update-downloaded', info => {
		emit({
			state: 'downloaded',
			version: info.version,
			percent: 100,
			message: `Update ${info.version} ready — restart to install`,
		})
	})
	autoUpdater.on('error', err => {
		emit({
			state: 'error',
			message: err?.message || String(err),
		})
	})
}

export function bindUpdaterWindow(win: BrowserWindow | null): void {
	winRef = win
}

export function getUpdateStatus(): UpdateStatus {
	return {...status, currentVersion: app.getVersion()}
}

const RELEASES_URL = 'https://github.com/involvex/involvex-term/releases'

export async function checkForUpdates(): Promise<UpdateStatus> {
	wireUpdater()
	if (!app.isPackaged) {
		emit({
			state: 'error',
			message:
				'Updates only work in a packaged install (NSIS/AppImage). Opening Releases…',
		})
		await shell.openExternal(RELEASES_URL)
		return getUpdateStatus()
	}
	try {
		await autoUpdater.checkForUpdates()
	} catch (e) {
		emit({
			state: 'error',
			message: e instanceof Error ? e.message : String(e),
		})
	}
	return getUpdateStatus()
}

export async function downloadUpdate(): Promise<UpdateStatus> {
	wireUpdater()
	if (!app.isPackaged) {
		emit({state: 'error', message: 'Not a packaged install'})
		return getUpdateStatus()
	}
	try {
		await autoUpdater.downloadUpdate()
	} catch (e) {
		emit({
			state: 'error',
			message: e instanceof Error ? e.message : String(e),
		})
	}
	return getUpdateStatus()
}

export async function installUpdate(): Promise<void> {
	wireUpdater()
	if (status.state !== 'downloaded') return
	const {response} = await dialog.showMessageBox({
		type: 'question',
		buttons: ['Restart now', 'Later'],
		defaultId: 0,
		cancelId: 1,
		title: 'Install update',
		message: `Restart to install version ${status.version ?? ''}?`,
	})
	if (response === 0) {
		autoUpdater.quitAndInstall(false, true)
	}
}

/** Quiet check a few seconds after launch (packaged only). */
export function scheduleStartupUpdateCheck(): void {
	if (!app.isPackaged) return
	setTimeout(() => {
		wireUpdater()
		void autoUpdater.checkForUpdates().catch(() => undefined)
	}, 8000)
}
