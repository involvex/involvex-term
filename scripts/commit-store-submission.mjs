/**
 * Re-commit the Partner Center draft after IARC age ratings are set in the UI.
 * Usage: bun scripts/commit-store-submission.mjs
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return
	for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
		const t = line.trim()
		if (!t || t.startsWith('#')) continue
		const eq = t.indexOf('=')
		if (eq < 1) continue
		const key = t.slice(0, eq).trim()
		let val = t.slice(eq + 1).trim()
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		) {
			val = val.slice(1, -1)
		}
		if (!process.env[key]) process.env[key] = val
	}
}

loadEnvFile(path.join(ROOT, 'store-identity.env'))
const appId = process.env.STORE_PRODUCT_ID
if (!appId) {
	console.error('[commit-store] STORE_PRODUCT_ID unset')
	process.exit(1)
}

console.log('[commit-store] msstore submission publish', appId)
const r = spawnSync('msstore', ['submission', 'publish', appId], {
	cwd: ROOT,
	stdio: 'inherit',
	shell: false,
	env: process.env,
})
if (r.error?.code === 'ENOENT') {
	console.error('[commit-store] msstore not on PATH')
	process.exit(1)
}
process.exit(r.status ?? 1)
