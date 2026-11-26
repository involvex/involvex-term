/**
 * Run Windows App Certification Kit against the Store MSIX.
 * Usage: bun scripts/run-wack.mjs [path-to.msix]
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const appcert =
	'C:\\Program Files (x86)\\Windows Kits\\10\\App Certification Kit\\appcert.exe'

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const version = pkg.version
const outDir = path.join(ROOT, 'release', version)
let msix = process.argv[2]
if (!msix) {
	const hits = fs.existsSync(outDir)
		? fs
				.readdirSync(outDir)
				.filter(n => n.toLowerCase().endsWith('.msix'))
				.map(n => path.join(outDir, n))
		: []
	if (!hits.length) {
		console.error('[wack] no .msix — run bun run build:store first')
		process.exit(1)
	}
	msix = hits.sort().at(-1)
}

const reportDir = path.join(outDir, 'wack-report')
fs.mkdirSync(reportDir, {recursive: true})
const report = path.join(reportDir, 'report.xml')

if (!fs.existsSync(appcert)) {
	console.error('[wack] appcert.exe not found:', appcert)
	process.exit(1)
}

console.log('[wack] reset')
spawnSync(appcert, ['reset'], {stdio: 'inherit'})
console.log('[wack] test', msix)
const r = spawnSync(
	appcert,
	['test', '-appxpackagepath', msix, '-reportoutputpath', report],
	{stdio: 'inherit'},
)
console.log('[wack] report', report)
process.exit(r.status ?? 1)
