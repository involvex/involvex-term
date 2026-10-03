import react from '@vitejs/plugin-react'
import path from 'node:path'
import {defineConfig} from 'vite'
import electron from 'vite-plugin-electron/simple'

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		chunkSizeWarningLimit: 1000,
		sourcemap: false,
		// Electron runs a modern Chromium: skip legacy transpilation.
		target: 'chrome120',
		assetsInlineLimit: 4096,
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (
						id.includes('node_modules/react') ||
						id.includes('node_modules/react-dom')
					)
						return 'react'
					if (id.includes('@xterm')) return 'xterm'
				},
			},
		},
	},
	plugins: [
		react(),
		electron({
			main: {
				// Shortcut of `build.lib.entry`.
				entry: 'electron/main.ts',
				vite: {
					build: {
						rollupOptions: {
							// node-pty + git/chokidar are native / node-only, must stay external
							external: [
								'node-pty',
								'simple-git',
								'chokidar',
								'systeminformation',
								'electron',
								'electron-updater',
							],
						},
					},
				},
			},
			preload: {
				// Shortcut of `build.rollupOptions.input`.
				// Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
				input: path.join(__dirname, 'electron/preload.ts'),
			},
			// No renderer Node polyfill: the UI talks to main exclusively
			// through the typed `window.termApi` contextBridge (see
			// electron/preload.ts). Polyfilling fs/path/etc. into the
			// renderer only bloats the initial bundle + startup parse.
		}),
	],
})
