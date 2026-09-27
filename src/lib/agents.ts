/** Built-in CLI coding agents (OpenCode default; others are launch-only). */

export interface AgentTool {
	id: string
	name: string
	/** Short tab-bar / footer badge (≤4 chars). */
	label: string
	/** Executable checked on PATH. */
	binary: string
	/** Written to the focused pane to start. */
	command: string
	/** Optional resume/continue command. */
	continueCommand?: string
	/** OpenCode alone supports session listing in-app. */
	sessionProvider: 'opencode' | 'none'
}

export function defaultAgentTools(): AgentTool[] {
	return [
		{
			id: 'opencode',
			name: 'OpenCode',
			label: 'OC',
			binary: 'opencode',
			command: 'opencode',
			continueCommand: 'opencode -c',
			sessionProvider: 'opencode',
		},
		{
			id: 'kilo',
			name: 'Kilo',
			label: 'KI',
			binary: 'kilo',
			command: 'kilo',
			sessionProvider: 'none',
		},
		{
			id: 'copilot',
			name: 'GitHub Copilot',
			label: 'CP',
			binary: 'copilot',
			command: 'copilot',
			sessionProvider: 'none',
		},
		{
			id: 'claude',
			name: 'Claude Code',
			label: 'CL',
			binary: 'claude',
			command: 'claude',
			sessionProvider: 'none',
		},
		{
			id: 'codex',
			name: 'Codex',
			label: 'CX',
			binary: 'codex',
			command: 'codex',
			sessionProvider: 'none',
		},
		{
			id: 'grok',
			name: 'Grok',
			label: 'GK',
			binary: 'grok',
			command: 'grok',
			sessionProvider: 'none',
		},
	]
}

export function resolveActiveAgent(
	tools: AgentTool[] | undefined,
	activeId: string | undefined,
): AgentTool {
	const list = tools?.length ? tools : defaultAgentTools()
	const id = activeId || 'opencode'
	return list.find(t => t.id === id) || list[0] || defaultAgentTools()[0]
}

/** Preset tab accent colors (Windows Terminal–style). */
export const TAB_COLORS = [
	'#e81123',
	'#ff8c00',
	'#fff100',
	'#16c60c',
	'#0078d7',
	'#886ce4',
	'#f7630c',
	'#00b7c3',
] as const
