/** Default CLI agents — keep in sync with src/lib/agents.ts defaults. */

export function defaultAgentTools() {
	return [
		{
			id: 'opencode',
			name: 'OpenCode',
			label: 'OC',
			binary: 'opencode',
			command: 'opencode',
			continueCommand: 'opencode -c',
			sessionProvider: 'opencode' as const,
		},
		{
			id: 'kilo',
			name: 'Kilo',
			label: 'KI',
			binary: 'kilo',
			command: 'kilo',
			sessionProvider: 'none' as const,
		},
		{
			id: 'copilot',
			name: 'GitHub Copilot',
			label: 'CP',
			binary: 'copilot',
			command: 'copilot',
			sessionProvider: 'none' as const,
		},
		{
			id: 'claude',
			name: 'Claude Code',
			label: 'CL',
			binary: 'claude',
			command: 'claude',
			sessionProvider: 'none' as const,
		},
		{
			id: 'codex',
			name: 'Codex',
			label: 'CX',
			binary: 'codex',
			command: 'codex',
			sessionProvider: 'none' as const,
		},
		{
			id: 'grok',
			name: 'Grok',
			label: 'GK',
			binary: 'grok',
			command: 'grok',
			sessionProvider: 'none' as const,
		},
	]
}
