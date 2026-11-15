/** Serialize profile env for the KEY=value textarea. */
export function envToText(env?: Record<string, string>): string {
	if (!env) return ''
	return Object.entries(env)
		.map(([k, v]) => `${k}=${v}`)
		.join('\n')
}

/** Parse KEY=value lines into an env map (empty → undefined). */
export function textToEnv(text: string): Record<string, string> | undefined {
	const out: Record<string, string> = {}
	for (const line of text.split('\n')) {
		const t = line.trim()
		if (!t || t.startsWith('#')) continue
		const i = t.indexOf('=')
		if (i <= 0) continue
		const key = t.slice(0, i).trim()
		if (!key) continue
		out[key] = t.slice(i + 1)
	}
	return Object.keys(out).length ? out : undefined
}
