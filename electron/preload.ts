import {contextBridge, ipcRenderer} from 'electron'

export interface TermApi {
	ptySpawn: (args: {
		id: string
		cwd?: string
		cols: number
		rows: number
		profileId?: string
	}) => Promise<{id: string; cwd: string; shell: string}>
	ptyWrite: (id: string, data: string) => void
	ptyResize: (id: string, cols: number, rows: number) => void
	ptyKill: (id: string) => void
	ptySeedCwd: (id: string, cwd: string) => void
	onPtyData: (id: string, cb: (data: string) => void) => () => void
	onPtyExit: (id: string, cb: () => void) => () => void
	gitGet: (cwd: string) => Promise<unknown>
	onGitChanged: (
		cb: (msg: {tabId: string} & Record<string, unknown>) => void,
	) => () => void
	onGitChangedFor: (
		tabId: string,
		cb: (status: Record<string, unknown>) => void,
	) => () => void
	sysGet: () => Promise<unknown>
	onSysTick: (cb: (stats: Record<string, unknown>) => void) => () => void
	ptyCwd: (ids: string[]) => Promise<Array<{id: string; cwd: string | null}>>
	sessionGet: () => Promise<unknown>
	sessionSave: (state: unknown) => Promise<unknown>
	sessionSaveSync: (state: unknown) => void
	clipboardWrite: (text: string) => Promise<void>
	clipboardRead: () => Promise<string>
	settingsGet: () => Promise<unknown>
	settingsSet: (next: unknown) => Promise<unknown>
	onSettingsChanged: (cb: (s: unknown) => void) => () => void
	onTabAction: (cb: (action: string) => void) => () => void
	opencodeAvailable: () => Promise<boolean>
	opencodeStatus: (cwd?: string) => Promise<{
		available: boolean
		sessionCount: number
		latest: {
			id: string
			title: string
			directory: string
			updated: number
			created: number
		} | null
		projectMatch: boolean
	}>
	dialogConfirm: (opts: {
		message: string
		detail?: string
		title?: string
	}) => Promise<boolean>
}

function sub(channel: string, cb: (...a: never[]) => void): () => void {
	const fn = (_e: unknown, ...args: never[]) =>
		(cb as (...a: unknown[]) => void)(...args)
	ipcRenderer.on(channel, fn as never)
	return () => ipcRenderer.off(channel, fn as never)
}

const api: TermApi = {
	ptySpawn: args => ipcRenderer.invoke('pty:spawn', args),
	ptyWrite: (id, data) => ipcRenderer.send('pty:write', {id, data}),
	ptyResize: (id, cols, rows) =>
		ipcRenderer.send('pty:resize', {id, cols, rows}),
	ptyKill: id => ipcRenderer.send('pty:kill', {id}),
	ptySeedCwd: (id, cwd) => ipcRenderer.send('pty:cwd-seed', {id, cwd}),
	onPtyData: (id, cb) => sub(`pty:data-${id}`, cb as never),
	onPtyExit: (id, cb) => sub(`pty:exit-${id}`, cb as never),
	gitGet: cwd => ipcRenderer.invoke('git:get', {cwd}),
	onGitChanged: cb => sub('git:changed', cb as never),
	onGitChangedFor: (tabId, cb) => sub(`git:changed-${tabId}`, cb as never),
	sysGet: () => ipcRenderer.invoke('sys:get'),
	onSysTick: cb => sub('sys:tick', cb as never),
	ptyCwd: ids => ipcRenderer.invoke('pty:cwd', {ids}),
	sessionGet: () => ipcRenderer.invoke('session:get'),
	sessionSave: state => ipcRenderer.invoke('session:save', state),
	sessionSaveSync: state => ipcRenderer.send('session:save', state),
	clipboardWrite: text => ipcRenderer.invoke('clipboard:write', {text}),
	clipboardRead: () => ipcRenderer.invoke('clipboard:read'),
	settingsGet: () => ipcRenderer.invoke('settings:get'),
	settingsSet: next => ipcRenderer.invoke('settings:set', next),
	onSettingsChanged: cb => sub('settings:changed', cb as never),
	onTabAction: cb => sub('tab:action', cb as never),
	opencodeAvailable: () => ipcRenderer.invoke('opencode:available'),
	opencodeStatus: cwd => ipcRenderer.invoke('opencode:status', {cwd}),
	dialogConfirm: opts => ipcRenderer.invoke('dialog:confirm', opts),
}

contextBridge.exposeInMainWorld('termApi', api)

// Keep legacy channel used by template
contextBridge.exposeInMainWorld('ipcRenderer', {
	on: (channel: string, listener: (...a: unknown[]) => void) => {
		const fn = (_e: unknown, ...args: unknown[]) => listener(...args)
		ipcRenderer.on(channel, fn as never)
		return () => ipcRenderer.off(channel, fn as never)
	},
	off: (channel: string, listener: (...a: never[]) => void) =>
		ipcRenderer.off(channel, listener as never),
	send: (channel: string, ...args: unknown[]) =>
		ipcRenderer.send(channel, ...args),
	invoke: (channel: string, ...args: unknown[]) =>
		ipcRenderer.invoke(channel, ...args),
})
