/**
 * Cut a release: bump version, update CHANGELOG, commit, tag, push,
 * and create the GitHub release.
 *
 * The tag push triggers `.github/workflows/release.yml`, which builds the
 * Windows NSIS + Linux AppImage artifacts and attaches them to the release —
 * this script never builds or uploads artifacts itself. Release notes are
 * owned here (`gh release create` / `edit`); CI uploads binaries only.
 *
 * Usage:
 *   bun run release -- --bump patch|minor|major  (default: patch)
 *   bun run release -- --version 0.6.0           (explicit, wins over --bump)
 *   bun run release -- --dry-run                 (print plan, change nothing)
 *   bun run release -- --no-push                 (commit + tag locally only)
 *   bun run release -- --yes                     (skip confirm prompt)
 */
import {spawnSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PKG_PATH = path.join(ROOT, 'package.json')
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md')

function usage() {
	console.log(
		[
			'Usage: bun scripts/release.mjs [options]',
			'',
			'  --bump patch|minor|major  semver bump off package.json (default: patch)',
			'  --version X.Y.Z           explicit target version (wins over --bump)',
			'  --dry-run                 print the plan, change nothing',
			'  --no-push                 commit + tag locally, skip push/gh release',
			'  --force-empty             allow a release with no new commits since last tag',
			'  --yes                     skip the confirm prompt',
			'  --help                    print this help',
			'',
			'Examples:',
			'  bun run release -- --dry-run',
			'  bun run release -- --bump minor',
			'  bun run release -- --version 0.5.0',
		].join('\n'),
	)
}

function fail(msg) {
	console.error(`[release] ${msg}`)
	process.exit(1)
}

/** Run a command, return trimmed stdout. Throws (with stderr) on failure. */
function run(bin, args, opts = {}) {
	const r = spawnSync(bin, args, {
		cwd: ROOT,
		encoding: 'utf8',
		...opts,
	})
	if (r.status !== 0) {
		fail(
			`command failed: ${bin} ${args.join(' ')}\n${(r.stderr || r.stdout || '').trim()}`,
		)
	}
	return (r.stdout || '').trim()
}

/** Parse argv into options. */
function parseArgs(argv) {
	const opts = {
		bump: 'patch',
		version: null,
		dryRun: false,
		noPush: false,
		yes: false,
		help: false,
		forceEmpty: false,
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--dry-run') opts.dryRun = true
		else if (arg === '--no-push') opts.noPush = true
		else if (arg === '--force-empty') opts.forceEmpty = true
		else if (arg === '--yes' || arg === '-y') opts.yes = true
		else if (arg === '--help' || arg === '-h') opts.help = true
		else if (arg.startsWith('--bump=')) opts.bump = arg.slice('--bump='.length)
		else if (arg.startsWith('--version='))
			opts.version = arg.slice('--version='.length)
		else if (arg === '--bump' || arg === '--version') {
			const value = argv[i + 1]
			if (!value || value.startsWith('--')) fail(`missing value for ${arg}`)
			if (arg === '--bump') opts.bump = value
			else opts.version = value
			i++ // consume value
		} else if (arg.startsWith('--')) fail(`unknown flag: ${arg}`)
		else fail(`unexpected argument: ${arg} (see --help)`)
	}
	if (!['patch', 'minor', 'major'].includes(opts.bump)) {
		fail(`invalid --bump: ${opts.bump} (expected patch|minor|major)`)
	}
	if (opts.version && !/^\d+\.\d+\.\d+$/.test(opts.version)) {
		fail(`invalid --version: ${opts.version} (expected X.Y.Z)`)
	}
	return opts
}

function bumpVersion(current, bump) {
	const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/)
	if (!m) fail(`current version is not semver: ${current}`)
	let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
	if (bump === 'major') return `${major + 1}.0.0`
	if (bump === 'minor') return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

function today() {
	return new Date().toISOString().slice(0, 10)
}

/** Most recent tag (e.g. v0.1.0), or null when no tags exist yet. */
function lastTag() {
	const r = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
		cwd: ROOT,
		encoding: 'utf8',
	})
	if (r.status !== 0) return null
	return (r.stdout || '').trim() || null
}

/** Commit subjects since <ref> (excluding release commits + merges). */
function commitsSince(ref) {
	const range = ref ? `${ref}..HEAD` : 'HEAD'
	const out = run('git', ['log', range, '--format=%s', '--no-merges'])
	return out
		.split('\n')
		.map(s => s.trim())
		.filter(Boolean)
		.filter(s => !/^chore\(release\):/.test(s))
}

function groupCommits(subjects) {
	const added = []
	const fixed = []
	const changed = []
	for (const s of subjects) {
		const m = s.match(/^(\w+)(\(.*\))?:\s*(.+)$/)
		const type = m ? m[1].toLowerCase() : ''
		const text = m ? m[3] : s
		if (type === 'feat') added.push(text)
		else if (type === 'fix') fixed.push(text)
		else changed.push(s)
	}
	return {added, fixed, changed}
}

/**
 * Rewrite the CHANGELOG head for <version>.
 * - Head `## [<any>] - Unreleased` section (through the next `## [` or EOF)
 *   is replaced with a clean `## [<version>] - <date>` section.
 * - Otherwise a fresh dated section is inserted after `# Changelog`.
 * Returns {updated, notes} where notes is the released section (for gh).
 */
function buildChangelog(current, version, groups) {
	const date = today()
	const header = `## [${version}] - ${date}`
	const sections = []
	if (groups.added.length) {
		sections.push(`### Added\n\n${groups.added.map(t => `- ${t}`).join('\n')}`)
	}
	if (groups.fixed.length) {
		sections.push(`### Fixed\n\n${groups.fixed.map(t => `- ${t}`).join('\n')}`)
	}
	if (groups.changed.length) {
		sections.push(
			`### Changed\n\n${groups.changed.map(t => `- ${t}`).join('\n')}`,
		)
	}
	const body = sections.length ? `\n\n${sections.join('\n\n')}` : ''
	const notes = `${header}${body}`

	const unreleasedRe = /^## \[[^\]]+\] - Unreleased\s*\n[\s\S]*?(?=\n## \[|$)/m
	if (unreleasedRe.test(current)) {
		const updated = current.replace(unreleasedRe, () => `${notes}\n\n`)
		return {updated, notes}
	}
	const anchor = '# Changelog'
	if (!current.includes(anchor))
		fail('CHANGELOG.md has no "# Changelog" header')
	const updated = current.replace(
		anchor,
		() => `${anchor}\n\n${notes || header}`,
	)
	return {updated, notes}
}

async function confirm(prompt) {
	if (process.env.CI) return false
	process.stdout.write(prompt)
	const rl = (await import('node:readline')).createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	return new Promise(resolve => {
		rl.question('', answer => {
			rl.close()
			resolve(/^y(es)?$/i.test(answer.trim()))
		})
	})
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
	usage()
	process.exit(0)
}

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
const currentVersion = String(pkg.version)
const target = opts.version ?? bumpVersion(currentVersion, opts.bump)
const tag = `v${target}`
const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8')

// ---- preflight (read-only checks first) ----
const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'main' && !opts.dryRun) {
	fail(`expected branch main, found ${branch}`)
}
const dirty = run('git', ['status', '--porcelain'])
if (dirty && !opts.dryRun) {
	fail(`working tree is dirty:\n${dirty}\ncommit or stash first`)
}
const existingTags = run('git', ['tag', '--list', tag])
if (existingTags) fail(`tag already exists: ${tag}`)
if (!opts.dryRun) run('gh', ['auth', 'status'])

const ref = lastTag()
const subjects = commitsSince(ref)
const groups = groupCommits(subjects)
const {updated, notes} = buildChangelog(changelog, target, groups)

console.log(`[release] ${currentVersion} → ${target} (${tag})`)
console.log(`[release] range: ${ref ?? '(no tags, full history)'}..HEAD`)
console.log(`[release] commits: ${subjects.length}`)
if (!subjects.length && !opts.dryRun && !opts.forceEmpty) {
	fail(
		`no new commits since ${ref ?? '(first tag)'} — refusing to cut an empty release
  inspect first: bun run release -- --bump ${opts.bump} --dry-run
  permit it:     bun run release -- --bump ${opts.bump} --force-empty --yes
  or wait until new commits land`,
	)
}
if (!subjects.length) {
	console.log(
		'[release] no new commits since last tag — changelog keeps its entries',
	)
}

const plan = [
	`write package.json version ${target}`,
	`update CHANGELOG.md (${notes.split('\n').length}-line ${tag} section)`,
	`git commit -m "chore(release): ${tag}"`,
	`git tag -a ${tag} -m "${tag}"`,
	opts.noPush
		? '(skip push + gh release: --no-push)'
		: `git push origin main + ${tag}`,
	opts.noPush
		? null
		: `gh release create ${tag} --title ${tag} --notes-file <tmp>`,
].filter(Boolean)

if (opts.dryRun) {
	console.log('[release] dry-run — would do:')
	for (const step of plan) console.log(`  - ${step}`)
	console.log('--- notes preview ---')
	console.log(notes)
	process.exit(0)
}

if (!opts.yes) {
	const ok = await confirm(`[release] cut ${tag} on ${branch}? [y/N] `)
	if (!ok) {
		console.log('[release] aborted')
		process.exit(1)
	}
}

// ---- mutate ----
pkg.version = target
fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, '\t')}\n`)
fs.writeFileSync(CHANGELOG_PATH, updated)
run('bunx', ['prettier', '--write', 'package.json', 'CHANGELOG.md'])
console.log(`[release] package.json → ${target}`)
console.log(`[release] CHANGELOG.md → ${tag} (${today()})`)

run('git', ['add', 'package.json', 'CHANGELOG.md'])
run('git', ['commit', '-m', `chore(release): ${tag}`])
run('git', ['tag', '-a', tag, '-m', tag])
console.log(`[release] committed + tagged ${tag}`)

if (opts.noPush) {
	console.log(
		'[release] --no-push: stopping before push (push + gh when ready)',
	)
	process.exit(0)
}

run('git', ['push', 'origin', 'main'])
run('git', ['push', 'origin', tag])
console.log(`[release] pushed main + ${tag} (CI builds artifacts)`)

const tmp = path.join(
	fs.mkdtempSync(path.join(os.tmpdir(), 'release-')),
	'notes.md',
)
fs.writeFileSync(tmp, `${notes}\n`)
const create = spawnSync(
	'gh',
	['release', 'create', tag, '--title', tag, '--notes-file', tmp],
	{cwd: ROOT, encoding: 'utf8', stdio: 'inherit'},
)
if (create.status !== 0) {
	console.log(
		'[release] create failed — release may already exist (CI), trying edit',
	)
	run('gh', ['release', 'edit', tag, '--notes-file', tmp])
}
console.log(`[release] gh release ${tag} ready`)
