/** Extract plain text from an xterm buffer (scrollback + viewport). */
import type {Terminal} from '@xterm/xterm'

export function serializeTerminalBuffer(term: Terminal): string {
	const buf = term.buffer.active
	const lines: string[] = []
	for (let i = 0; i < buf.length; i++) {
		const line = buf.getLine(i)
		if (!line) continue
		lines.push(line.translateToString(true))
	}
	// Trim trailing blank lines
	while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
		lines.pop()
	}
	return lines.join('\n')
}
