// Patches vendored node-pty so a fresh `bun install` reproduces our fixes.
// Idempotent: every edit is a no-op once applied.
//
// 1. Strip `SpectreMitigation` from node-pty's binding.gyp.
//    node-pty sets SpectreMitigation=Spectre for its official prebuilds.
//    node-gyp 9 ignored the unknown attribute (warning only), but node-gyp 10
//    honors it -> MSBuild MSB8040 unless the multi-GB "Spectre-mitigated
//    libraries" VS workload is installed. Dropping the flag restores the
//    previous effective behavior for local dev builds.
//
// 2. Lock the pty baton registry in src/win/conpty.cc, and drop the assert
//    that turns a lost race into a process abort. See BATON_LOCK_NOTE below.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodePty = path.join(__dirname, '..', 'node_modules', 'node-pty')
const gypFiles = [
	path.join(nodePty, 'binding.gyp'),
	path.join(nodePty, 'deps', 'winpty', 'src', 'winpty.gyp'),
]

/**
 * Why the registry needs locking, in node-pty 1.1.0 terms.
 *
 * `ptyHandles` is read on the JS thread (PtyConnect/PtyResize/PtyClear/
 * PtyKill) and written from two places: `PtyStartProcess` appends on the JS
 * thread, and `SetupExitCallback`'s detached thread removes the exiting entry.
 * Nothing synchronised them.
 *
 * `std::vector::emplace_back` reallocates, and `std::remove_if` inside
 * `remove_pty_baton` moves surviving elements, so the two threads were racing
 * on both the buffer pointer and the elements themselves. The exit thread
 * could fail to find its own id - and line 106 asserted that it had:
 *
 *     assert(remove_pty_baton(baton->id));
 *
 * An assert failure in a detached thread calls abort(), so the whole app died
 * with a modal "Assertion failed! Expression: remove_pty_baton(baton->id)"
 * dialog. It needs no bad input, only a pane closing while another pane spawns
 * or quits - and a JS try/catch cannot catch it.
 *
 * Upstream took the same two steps: a mutex around the registry, and removal
 * of the assert. The assert was asserting an invariant the race could break,
 * so it converted a survivable miss into a hard abort. With the lock the miss
 * should not happen, and without the assert a miss is harmless - the erase is
 * skipped and the entry is cleaned up when the process exits.
 */
const BATON_LOCK_NOTE =
	'// involvex: pty baton registry is mutex-guarded (see scripts/patch-node-pty.mjs)'

const conptyPath = path.join(nodePty, 'src', 'win', 'conpty.cc')

/**
 * `[find, replace, expectedMatches]` triples, applied in order.
 *
 * The count is asserted rather than assumed, so a node-pty upgrade that moves
 * these sites fails the install loudly instead of silently building a binary
 * from half-patched source.
 */
const conptyEdits = [
	['#include <vector>', '#include <vector>\n#include <mutex>', 1],
	[
		'static volatile LONG ptyCounter;',
		`static volatile LONG ptyCounter;
${BATON_LOCK_NOTE}
static std::mutex g_ptyHandlesMutex;`,
		1,
	],
	// The lock is a caller precondition, so a caller cannot read the registry
	// without holding it - the signature change is what makes that checkable.
	[
		'static pty_baton* get_pty_baton(int id) {',
		`static pty_baton* get_pty_baton(const std::lock_guard<std::mutex>&, int id) {
${BATON_LOCK_NOTE}`,
		1,
	],
	// Removal happens on the exit thread while the JS thread may be appending.
	[
		`    CloseHandle(baton->hShell);
    assert(remove_pty_baton(baton->id));`,
		`    CloseHandle(baton->hShell);
${BATON_LOCK_NOTE}
    {
      std::lock_guard<std::mutex> lock(g_ptyHandlesMutex);
      remove_pty_baton(baton->id);
    }`,
		1,
	],
	// emplace_back can reallocate, so the exit thread's iterators would dangle
	// without this.
	[
		`    ptyHandles.emplace_back(
        std::make_unique<pty_baton>(ptyId, hIn, hOut, hpc));`,
		`    {
      std::lock_guard<std::mutex> lock(g_ptyHandlesMutex);
      ptyHandles.emplace_back(
        std::make_unique<pty_baton>(ptyId, hIn, hOut, hpc));
    }`,
		1,
	],
	[
		`  pty_baton* handle = get_pty_baton(id);`,
		`  pty_baton* handle;
${BATON_LOCK_NOTE}
  {
    std::lock_guard<std::mutex> lock(g_ptyHandlesMutex);
    handle = get_pty_baton(lock, id);
  }`,
		1,
	],
	// resize / clear / kill all share this shape and hold the lock for their
	// whole body. Each only calls into conpty.dll and Win32 - never back into
	// JS - and TerminateProcess is asynchronous, so the exit thread cannot be
	// waiting on work that needs this lock. No deadlock.
	[
		`  const pty_baton* handle = get_pty_baton(id);

  if (handle != nullptr) {`,
		`  std::lock_guard<std::mutex> lock(g_ptyHandlesMutex);
  const pty_baton* handle = get_pty_baton(lock, id);

  if (handle != nullptr) {`,
		3,
	],
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

if (!fs.existsSync(conptyPath)) {
	console.log(`[patch-node-pty] missing, skipping: ${conptyPath}`)
} else {
	const src = fs.readFileSync(conptyPath, 'utf8')
	// Idempotency guard, checked before any edit is considered.
	//
	// Per-edit "did my find string still match" is not safe here: the
	// replacements contain their own find strings as substrings (the mutex
	// declaration embeds `static volatile LONG ptyCounter;`, and the reindented
	// emplace_back still contains the original line as a substring). Re-running
	// then declared g_ptyHandlesMutex twice and nested two lock_guards, which is
	// a redeclaration and a self-deadlock. Every conpty edit inserts this note,
	// so its presence means the whole file is already done.
	if (src.includes(BATON_LOCK_NOTE)) {
		console.log(`[patch-node-pty] already patched, skipping: ${conptyPath}`)
	} else {
		let patchedSrc = src
		for (const [find, replace, expected] of conptyEdits) {
			const found = patchedSrc.split(find).length - 1
			if (found !== expected) {
				throw new Error(
					`[patch-node-pty] ${conptyPath}: expected ${expected} match(es) for:\n${find}\ngot ${found}`,
				)
			}
			patchedSrc = patchedSrc.split(find).join(replace)
			patched++
		}

		// Verify before writing, so a failed check never leaves a patched file
		// behind that the next run would then skip.
		if (/assert\(remove_pty_baton/.test(patchedSrc)) {
			throw new Error(
				`[patch-node-pty] ${conptyPath} still asserts on remove_pty_baton`,
			)
		}
		if (patchedSrc.split('get_pty_baton(id)').length - 1 !== 0) {
			throw new Error(
				`[patch-node-pty] ${conptyPath}: get_pty_baton is still called unlocked`,
			)
		}
		const count = needle => patchedSrc.split(needle).length - 1
		const mutexDecls = count('static std::mutex g_ptyHandlesMutex;')
		if (mutexDecls !== 1) {
			throw new Error(
				`[patch-node-pty] ${conptyPath}: expected 1 mutex declaration, found ${mutexDecls}`,
			)
		}
		if (count('#include <mutex>') !== 1) {
			throw new Error(`[patch-node-pty] ${conptyPath}: missing <mutex>`)
		}
		// One lock per registry access: reads through get_pty_baton, the append
		// in PtyStartProcess, and the removal on the exit thread. Equal counts
		// rule out both an unguarded access and the duplicated/nested lock a
		// re-run used to produce (which would self-deadlock).
		const accesses =
			count('get_pty_baton(lock, id)') +
			count('ptyHandles.emplace_back') +
			count('remove_pty_baton(baton->id)')
		const locks = count('std::lock_guard<std::mutex> lock(g_ptyHandlesMutex);')
		if (locks !== accesses) {
			throw new Error(
				`[patch-node-pty] ${conptyPath}: ${locks} lock(s) for ${accesses} registry access(es)`,
			)
		}

		fs.writeFileSync(conptyPath, patchedSrc)
		console.log(`[patch-node-pty] patched: ${conptyPath}`)
	}
}

console.log(
	patched === 0
		? '[patch-node-pty] already patched, nothing to do.'
		: `[patch-node-pty] patched ${patched} edit(s).`,
)
