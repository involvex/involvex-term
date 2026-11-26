/**
 * Publish a built Store .msix as a Partner Center draft (--noCommit).
 * First-ever submission often still needs Partner Center for age ratings /
 * listing; this uploads the package into a draft when the API allows.
 *
 * Usage: bun scripts/publish-store.mjs [path-to.msix-or-dir]
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
let inputDir = outDir
if (input) {
	const st = fs.statSync(input)
	if (st.isDirectory()) inputDir = input
	else inputDir = path.dirname(input)
} else {
	const preferred = path.join(outDir, `involvex-term-${version}.msix`)
	if (!fs.existsSync(preferred)) {
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
	}
}

const appId = process.env.STORE_PRODUCT_ID
if (!appId) {
	console.error(
		'[publish-store] STORE_PRODUCT_ID unset — set it in store-identity.env',
	)
	process.exit(1)
}

// Pass the package directory as pathOrUrl so the Electron configurator does
// not run `npm install` in the repo root. Prefer a space-free .msix name.
const args = [
	'publish',
	inputDir,
	'--inputDirectory',
	inputDir,
	'--appId',
	appId,
	'--noCommit',
	'--priceId',
	'Free',
	'--uploadTimeout',
	'600',
]

console.log(
	'[publish-store]',
	'msstore',
	args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' '),
)
const r = spawnSync('msstore', args, {
	cwd: ROOT,
	stdio: 'inherit',
	shell: false,
	env: process.env,
	windowsVerbatimArguments: false,
})
if (r.error?.code === 'ENOENT') {
	console.error(
		'[publish-store] `msstore` not on PATH. Install Microsoft Store Developer CLI.',
	)
	process.exit(1)
}
process.exit(r.status ?? 1)
