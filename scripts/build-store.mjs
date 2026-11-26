/**
 * Build the Microsoft Store APPX channel and rename to .msix for msstore.
 *
 * Loads store-identity.env (gitignored) if present, then requires
 * STORE_IDENTITY_NAME / STORE_PUBLISHER / STORE_PUBLISHER_DISPLAY_NAME.
 * Placeholder defaults allow a dry packaging smoke test; Partner Center
 * rejects a mismatched publisher — replace before real submission.
 *
 * Usage: bun scripts/build-store.mjs
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

const PLACEHOLDERS = {
	STORE_IDENTITY_NAME: 'involvex.InvolvexTerm',
	STORE_PUBLISHER: 'CN=00000000-0000-0000-0000-000000000000',
	STORE_PUBLISHER_DISPLAY_NAME: 'involvex',
}

for (const [k, v] of Object.entries(PLACEHOLDERS)) {
	if (!process.env[k]) {
		process.env[k] = v
		console.warn(`[build-store] ${k} unset — using placeholder ${v}`)
	}
}

if (process.env.STORE_PUBLISHER === PLACEHOLDERS.STORE_PUBLISHER) {
	console.warn(
		'[build-store] Using placeholder publisher CN. Replace via store-identity.env before Partner Center upload (docs/STORE.md).',
	)
}

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {
		cwd: ROOT,
		stdio: 'inherit',
		shell: false,
		env: process.env,
		...opts,
	})
	if (r.error) {
		console.error(`[build-store] failed to launch ${cmd}:`, r.error.message)
		process.exit(1)
	}
	if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = pkg.version

console.log('[build-store] typecheck + vite build…')
run('bun', ['x', 'tsc', '--noEmit'])
run('bun', ['x', 'vite', 'build'])
console.log('[build-store] rebuild node-pty (stages conpty.dll)…')
run('bun', ['scripts/rebuild-pty.mjs'])

// Ensure Store logos exist
run('bun', ['scripts/generate-store-assets.mjs'])

console.log('[build-store] electron-builder appx…')
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'

// electron-builder does not reliably expand ${env.*} in json5 — write a
// resolved config with Partner Center identity substituted.
const template = fs.readFileSync(
	path.join(ROOT, 'electron-builder.store.json5'),
	'utf8',
)
const resolved = template
	.replaceAll('__STORE_IDENTITY_NAME__', process.env.STORE_IDENTITY_NAME)
	.replaceAll('__STORE_PUBLISHER__', process.env.STORE_PUBLISHER)
	.replaceAll(
		'__STORE_PUBLISHER_DISPLAY_NAME__',
		process.env.STORE_PUBLISHER_DISPLAY_NAME,
	)
const resolvedPath = path.join(ROOT, 'release', '.electron-builder.store.json5')
fs.mkdirSync(path.dirname(resolvedPath), {recursive: true})
fs.writeFileSync(resolvedPath, resolved)

run('bun', [
	'x',
	'electron-builder',
	'--config',
	resolvedPath,
	'--win',
	'appx',
	'--x64',
	'--publish',
	'never',
])

const outDir = path.join(ROOT, 'release', version)
let appxFiles = []
try {
	appxFiles = fs
		.readdirSync(outDir)
		.filter(n => n.toLowerCase().endsWith('.appx'))
		.map(n => path.join(outDir, n))
} catch (e) {
	console.error('[build-store] no release dir:', outDir, e.message)
	process.exit(1)
}

if (appxFiles.length === 0) {
	console.error('[build-store] no .appx produced in', outDir)
	process.exit(1)
}

for (const appx of appxFiles) {
	const msix = appx.replace(/\.appx$/i, '.msix')
	fs.copyFileSync(appx, msix)
	console.log('[build-store] wrote', msix)
}

console.log(
	'[build-store] done. Upload the .msix via Partner Center (first publish) or `bun run publish:store`.',
)
