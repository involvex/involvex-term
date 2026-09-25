export interface PaletteCommand {
	id: string
	title: string
	/** Secondary line shown dimmed (e.g. tab cwd, hotkey). */
	hint?: string
	run: () => void
}

/** Subsequence fuzzy match, case-insensitive. */
export function fuzzyMatch(haystack: string, needle: string): boolean {
	const h = haystack.toLowerCase()
	const n = needle.trim().toLowerCase()
	if (!n) return true
	let i = 0
	for (const ch of n) {
		i = h.indexOf(ch, i)
		if (i === -1) return false
		i += 1
	}
	return true
}

export function filterCommands(
	commands: PaletteCommand[],
	filter: string,
): PaletteCommand[] {
	if (!filter.trim()) return commands
	return commands.filter(
		c =>
			fuzzyMatch(c.title, filter) ||
			(c.hint ? fuzzyMatch(c.hint, filter) : false),
	)
}
