export type CliCommand =
	| {
			kind: 'split'
			direction: 'horizontal' | 'vertical'
			dir?: string
			profile?: string
	  }
	| {kind: 'new-tab'; dir?: string; profile?: string}

const SPLIT = new Set(['sp', 'split-pane'])
const NEW_TAB = new Set(['nt', 'st', 'new-tab'])

/**
 * Parse wt-style args (already stripped of exe/script): `sp [-H|-V] [-d dir]
 * [-p profile]` and `nt [-d dir] [-p profile]`. Returns null when the args
 * are not a CLI command (normal app launch).
 */
export function parseCliArgs(args: string[]): CliCommand | null {
	const name = args[0]?.toLowerCase()
	if (!name || (!SPLIT.has(name) && !NEW_TAB.has(name))) return null
	let dir: string | undefined
	let profile: string | undefined
	let direction: 'horizontal' | 'vertical' = 'horizontal'
	for (let i = 1; i < args.length; i++) {
		const a = args[i] ?? ''
		if (a === '-d' || a === '--startingDirectory') dir = args[++i]
		else if (a === '-p' || a === '--profile') profile = args[++i]
		else if (a === '-H' || a === '--horizontal') direction = 'horizontal'
		else if (a === '-V' || a === '--vertical') direction = 'vertical'
	}
	return SPLIT.has(name)
		? {kind: 'split', direction, dir, profile}
		: {kind: 'new-tab', dir, profile}
}
