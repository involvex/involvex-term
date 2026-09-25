import type {ILink, ILinkProvider, Terminal} from '@xterm/xterm'
import {termApi} from '../types'

/** Strip trailing punctuation commonly glued to paths/URLs in output. */
function trimTrail(s: string): string {
	return s.replace(/[.,;:!?)]+$/g, '')
}

async function openTarget(raw: string): Promise<void> {
	const target = trimTrail(raw.trim())
	if (!target) return
	const api = termApi()
	if (!api) {
		if (/^https?:\/\//i.test(target)) window.open(target, '_blank')
		return
	}
	if (/^https?:\/\//i.test(target) || /^mailto:/i.test(target)) {
		await api.openExternal(target)
		return
	}
	if (/^file:\/\//i.test(target)) {
		try {
			const u = new URL(target)
			let p = decodeURIComponent(u.pathname)
			// file:///C:/Users/... → C:/Users/...
			if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1)
			await api.openPath(p)
		} catch {
			await api.openPath(target)
		}
		return
	}
	await api.openPath(target)
}

function pushMatch(
	links: ILink[],
	text: string,
	y: number,
	re: RegExp,
	activate: (t: string) => void,
): void {
	re.lastIndex = 0
	let m: RegExpExecArray | null
	while ((m = re.exec(text))) {
		const raw = m[0]
		const cleaned = trimTrail(raw)
		if (cleaned.length < 2) continue
		const start = m.index + 1 // xterm cols are 1-based
		const end = m.index + cleaned.length
		links.push({
			range: {
				start: {x: start, y},
				end: {x: end, y},
			},
			text: cleaned,
			activate: (_e, t) => activate(t),
		})
	}
}

/**
 * Ctrl+click (or click) local paths: `D:\foo`, `\\server\share`, `/home/...`,
 * and `file://` URIs. HTTP(S) is handled by WebLinksAddon.
 */
export function createPathLinkProvider(term: Terminal): ILinkProvider {
	return {
		provideLinks(y, callback) {
			const line = term.buffer.active.getLine(y)
			if (!line) {
				callback(undefined)
				return
			}
			const text = line.translateToString(true)
			const links: ILink[] = []
			const open = (t: string) => {
				void openTarget(t)
			}
			// Windows drive / UNC
			pushMatch(links, text, y, /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|*?]+/g, open)
			// Unix-ish absolute paths (skip lone `/`)
			pushMatch(links, text, y, /(?:\/[\w.-]+){2,}(?:\/[\w.-]*)*/g, open)
			// file:// URIs
			pushMatch(links, text, y, /file:\/\/[^\s"'<>]+/gi, open)
			callback(links.length > 0 ? links : undefined)
		},
	}
}

/** WebLinksAddon handler — open http(s)/mailto via Electron. */
export function webLinkHandler(_event: MouseEvent, uri: string): void {
	void openTarget(uri)
}
