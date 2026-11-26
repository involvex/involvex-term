/**
 * Publish a built Store .msix as a Partner Center draft (--noCommit).
 * First-ever submission must still be completed in Partner Center UI.
 *
 * Usage: bun scripts/publish-store.mjs [path-to.msix]
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return
	const text = fs.readFileSync(filePath, 'utf8')
	for (const line of text.split(/\r?\n/)) {
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

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = pkg.version
const outDir = path.join(ROOT, 'release', version)

let input = process.argv[2]
if (!input) {
	const candidates = fs.existsSync(outDir)
		? fs
				.readdirSync(outDir)
				.filter(n => n.toLowerCase().endsWith('.msix'))
				.map(n => path.join(outDir, n))
		: []
	if (candidates.length === 0) {
		console.error(
			'[publish-store] No .msix found. Run `bun run build:store` first, or pass a path.',
		)
		process.exit(1)
	}
	input = candidates.sort().at(-1)
}

const args = ['publish', input, '--noCommit']
const appId = process.env.STORE_PRODUCT_ID
if (appId) {
	args.push('--appId', appId)
}

console.log('[publish-store]', 'msstore', args.join(' '))
const r = spawnSync('msstore', args, {
	cwd: ROOT,
	stdio: 'inherit',
	shell: true,
	env: process.env,
})
if (r.error?.code === 'ENOENT') {
	console.error(
		'[publish-store] `msstore` not on PATH. Install Microsoft Store Developer CLI.',
	)
	process.exit(1)
}
process.exit(r.status ?? 1)
