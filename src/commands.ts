export interface PaletteCommand {
	id: string
	title: string
	/** Secondary line shown dimmed (e.g. tab cwd, hotkey). */
	hint?: string
	run: () => void
}

const MRU_KEY = 'involvex-term.palette-mru'
const MRU_MAX = 40

/** Subsequence fuzzy match, case-insensitive. */
export function fuzzyMatch(haystack: string, needle: string): boolean {
	return scoreFuzzy(haystack, needle) !== null
}

/**
 * Ranked subsequence score (higher = better). Title matches should beat
 * hint matches — callers weight the two separately.
 *
 * Scoring: early match bonus, consecutive-run bonus, density penalty for
 * gaps, length penalty so shorter titles win ties.
 */
export function scoreFuzzy(haystack: string, needle: string): number | null {
	const h = haystack.toLowerCase()
	const n = needle.trim().toLowerCase()
	if (!n) return 0
	if (!h) return null

	let score = 0
	let hi = 0
	let consecutive = 0
	let first = -1
	for (const ch of n) {
		const found = h.indexOf(ch, hi)
		if (found === -1) return null
		if (first < 0) first = found
		if (found === hi && consecutive > 0) {
			consecutive += 1
			score += consecutive * 4
		} else {
			consecutive = 1
			score += 1
			if (found > hi) score -= Math.min(3, found - hi)
		}
		hi = found + 1
	}
	// Prefer matches that start earlier and cover more of the haystack.
	score += Math.max(0, 24 - first)
	score -= Math.min(12, h.length - n.length)
	return score
}

export function loadPaletteMru(): string[] {
	try {
		const raw = localStorage.getItem(MRU_KEY)
		if (!raw) return []
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed
			.filter((x): x is string => typeof x === 'string')
			.slice(0, MRU_MAX)
	} catch {
		return []
	}
}

export function rememberPaletteCommand(id: string): void {
	try {
		const prev = loadPaletteMru().filter(x => x !== id)
		const next = [id, ...prev].slice(0, MRU_MAX)
		localStorage.setItem(MRU_KEY, JSON.stringify(next))
	} catch {
		/* private mode / quota */
	}
}

/**
 * Filter + rank palette rows. Empty filter keeps MRU order (recent first),
 * then original order. Non-empty filter scores title higher than hint.
 */
export function filterCommands(
	commands: PaletteCommand[],
	filter: string,
	mru: string[] = [],
): PaletteCommand[] {
	const needle = filter.trim()
	if (!needle) {
		if (mru.length === 0) return commands
		const rank = new Map(mru.map((id, i) => [id, i]))
		return [...commands].sort((a, b) => {
			const ra = rank.get(a.id)
			const rb = rank.get(b.id)
			if (ra === undefined && rb === undefined) return 0
			if (ra === undefined) return 1
			if (rb === undefined) return -1
			return ra - rb
		})
	}

	const scored: Array<{cmd: PaletteCommand; score: number}> = []
	for (const cmd of commands) {
		const titleScore = scoreFuzzy(cmd.title, needle)
		const hintScore = cmd.hint ? scoreFuzzy(cmd.hint, needle) : null
		if (titleScore === null && hintScore === null) continue
		// Title outweighs hint so a weak title hit still beats a strong hint.
		const score =
			(titleScore !== null ? titleScore * 10 + 50 : 0) +
			(hintScore !== null ? hintScore : 0)
		const mruBoost = mru.includes(cmd.id) ? 5 : 0
		scored.push({cmd, score: score + mruBoost})
	}
	scored.sort((a, b) => b.score - a.score)
	return scored.map(s => s.cmd)
}
