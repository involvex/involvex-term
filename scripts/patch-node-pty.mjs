// Idempotent: strips `SpectreMitigation` from node-pty's binding.gyp.
// Background: node-pty sets SpectreMitigation=Spectre for its official
// prebuilds. node-gyp 9 ignored the unknown attribute (warning only), but
// node-gyp 10 honors it -> MSBuild MSB8040 unless the multi-GB
// "Spectre-mitigated libraries" VS workload is installed. Dropping the flag
// restores the previous effective behavior for local dev builds.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const gypFiles = [
	path.join(__dirname, '..', 'node_modules', 'node-pty', 'binding.gyp'),
	path.join(
		__dirname,
		'..',
		'node_modules',
		'node-pty',
		'deps',
		'winpty',
		'src',
		'winpty.gyp',
	),
]

let patched = 0
for (const gypPath of gypFiles) {
	if (!fs.existsSync(gypPath)) {
		console.log(`[patch-node-pty] missing, skipping: ${gypPath}`)
		continue
	}
	const src = fs.readFileSync(gypPath, 'utf8')
	const lines = src.split(/\r?\n/)
	const kept = lines.filter(l => !/SpectreMitigation/.test(l))
	if (kept.length !== lines.length) {
		fs.writeFileSync(gypPath, kept.join('\n'))
		patched++
		console.log(`[patch-node-pty] patched: ${gypPath}`)
	}
}
console.log(
	patched === 0
		? '[patch-node-pty] already patched, nothing to do.'
		: `[patch-node-pty] patched ${patched} file(s).`,
)
