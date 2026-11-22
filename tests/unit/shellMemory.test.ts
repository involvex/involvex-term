import {afterEach, beforeEach, describe, expect, it} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {setSettingsHome} from '../../electron/settingsStore.ts'
import {
	cycleClipboard,
	listClipboardRing,
	listRecentCommands,
	listRecentDirs,
	loadShellMemory,
	recordClipboard,
	recordRecentCommand,
	recordRecentDir,
	resetShellMemoryForTests,
	setClipboardPersist,
	shellMemoryFile,
} from '../../electron/shellMemory.ts'

const scratchDirs: string[] = []

beforeEach(() => {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ivx-mem-'))
	scratchDirs.push(home)
	setSettingsHome(home)
	resetShellMemoryForTests()
	loadShellMemory()
})

afterEach(() => {
	setSettingsHome(null)
	resetShellMemoryForTests()
	while (scratchDirs.length) {
		fs.rmSync(scratchDirs.pop()!, {recursive: true, force: true})
	}
})

describe('shellMemory recent dirs', () => {
	it('dedupes and caps MRU newest-first', () => {
		const home = scratchDirs[scratchDirs.length - 1]!
		const a = path.join(home, 'a')
		const b = path.join(home, 'b')
		fs.mkdirSync(a)
		fs.mkdirSync(b)
		recordRecentDir(a)
		recordRecentDir(b)
		recordRecentDir(a)
		expect(listRecentDirs()[0]).toBe(a)
		expect(listRecentDirs()).toEqual([a, b])
	})

	it('drops paths that no longer exist', () => {
		const home = scratchDirs[scratchDirs.length - 1]!
		const gone = path.join(home, 'gone')
		fs.mkdirSync(gone)
		recordRecentDir(gone)
		fs.rmSync(gone, {recursive: true, force: true})
		expect(listRecentDirs()).toEqual([])
	})
})

describe('shellMemory clipboard ring', () => {
	it('cycles oldest-ward and skips empty', () => {
		recordClipboard('one')
		recordClipboard('two')
		recordClipboard('')
		expect(listClipboardRing()).toEqual(['two', 'one'])
		expect(cycleClipboard()).toBe('two')
		expect(cycleClipboard()).toBe('one')
		expect(cycleClipboard()).toBe('one')
	})

	it('does not persist clips unless opted in', () => {
		setClipboardPersist(false)
		recordRecentCommand('git status')
		recordClipboard('secret')
		const raw = JSON.parse(fs.readFileSync(shellMemoryFile(), 'utf-8')) as {
			clipboardRing?: string[]
			recentCommands?: string[]
		}
		expect(raw.recentCommands).toEqual(['git status'])
		expect(raw.clipboardRing).toBeUndefined()
		expect(listClipboardRing()).toEqual(['secret'])
	})

	it('persists clips when enabled', () => {
		setClipboardPersist(true)
		recordClipboard('keep-me')
		const raw = JSON.parse(fs.readFileSync(shellMemoryFile(), 'utf-8')) as {
			clipboardRing?: string[]
		}
		expect(raw.clipboardRing).toEqual(['keep-me'])
	})
})

describe('shellMemory recent commands', () => {
	it('records unique newest-first', () => {
		recordRecentCommand('git status')
		recordRecentCommand('bun test')
		recordRecentCommand('git status')
		expect(listRecentCommands()).toEqual(['git status', 'bun test'])
	})
})
