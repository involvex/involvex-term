/** Named theme presets — Settings applies bg/fg/fontFamily (fontSize kept). */

export interface ThemePreset {
	id: string
	name: string
	bg: string
	fg: string
	fontFamily: string
}

export const THEME_PRESETS: ThemePreset[] = [
	{
		id: 'involvex',
		name: 'involvex dark',
		bg: '#1e1e1e',
		fg: '#cccccc',
		fontFamily: "'Cascadia Code', Consolas, monospace",
	},
	{
		id: 'vscode-dark-plus',
		name: 'VS Code Dark+',
		bg: '#1e1e1e',
		fg: '#d4d4d4',
		fontFamily: "'Cascadia Code', Consolas, monospace",
	},
	{
		id: 'one-dark',
		name: 'One Dark',
		bg: '#282c34',
		fg: '#abb2bf',
		fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
	},
	{
		id: 'dracula',
		name: 'Dracula',
		bg: '#282a36',
		fg: '#f8f8f2',
		fontFamily: "'Cascadia Code', Consolas, monospace",
	},
	{
		id: 'solarized-dark',
		name: 'Solarized Dark',
		bg: '#002b36',
		fg: '#839496',
		fontFamily: "'Cascadia Code', Consolas, monospace",
	},
]
