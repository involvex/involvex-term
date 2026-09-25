/**
 * Point release/latest → release/<version>/win-unpacked (Windows junction).
 * Desktop shortcuts can target release/latest/involvex-term.exe and survive bumps.
 *
 * Usage: bun scripts/link-latest.mjs
 *        bun scripts/link-latest.mjs --desktop
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const RELEASE = path.join(ROOT, 'release')
const LATEST = path.join(RELEASE, 'latest')
const EXE_NAME = 'involvex-term.exe'

function packageVersion() {
	const pkg = JSON.parse(
		fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
	)
	return String(pkg.version)
}

function findUnpacked() {
	const preferred = path.join(RELEASE, packageVersion(), 'win-unpacked')
	if (fs.existsSync(path.join(preferred, EXE_NAME))) return preferred

	if (!fs.existsSync(RELEASE)) return null
	const versions = fs
		.readdirSync(RELEASE, {withFileTypes: true})
		.filter(d => d.isDirectory() && d.name !== 'latest')
		.map(d => d.name)
		.sort((a, b) => b.localeCompare(a, undefined, {numeric: true}))
	for (const v of versions) {
		const dir = path.join(RELEASE, v, 'win-unpacked')
		if (fs.existsSync(path.join(dir, EXE_NAME))) return dir
	}
	return null
}

function linkLatest(unpacked) {
	fs.mkdirSync(RELEASE, {recursive: true})
	try {
		if (fs.existsSync(LATEST) || fs.lstatSync(LATEST).isSymbolicLink()) {
			fs.rmSync(LATEST, {recursive: true, force: true})
		}
	} catch {
		try {
			fs.rmSync(LATEST, {recursive: true, force: true})
		} catch {
			/* noop */
		}
	}
	fs.symlinkSync(unpacked, LATEST, 'junction')
	console.log(`[link-latest] ${LATEST}`)
	console.log(`[link-latest]   → ${unpacked}`)
	return path.join(LATEST, EXE_NAME)
}

function writeDesktopShortcut(exePath) {
	const desktop = path.join(
		process.env.USERPROFILE || process.env.HOME || '',
		'Desktop',
	)
	const lnk = path.join(desktop, 'Involvex-Term.lnk')
	const icon = path.join(ROOT, 'public', 'icon.ico')
	const ps = `
$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${JSON.stringify(lnk)})
$s.TargetPath = ${JSON.stringify(exePath)}
$s.WorkingDirectory = ${JSON.stringify(path.dirname(exePath))}
$s.Description = 'involvex-term (release/latest)'
if (Test-Path -LiteralPath ${JSON.stringify(icon)}) { $s.IconLocation = ${JSON.stringify(icon)} }
$s.Save()
Write-Output ${JSON.stringify(lnk)}
`.trim()
	const r = spawnSync(
		'powershell.exe',
		['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
		{encoding: 'utf8'},
	)
	if (r.status !== 0) {
		console.error(
			'[link-latest] desktop shortcut failed:',
			r.stderr || r.stdout,
		)
		process.exitCode = 1
		return
	}
	console.log(`[link-latest] desktop → ${lnk.trim()}`)
}

const unpacked = findUnpacked()
if (!unpacked) {
	console.error(
		'[link-latest] no win-unpacked build found under release/*/win-unpacked/',
	)
	console.error('[link-latest] run: bun run build   then re-run this script')
	process.exit(1)
}

const exe = linkLatest(unpacked)
if (process.argv.includes('--desktop')) {
	writeDesktopShortcut(exe)
}
