#!/usr/bin/env node
// @involvex/term — installer + wt-style remote control for Involvex-Term.
import {spawn, spawnSync} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {Readable} from 'node:stream'
import {pipeline} from 'node:stream/promises'

const REPO = 'involvex/involvex-term'
const PKG = '@involvex/term'
const WIN = process.platform === 'win32'
const CONFIG_DIR = path.join(os.homedir(), '.involvex-term')
const CONFIG_FILE = path.join(CONFIG_DIR, 'cli.json')

const HELP = `involvex-term — Involvex-Term CLI

Usage:
  involvex-term install [--pm bun|npm] [--no-global]   Download the latest release
                                                       and install the global CLI
  involvex-term sp [-H|-V] [-d <dir>] [-p <profile>]   Split the focused pane
  involvex-term nt|st [-d <dir>] [-p <profile>]        Open a new tab
  involvex-term start                                  Launch the app
  involvex-term path                                   Print the resolved app path
  involvex-term --version | --help

Env: INVOLVEX_TERM_EXE overrides the app executable path.`

function readConfig() {
	try {
		return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
	} catch {
		return {}
	}
}

function writeConfig(cfg) {
	fs.mkdirSync(CONFIG_DIR, {recursive: true})
	fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

function defaultExeCandidates() {
	if (WIN) {
		const local =
			process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
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

function resolveExe() {
	const candidates = [
		process.env.INVOLVEX_TERM_EXE,
		readConfig().exe,
		...defaultExeCandidates(),
	].filter(Boolean)
	return candidates.find(p => fs.existsSync(p)) ?? null
}

function launch(exe, args) {
	const child = spawn(exe, args, {
		detached: true,
		stdio: 'ignore',
		windowsHide: false,
	})
	child.unref()
}

/** Make relative -d values absolute; the app runs in another cwd. */
function absolutizeArgs(args) {
	const out = [...args]
	for (let i = 1; i < out.length; i++) {
		if (out[i] === '-d' || out[i] === '--startingDirectory') {
			if (out[i + 1]) out[i + 1] = path.resolve(out[i + 1])
			i++
		}
	}
	if (!out.includes('-d') && !out.includes('--startingDirectory')) {
		out.push('-d', process.cwd())
	}
	return out
}

async function latestAsset() {
	const res = await fetch(
		`https://api.github.com/repos/${REPO}/releases/latest`,
		{
			headers: {
				accept: 'application/vnd.github+json',
				'user-agent': 'involvex-term-cli',
			},
		},
	)
	if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`)
	const rel = await res.json()
	const assets = rel.assets ?? []
	const pick = WIN
		? assets.find(a => /Windows.*Setup\.exe$/i.test(a.name))
		: assets.find(a => /\.AppImage$/i.test(a.name))
	if (!pick) {
		throw new Error(`No ${process.platform} asset in release ${rel.tag_name}`)
	}
	return {tag: rel.tag_name, name: pick.name, url: pick.browser_download_url}
}

async function download(url, dest) {
	const res = await fetch(url, {headers: {'user-agent': 'involvex-term-cli'}})
	if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`)
	await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest))
}

function has(cmd) {
	return (
		spawnSync(cmd, ['--version'], {stdio: 'ignore', shell: WIN}).status === 0
	)
}

function installGlobalCli(pm) {
	const choice = pm ?? (has('bun') ? 'bun' : 'npm')
	const args = choice === 'bun' ? ['add', '-g', PKG] : ['install', '-g', PKG]
	console.log(`> ${choice} ${args.join(' ')}`)
	const r = spawnSync(choice, args, {stdio: 'inherit', shell: WIN})
	if (r.status !== 0) {
		console.warn(
			`Global CLI install failed. Run manually: ${choice} ${args.join(' ')}`,
		)
	}
}

async function install(args) {
	const pmIdx = args.indexOf('--pm')
	const pm = pmIdx >= 0 ? args[pmIdx + 1] : undefined
	if (pm && pm !== 'bun' && pm !== 'npm')
		throw new Error('--pm must be bun or npm')

	const asset = await latestAsset()
	console.log(`Latest release ${asset.tag}: ${asset.name}`)
	const tmp = path.join(os.tmpdir(), asset.name)
	console.log('Downloading…')
	await download(asset.url, tmp)

	let exe
	if (WIN) {
		console.log('Running installer (silent)…')
		const r = spawnSync(tmp, ['/S'], {stdio: 'inherit'})
		if (r.status !== 0) throw new Error(`Installer exited with ${r.status}`)
		exe = defaultExeCandidates().find(p => fs.existsSync(p))
	} else {
		const dir = path.dirname(defaultExeCandidates()[0])
		fs.mkdirSync(dir, {recursive: true})
		exe = defaultExeCandidates()[0]
		fs.copyFileSync(tmp, exe)
		fs.chmodSync(exe, 0o755)
	}
	fs.rmSync(tmp, {force: true})
	if (!exe) {
		console.warn(
			'Installed, but the app path was not found. Set INVOLVEX_TERM_EXE.',
		)
	} else {
		writeConfig({...readConfig(), exe, version: asset.tag})
		console.log(`App: ${exe}`)
	}
	if (!args.includes('--no-global')) installGlobalCli(pm)
	console.log('Done. Try: involvex-term sp -d .')
}

async function main() {
	const [cmd, ...rest] = process.argv.slice(2)
	switch (cmd) {
		case undefined:
		case 'help':
		case '--help':
		case '-h':
			console.log(HELP)
			return
		case '--version':
		case '-v':
			console.log(createRequire(import.meta.url)('../package.json').version)
			return
		case 'install':
		case 'update':
			await install(rest)
			return
		case 'path':
			console.log(resolveExe() ?? '(not installed)')
			return
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

main().catch(e => {
	console.error(e instanceof Error ? e.message : e)
	process.exitCode = 1
})
