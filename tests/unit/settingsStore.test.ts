import {describe, expect, it} from 'bun:test'
import {SettingsSchema} from '../../electron/settingsStore.ts'

describe('SettingsSchema', () => {
	it('parses empty or partial config with correct defaults', () => {
		const parsed = SettingsSchema.parse({})
		expect(parsed.hotkeys).toBeDefined()
		expect(parsed.agent).toBeDefined()
		expect(parsed.terminal.scrollback).toBeGreaterThan(0)
	})
})
