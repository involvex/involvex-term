// Background app-update notifications for the CLI.
//
// The CLI upgrades from GitHub app releases (not the npm package stream),
// so update-notifier (npm-registry based, and broken when single-file
// bundled) is deliberately not used. Instead every invocation prints a
// cached nudge (if fresh) and refreshes the cache in a detached background
// process — zero latency on the sp/nt/start hot paths.
import {spawn} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = 'involvex/involvex-term'
const WIN = process.platform === 'win32'
const CONFIG_DIR = path.join(os.homedir(), '.involvex-term')
const CHECK_FILE = 'update-check.json'

/** At most one GitHub API check per day (per machine user). */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface Asset {
	tag: string
	name: string
	url: string
}

export interface UpdateCache {
	checkedAt: number
	tag: string | null
}

/**
 * CodeQL js/command-line-injection hardening (alert #3).
 * spawnSync(file, argsArray) runs without a shell, so `; & |` in a filename
 * are literal — but an unsanitized remote asset name still allows path
 * traversal out of os.tmpdir() (CWE-22) followed by write+exec. Hence the
 * basename + allowlist + containment checks below.
 */
const SAFE_ASSET_NAME = /^[A-Za-z0-9._-]+\.(exe|AppImage)$/i
const ALLOWED_ASSET_URL_PREFIXES = [
	'https://github.com/involvex/involvex-term/releases/download/',
	'https://objects.githubusercontent.com/',
	'https://api.github.com/repos/involvex/involvex-term/',
]

export function safeAssetName(
	name: string,
	platform: NodeJS.Platform = process.platform,
): string {
	const base = path.basename(name)
	if (!SAFE_ASSET_NAME.test(base)) throw new Error(`Unsafe asset name: ${name}`)
	if (platform === 'win32' && !/Windows.*Setup\.exe$/i.test(base)) {
		throw new Error(`Unexpected Windows asset name: ${name}`)
	}
	if (platform !== 'win32' && !/\.AppImage$/i.test(base)) {
		throw new Error(`Unexpected asset name: ${name}`)
	}
	return base
}

export function assertAllowedAssetUrl(url: string): void {
	if (!ALLOWED_ASSET_URL_PREFIXES.some(p => url.startsWith(p))) {
		throw new Error(`Unexpected asset URL origin: ${url}`)
	}
}

/** Numeric compare of v-prefixed semver-ish tags. */
export function isNewer(latest: string, current: string | undefined): boolean {
	if (!current) return true
	const n = (v: string) =>
		v
			.replace(/^v/, '')
			.split(/[.-]/)
			.map(x => parseInt(x, 10) || 0)
	const a = n(latest)
	const b = n(current)
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const d = (a[i] ?? 0) - (b[i] ?? 0)
		if (d !== 0) return d > 0
	}
	return false
}

export async function latestAsset(): Promise<Asset> {
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
	const rel = (await res.json()) as {
		tag_name: string
		assets?: Array<{name: string; browser_download_url: string}>
	}
	const assets = rel.assets ?? []
	const pick = WIN
		? assets.find(a => /Windows.*Setup\.exe$/i.test(a.name))
		: assets.find(a => /\.AppImage$/i.test(a.name))
	if (!pick) {
		throw new Error(`No ${process.platform} asset in release ${rel.tag_name}`)
	}
	if (typeof pick.name !== 'string' || !pick.name) {
		throw new Error(`Invalid asset name in release ${rel.tag_name}`)
	}
	assertAllowedAssetUrl(pick.browser_download_url)
	return {
		tag: rel.tag_name,
		name: safeAssetName(pick.name),
		url: pick.browser_download_url,
	}
}

export function updateCachePath(configDir: string = CONFIG_DIR): string {
	return path.join(configDir, CHECK_FILE)
}

export function readUpdateCache(
	configDir: string = CONFIG_DIR,
): UpdateCache | null {
	try {
		const raw = JSON.parse(
			fs.readFileSync(updateCachePath(configDir), 'utf8'),
		) as Partial<UpdateCache>
		if (typeof raw.checkedAt !== 'number') return null
		return {
			checkedAt: raw.checkedAt,
			tag: typeof raw.tag === 'string' ? raw.tag : null,
		}
	} catch {
		return null
	}
}

export function writeUpdateCache(
	cache: UpdateCache,
	configDir: string = CONFIG_DIR,
): void {
	fs.mkdirSync(configDir, {recursive: true})
	fs.writeFileSync(updateCachePath(configDir), JSON.stringify(cache))
}

export function isCacheFresh(
	cache: UpdateCache | null,
	now: number = Date.now(),
): boolean {
	return cache !== null && now - cache.checkedAt < UPDATE_CHECK_INTERVAL_MS
}

export function formatNudge(
	cachedTag: string,
	current: string | undefined,
): string {
	return `Update available: ${cachedTag} (current ${current ?? 'unknown'}) — run 'involvex-term upgrade'.`
}

export interface RefreshDeps {
	fetchLatest?: () => Promise<Asset>
}

/** Hidden `__check-update` worker: refresh the cache, failures stay quiet. */
export async function refreshUpdateCache(
	configDir: string = CONFIG_DIR,
	now: number = Date.now(),
	deps: RefreshDeps = {},
): Promise<void> {
	const fetchLatest = deps.fetchLatest ?? latestAsset
	try {
		const asset = await fetchLatest()
		writeUpdateCache({checkedAt: now, tag: asset.tag}, configDir)
	} catch {
		// Offline / rate-limited: still bump checkedAt so one failure does
		// not retry on every invocation — backoff stays at the daily cadence.
		try {
			writeUpdateCache({checkedAt: now, tag: null}, configDir)
		} catch {
			/* config dir unwritable — stay silent */
		}
	}
}

export interface NotifyDeps extends RefreshDeps {
	kick?: (entry: string) => void
	onNudge?: (msg: string) => void
}

export interface NotifyOpts {
	configDir?: string
	currentVersion?: string
	/** CLI entry path for the detached refresh worker (process.argv[1]). */
	entry?: string
	env?: NodeJS.ProcessEnv
	argv?: string[]
	isTTY?: boolean
	now?: number
	deps?: NotifyDeps
}

function kickRefresh(entry: string): void {
	try {
		spawn(process.execPath, [entry, '__check-update'], {
			detached: true,
			stdio: 'ignore',
		}).unref()
	} catch {
		/* background check is best-effort */
	}
}

/**
 * Print a cached update nudge (stderr, so stdout stays script-clean) and
 * kick a detached refresh when the cache is stale. Never throws, never
 * blocks: all IO is guarded and the network check runs out-of-process.
 */
export async function maybeNotifyUpdate(opts: NotifyOpts = {}): Promise<void> {
	const {
		configDir = CONFIG_DIR,
		currentVersion,
		entry = process.argv[1] ?? '',
		env = process.env,
		argv = process.argv.slice(2),
		isTTY = process.stdout.isTTY ?? false,
		now = Date.now(),
		deps = {},
	} = opts
	if (env['NO_UPDATE_NOTIFIER'] || argv.includes('--no-update-notifier')) {
		return
	}
	if (env['CI']) return
	const kick = deps.kick ?? kickRefresh
	const onNudge = deps.onNudge ?? ((msg: string) => console.error(msg))
	const cache = readUpdateCache(configDir)
	if (isTTY && cache?.tag && isNewer(cache.tag, currentVersion)) {
		try {
			onNudge(formatNudge(cache.tag, currentVersion))
		} catch {
			/* nudges must never break the command */
		}
	}
	if ((!cache || !isCacheFresh(cache, now)) && entry) {
		try {
			kick(entry)
		} catch {
			/* best-effort */
		}
	}
}
