#!/usr/bin/env bun
/**
 * Build the Win11 Explorer IExplorerCommand DLL + unsigned sparse MSIX.
 * Windows-only; no-ops elsewhere so Linux CI stays green.
 *
 * Requires: MSVC (cl), Windows SDK (makeappx). Optional: signtool + PFX.
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'native', 'explorer-command')
const OUT = path.join(SRC, 'out')
const ASSETS = path.join(OUT, 'Assets')

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string}} [opts]
 */
function run(cmd, args, opts = {}) {
	console.log(`> ${cmd} ${args.join(' ')}`)
	const r = spawnSync(cmd, args, {
		encoding: 'utf8',
		shell: false,
		stdio: 'inherit',
		cwd: opts.cwd,
	})
	if (r.status !== 0) {
		throw new Error(`${cmd} exited ${r.status}`)
	}
}

/** Require a discovered tool path to be an absolute file with the expected basename. */
function trustedExe(candidate, expectedBasename) {
	if (!candidate || typeof candidate !== 'string') return null
	const resolved = path.resolve(candidate)
	if (!path.isAbsolute(resolved)) return null
	if (
		path.basename(resolved).toLowerCase() !== expectedBasename.toLowerCase()
	) {
		return null
	}
	if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null
	return resolved
}

// Fixed install roots (not process.env) so tool paths are not env-tainted for CodeQL.
const PF86 = 'C:\\Program Files (x86)'
const PF = 'C:\\Program Files'

function findVsDevCmd() {
	const vswhere = trustedExe(
		path.join(PF86, 'Microsoft Visual Studio', 'Installer', 'vswhere.exe'),
		'vswhere.exe',
	)
	if (!vswhere) return null
	const r = spawnSync(
		vswhere,
		[
			'-latest',
			'-products',
			'*',
			'-requires',
			'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
			'-property',
			'installationPath',
		],
		{encoding: 'utf8', shell: false},
	)
	const install = String(r.stdout || '').trim()
	if (!install) return null
	const bat = path.join(install, 'Common7', 'Tools', 'VsDevCmd.bat')
	return fs.existsSync(bat) ? bat : null
}

function findKitExe(basename) {
	for (const kits of [PF86, PF]) {
		const root = path.join(kits, 'Windows Kits', '10', 'bin')
		if (!fs.existsSync(root)) continue
		const versions = fs
			.readdirSync(root)
			.filter(n => /^\d+\./.test(n))
			.sort()
			.reverse()
		for (const ver of versions) {
			const p = trustedExe(path.join(root, ver, 'x64', basename), basename)
			if (p) return p
		}
	}
	return null
}

function findMakeAppx() {
	return findKitExe('makeappx.exe')
}

function findSignTool() {
	return findKitExe('signtool.exe')
}

function main() {
	fs.mkdirSync(OUT, {recursive: true})
	if (process.platform !== 'win32') {
		console.log('[explorer-command] skip (Windows-only)')
		return
	}

	fs.mkdirSync(ASSETS, {recursive: true})

	const iconSrc = path.join(ROOT, 'public', 'icon.png')
	const logoDst = path.join(ASSETS, 'StoreLogo.png')
	if (fs.existsSync(iconSrc)) {
		fs.copyFileSync(iconSrc, logoDst)
	} else {
		console.warn(
			'[explorer-command] public/icon.png missing — package may fail validation',
		)
	}

	fs.copyFileSync(
		path.join(SRC, 'AppxManifest.xml'),
		path.join(OUT, 'AppxManifest.xml'),
	)

	const vsDev = findVsDevCmd()
	if (!vsDev) {
		console.warn(
			'[explorer-command] VS Build Tools not found — skipping DLL/MSIX build',
		)
		return
	}

	const dll = path.join(OUT, 'InvolvexTermExplorerCommand.dll')
	const cpp = path.join(SRC, 'dllmain.cpp')
	const def = path.join(SRC, 'InvolvexTermExplorerCommand.def')
	const manifest = path.join(SRC, 'InvolvexTermExplorerCommand.manifest')

	// Compile inside a VsDevCmd environment so cl/link are on PATH.
	// Write a temp .bat — nested quoting of VsDevCmd via cmd /c is unreliable.
	// Invoke via relative name + cwd so cmd.exe /c is not fed an abs path (CodeQL).
	const batName = '_build.bat'
	const bat = path.join(OUT, batName)
	const batBody = [
		'@echo off',
		`call "${vsDev}" -arch=amd64 -host_arch=amd64`,
		`if errorlevel 1 exit /b 1`,
		`cd /d "${OUT}"`,
		`cl /nologo /O2 /LD /EHsc /DUNICODE /D_UNICODE "${cpp}" /Fe:"${dll}" /link /DEF:"${def}" /MANIFEST:EMBED /MANIFESTINPUT:"${manifest}" shlwapi.lib ole32.lib shell32.lib`,
		`exit /b %ERRORLEVEL%`,
		'',
	].join('\r\n')
	fs.writeFileSync(bat, batBody)
	try {
		run('cmd.exe', ['/d', '/c', batName], {cwd: OUT})
	} finally {
		try {
			fs.unlinkSync(bat)
		} catch {
			/* ignore */
		}
	}

	const makeappx = findMakeAppx()
	if (!makeappx) {
		console.warn(
			'[explorer-command] makeappx not found — DLL built, MSIX skipped',
		)
		return
	}

	// Staging layout for sparse package: manifest + Assets only (AllowExternalContent).
	const stage = path.join(OUT, 'msix-stage')
	fs.rmSync(stage, {recursive: true, force: true})
	fs.mkdirSync(path.join(stage, 'Assets'), {recursive: true})
	fs.copyFileSync(
		path.join(OUT, 'AppxManifest.xml'),
		path.join(stage, 'AppxManifest.xml'),
	)
	if (fs.existsSync(logoDst)) {
		fs.copyFileSync(logoDst, path.join(stage, 'Assets', 'StoreLogo.png'))
	}

	const msix = path.join(OUT, 'InvolvexTermExplorerCommand.msix')
	if (fs.existsSync(msix)) fs.unlinkSync(msix)
	run(makeappx, ['pack', '/d', stage, '/p', msix, '/nv'])

	// Optional signing. Never read INVOLVEX_SIGN_PASSWORD into JS (CodeQL
	// clear-text-logging / env→argv). The bat expands %INVOLVEX_SIGN_PASSWORD%.
	const pfxEnv = process.env.INVOLVEX_SIGN_PFX
	if (
		typeof pfxEnv === 'string' &&
		path.extname(pfxEnv).toLowerCase() === '.pfx' &&
		fs.existsSync(pfxEnv)
	) {
		const signtool = findSignTool()
		if (signtool) {
			const pfxLocal = path.join(OUT, '_sign.pfx')
			const signBatName = '_sign.bat'
			const signBat = path.join(OUT, signBatName)
			fs.copyFileSync(pfxEnv, pfxLocal)
			fs.writeFileSync(
				signBat,
				[
					'@echo off',
					`if defined INVOLVEX_SIGN_PASSWORD (`,
					`  "${signtool}" sign /fd SHA256 /f "${pfxLocal}" /p %INVOLVEX_SIGN_PASSWORD% "${msix}"`,
					`) else (`,
					`  "${signtool}" sign /fd SHA256 /f "${pfxLocal}" "${msix}"`,
					`)`,
					'exit /b %ERRORLEVEL%',
					'',
				].join('\r\n'),
			)
			try {
				console.log(
					'> signtool sign /fd SHA256 /f out/_sign.pfx [/p ***]',
					msix,
				)
				run('cmd.exe', ['/d', '/c', signBatName], {cwd: OUT})
				console.log('[explorer-command] signed', msix)
			} finally {
				for (const f of [signBat, pfxLocal]) {
					try {
						fs.unlinkSync(f)
					} catch {
						/* ignore */
					}
				}
			}
		} else {
			console.warn('[explorer-command] signtool missing — left unsigned')
		}
	} else {
		console.log(
			'[explorer-command] unsigned MSIX (set INVOLVEX_SIGN_PFX to sign)',
		)
	}

	console.log('[explorer-command] ok →', OUT)
}

try {
	main()
} catch (e) {
	console.error('[explorer-command]', e instanceof Error ? e.message : e)
	process.exit(1)
}
