import {describe, expect, it} from 'bun:test'
import {parseNameStatus} from '../../electron/gitEngine.ts'

describe('parseNameStatus', () => {
	it('parses modified and added paths', () => {
		const raw = 'M\tsrc/App.tsx\nA\tREADME.md\n'
		const entries = parseNameStatus(raw, 'staged')
		expect(entries).toEqual([
			{path: 'src/App.tsx', status: 'M', kind: 'staged'},
			{path: 'README.md', status: 'A', kind: 'staged'},
		])
	})

	it('uses the new path for renames', () => {
		const raw = 'R100\told/name.ts\tnew/name.ts\n'
		const entries = parseNameStatus(raw, 'unstaged')
		expect(entries).toEqual([
			{path: 'new/name.ts', status: 'R', kind: 'unstaged'},
		])
	})

	it('skips blank lines', () => {
		expect(parseNameStatus('\n\n', 'staged')).toEqual([])
	})
})
