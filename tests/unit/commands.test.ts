import {describe, expect, it} from 'bun:test'
import {
	filterCommands,
	fuzzyMatch,
	scoreFuzzy,
	type PaletteCommand,
} from '../../src/commands.ts'

function cmd(id: string, title: string, hint?: string): PaletteCommand {
	return {id, title, hint, run: () => undefined}
}

describe('palette fuzzy ranking', () => {
	it('matches subsequences case-insensitively', () => {
		expect(fuzzyMatch('New tab', 'nt')).toBe(true)
		expect(fuzzyMatch('New tab', 'xyz')).toBe(false)
	})

	it('scores tighter / earlier matches higher', () => {
		const tight = scoreFuzzy('git status', 'gst')
		const loose = scoreFuzzy('generate stylesheet', 'gst')
		expect(tight).not.toBeNull()
		expect(loose).not.toBeNull()
		expect(tight!).toBeGreaterThan(loose!)
	})

	it('prefers title matches over hint matches', () => {
		const commands = [
			cmd('a', 'Something else', 'git status'),
			cmd('b', 'Git status', 'Ctrl+Shift+G'),
		]
		const ranked = filterCommands(commands, 'git')
		expect(ranked[0]?.id).toBe('b')
	})

	it('orders empty filter by MRU then original', () => {
		const commands = [cmd('a', 'Alpha'), cmd('b', 'Beta'), cmd('c', 'Gamma')]
		const ranked = filterCommands(commands, '', ['c', 'a'])
		expect(ranked.map(c => c.id)).toEqual(['c', 'a', 'b'])
	})
})
