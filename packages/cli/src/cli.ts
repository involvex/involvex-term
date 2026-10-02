#!/usr/bin/env node
// @involvex/term — installer + wt-style remote control for Involvex-Term.
// Authored for Bun, bundled with `bun build --target node` for npm consumers.
import {spawn, spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import pkg from '../package.json' with {type: 'json'}
import {
	assertAllowedAssetUrl,
	isNewer,
	latestAsset,
	maybeNotifyUpdate,
	refreshUpdateCache,
	safeAssetName,
	type Asset,
} from './updateCheck.js'

const PKG = '@involvex/term'
const WIN = process.platform === 'win32'
const CONFIG_DIR = path.join(os.homedir(), '.involvex-term')
const CONFIG_FILE = path.join(CONFIG_DIR, 'cli.json')

interface Config {
	exe?: string
	version?: string
}

/** Resolve a temp path that is guaranteed to stay inside os.tmpdir(). */
function resolveAssetTempPath(name: string): string {
	const safe = safeAssetName(name)
	const tmpDir = path.resolve(os.tmpdir())
	const tmp = path.resolve(tmpDir, safe)
	if (tmp !== tmpDir && !tmp.startsWith(tmpDir + path.sep)) {
		throw new Error(`Asset path escapes temp dir: ${name}`)
	}
	return tmp
}

const HELP = `involvex-term ${pkg.version} — Involvex-Term CLI

Usage:
  involvex-term install [--pm bun|npm] [--no-global]   Download the latest release
                                                       and install the global CLI
  involvex-term upgrade [--force] [--pm bun|npm]       Install the latest release if newer
  involvex-term uninstall [--keep-cli]                 Remove the app (and the global CLI)
  involvex-term sp [-H|-V] [-d <dir>] [-p <profile>]   Split the focused pane
  involvex-term nt|st [-d <dir>] [-p <profile>]        Open a new tab
  involvex-term start                                  Launch the app
  involvex-term path                                   Print the resolved app path
  involvex-term context-menu install|uninstall|status  Manage Explorer "Open in involvex-term" (Windows)
  involvex-term doctor [--fix] [--json] [--verbose]    Check for common issues
  involvex-term --version | --help

Env: INVOLVEX_TERM_EXE overrides the app executable path.
  Set NO_UPDATE_NOTIFIER=1 (or pass --no-update-notifier) to silence the
  background update nudge (checked at most once a day).`

function readConfig(): Config {
	try {
		return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Config
	} catch {
		return {}
	}
}

function writeConfig(cfg: Config): void {
	fs.mkdirSync(CONFIG_DIR, {recursive: true})
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

function defaultExeCandidates(): string[] {
	if (WIN) {
		const local =
			process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local')
		return [
			path.join(local, 'Programs', 'involvex-term', 'involvex-term.exe'),
			path.join(local, 'Programs', 'Involvex-Term', 'involvex-term.exe'),
		]
	}
	return [
		path.join(
			os.homedir(),
			'.local',
			'share',
			'involvex-term',
			'involvex-term.AppImage',
		),
	]
}

function resolveExe(): string | null {
	const candidates = [
		process.env['INVOLVEX_TERM_EXE'],
		readConfig().exe,
		...defaultExeCandidates(),
	].filter((p): p is string => Boolean(p))
	return candidates.find(p => fs.existsSync(p)) ?? null
}

function launch(exe: string, args: string[]): void {
	spawn(exe, args, {detached: true, stdio: 'ignore'}).unref()
}

/** Make relative -d values absolute; the app runs in another cwd. */
function absolutizeArgs(args: string[]): string[] {
	const out = [...args]
	for (let i = 1; i < out.length; i++) {
		if (out[i] === '-d' || out[i] === '--startingDirectory') {
			const next = out[i + 1]
			if (next) out[i + 1] = path.resolve(next)
			i++
		}
	}
	if (!out.includes('-d') && !out.includes('--startingDirectory')) {
		out.push('-d', process.cwd())
	}
	return out
}

async function download(url: string, dest: string): Promise<void> {
	assertAllowedAssetUrl(url)
	const res = await fetch(url, {headers: {'user-agent': 'involvex-term-cli'}})
	if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`)
	await pipeline(
		Readable.fromWeb(res.body as never),
		fs.createWriteStream(dest),
	)
}

function has(cmd: string): boolean {
	// shell:WIN only to resolve .cmd shims on Windows; cmd is always the
	// constant 'bun'|'npm' (never user input), args are constant.
	return (
		spawnSync(cmd, ['--version'], {stdio: 'ignore', shell: WIN}).status === 0
	)
}

function parsePm(args: string[]): 'bun' | 'npm' | undefined {
	const i = args.indexOf('--pm')
	const pm = i >= 0 ? args[i + 1] : undefined
	if (pm && pm !== 'bun' && pm !== 'npm') {
		throw new Error('--pm must be bun or npm')
	}
	return pm as 'bun' | 'npm' | undefined
}

function runPm(pm: 'bun' | 'npm', kind: 'add' | 'remove'): void {
	const args =
		pm === 'bun'
			? [kind, '-g', PKG]
			: [kind === 'add' ? 'install' : 'uninstall', '-g', PKG]
	console.log(`> ${pm} ${args.join(' ')}`)
	// pm is allowlisted to 'bun'|'npm' by parsePm, args are constants.
	const r = spawnSync(pm, args, {stdio: 'inherit', shell: WIN})
	if (r.status !== 0) {
		console.warn(`Failed. Run manually: ${pm} ${args.join(' ')}`)
	}
}

async function installApp(asset: Asset): Promise<void> {
	console.log(`Latest release ${asset.tag}: ${asset.name}`)
	assertAllowedAssetUrl(asset.url)
	const tmp = resolveAssetTempPath(asset.name)
	console.log('Downloading…')
	await download(asset.url, tmp)

	let exe: string | undefined
	if (WIN) {
		console.log('Running installer (silent)…')
		// Array form + shell:false: no cmd.exe metacharacter interpretation.
		const r = spawnSync(tmp, ['/S'], {stdio: 'inherit', shell: false})
		if (r.status !== 0) throw new Error(`Installer exited with ${r.status}`)
		exe = defaultExeCandidates().find(p => fs.existsSync(p))
	} else {
		exe = defaultExeCandidates()[0]!
		fs.mkdirSync(path.dirname(exe), {recursive: true})
		fs.copyFileSync(tmp, exe)
		fs.chmodSync(exe, 0o755)
	}
	fs.rmSync(tmp, {force: true})
	if (exe) {
		writeConfig({...readConfig(), exe, version: asset.tag})
		console.log(`App: ${exe}`)
	} else {
		console.warn(
			'Installed, but the app path was not found. Set INVOLVEX_TERM_EXE.',
		)
	}
}

async function install(args: string[]): Promise<void> {
	const pm = parsePm(args)
	await installApp(await latestAsset())
	if (!args.includes('--no-global')) {
		runPm(pm ?? (has('bun') ? 'bun' : 'npm'), 'add')
	}
	console.log('Done. Try: involvex-term sp -d .')
}

async function upgrade(args: string[]): Promise<void> {
	const asset = await latestAsset()
	const current = readConfig().version
	if (!args.includes('--force') && !isNewer(asset.tag, current)) {
		console.log(`Already up to date (${current}).`)
		return
	}
	console.log(`Upgrading ${current ?? '(unknown)'} → ${asset.tag}`)
	await installApp(asset)
	runPm(parsePm(args) ?? (has('bun') ? 'bun' : 'npm'), 'add')
}

function uninstall(args: string[]): void {
	const exe = resolveExe()
	if (exe && WIN) {
		const dir = path.dirname(exe)
		const un = fs.readdirSync(dir).find(f => /^uninstall.*\.exe$/i.test(f))
		if (un) {
			console.log('Running uninstaller (silent)…')
			// Basename + containment: dir listing must not escape the app dir.
			const unPath = path.resolve(dir, path.basename(un))
			if (unPath !== dir && !unPath.startsWith(dir + path.sep)) {
				throw new Error(`Uninstaller path escapes app dir: ${un}`)
			}
			// `_?=dir` keeps the uninstaller in place so we can wait for it.
			spawnSync(unPath, ['/S', `_?=${dir}`], {stdio: 'inherit', shell: false})
			fs.rmSync(dir, {recursive: true, force: true})
		} else {
			console.warn(`No uninstaller found in ${dir}; remove it manually.`)
		}
	} else if (exe) {
		fs.rmSync(path.dirname(exe), {recursive: true, force: true})
		console.log(`Removed ${path.dirname(exe)}`)
	} else {
		console.log('App not found; nothing to remove.')
	}
	fs.rmSync(CONFIG_FILE, {force: true})
	if (!args.includes('--keep-cli')) {
		runPm(parsePm(args) ?? (has('bun') ? 'bun' : 'npm'), 'remove')
	}
	console.log('Settings in ~/.involvex-term/settings.json were kept.')
}

async function main(): Promise<void> {
	const [cmd, ...rest] = process.argv.slice(2)
	// Detached cache-refresh worker (spawned by maybeNotifyUpdate).
	if (cmd === '__check-update') {
		await refreshUpdateCache()
		return
	}
	await maybeNotifyUpdate({currentVersion: readConfig().version})
	switch (cmd) {
		case undefined:
		case 'help':
		case '--help':
		case '-h':
			console.log(HELP)
			return
		case '--version':
		case '-v':
			console.log(pkg.version)
			return
		case 'install':
			await install(rest)
			return
		case 'upgrade':
		case 'update':
			await upgrade(rest)
			return
		case 'uninstall':
			uninstall(rest)
			return
		case 'path':
			console.log(resolveExe() ?? '(not installed)')
			return
		case 'context-menu': {
			const {install, uninstall, getStatus} = await import('./contextMenu.js')
			const sub = rest[0]
			if (sub === 'status') {
				const st = getStatus(resolveExe())
				if (!st.supported) {
					console.log('Explorer context menu: unsupported (Windows-only)')
					return
				}
				console.log(st.installed ? 'installed' : 'not installed')
				for (const r of st.roots) {
					console.log(
						`  ${r.installed ? '✓' : '✗'} ${r.key}${r.command ? '' : ' (missing)'}`,
					)
				}
				if (!st.installed) process.exitCode = 1
				return
			}
			if (sub === 'install') {
				const exe = resolveExe()
				if (!exe) {
					console.error(
						'Involvex-Term is not installed. Run: bunx @involvex/term install',
					)
					process.exitCode = 1
					return
				}
				install(exe)
				console.log(
					'Explorer context menu installed (folder · background · drive).',
				)
				console.log('On Windows 11 it appears under “Show more options”.')
				return
			}
			if (sub === 'uninstall') {
				uninstall()
				console.log('Explorer context menu removed.')
				return
			}
			console.error(`Unknown context-menu command: ${sub ?? ''}\n\n${HELP}`)
			process.exitCode = 1
			return
		}
		case 'doctor': {
			const {runDoctor, formatDoctor, doctorFailed} =
				await import('./doctor.js')
			const {getStatus} = await import('./contextMenu.js')
			const fix = rest.includes('--fix')
			const json = rest.includes('--json')
			const verbose = rest.includes('--verbose')
			const checks = await runDoctor(
				{fix, verbose},
				{
					resolveExe,
					readConfig,
					writeConfig,
					contextMenuStatus: () => {
						const st = getStatus(resolveExe())
						return st.supported
							? {supported: true, installed: st.installed}
							: null
					},
				},
			)
			if (json) {
				console.log(JSON.stringify({version: pkg.version, checks}, null, 2))
			} else {
				console.log(formatDoctor(checks, verbose))
			}
			if (doctorFailed(checks)) process.exitCode = 1
			return
		}
	}
	const exe = resolveExe()
	if (!exe) {
		console.error(
			'Involvex-Term is not installed. Run: bunx @involvex/term install',
		)
		process.exitCode = 1
		return
	}
	if (cmd === 'start') launch(exe, [])
	else if (['sp', 'split-pane', 'nt', 'st', 'new-tab'].includes(cmd)) {
		launch(exe, absolutizeArgs([cmd, ...rest]))
	} else {
		console.error(`Unknown command: ${cmd}\n\n${HELP}`)
		process.exitCode = 1
	}
}

main().catch((e: unknown) => {
	console.error(e instanceof Error ? e.message : e)
	process.exitCode = 1
})
