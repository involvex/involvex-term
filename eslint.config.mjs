// ESLint 10 flat config. Run: bun run lint
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	{
		ignores: [
			'dist/**',
			'dist-electron/**',
			'release/**',
			'build/**',
			'packages/*/dist/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	reactHooks.configs.flat.recommended,
	{
		files: ['src/**/*.{ts,tsx}'],
		languageOptions: {globals: globals.browser},
		plugins: {'react-refresh': reactRefresh},
		rules: {
			'react-refresh/only-export-components': [
				'warn',
				{allowConstantExport: true},
			],
		},
	},
	{
		files: ['electron/**/*.ts', 'scripts/**/*.mjs', 'packages/**/src/*.ts'],
		languageOptions: {globals: globals.node},
	},
)
