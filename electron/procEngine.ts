import {execFile} from 'node:child_process'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {promisify} from 'node:util'
import type {ProcInfo} from './types.js'

// Main process is bundled as ESM — bare `require` is undefined there.
const require = createRequire(import.meta.url)

let si: typeof import('systeminformation') | null = null
let siFailed = false
function lazySi(): typeof import('systeminformation') | null {
	if (si || siFailed) return si
	try {
		si = require('systeminformation') as typeof import('systeminformation')
	} catch {
		si = null
		siFailed = true
	}
	return si
}

const execFileAsync = promisify(execFile)

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
	let timer: NodeJS.Timeout | null = null
	const timeout = new Promise<T>(resolve => {
		timer = setTimeout(() => resolve(fallback), ms)
	})
	return Promise.race([p, timeout]).finally(() => {
		if (timer) clearTimeout(timer)
	})
}

/** Snapshot maps are namespaced per backend. CIM reports CPU times in
 * 100ns units while /proc uses clock ticks — sharing one delta baseline
 * across backends would compute garbage rates (phantom CPU spikes) whenever
 * the active backend flips between polls (e.g. si cold-start fallback). */
const prevIoCim = new Map<number, {read: number; write: number; at: number}>()
const prevCpuCim = new Map<number, {total: number; at: number}>()
const prevIoLinux = new Map<number, {read: number; write: number; at: number}>()
const prevCpuLinux = new Map<number, {total: number; at: number}>()
/** Throttle concurrent list calls (process enumeration is WMI-heavy on Windows). */
let inFlight: Promise<ProcInfo[]> | null = null
let lastStart = 0

const LIST_THROTTLE_MS = 800
const LIST_CAP = 250
const SNAPSHOT_PRUNE_AT = 1200

interface RawProc {
	pid?: unknown
	ppid?: unknown
	parentPid?: unknown
	name?: unknown
	cpu?: unknown
	cpuu?: unknown
	pcpu?: unknown
	pcpuu?: unknown
	mem?: unknown
	pmem?: unknown
	memRss?: unknown
	mem_rss?: unknown
	path?: unknown
	started?: unknown
}

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v)
	return Number.isFinite(n) ? n : fallback
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : ''
}

/**
 * Run a static PowerShell snippet with a native timeout. Unlike the generic
 * `withTimeout` race (which leaves the child running), `execFile`'s `timeout`
 * option kills the child, so slow WMI hosts can't pile up orphaned
 * powershell.exe processes. Partial stdout on timeout is still returned.
 */
async function runPowerShell(ps: string, ms: number): Promise<string> {
	try {
		const {stdout} = await execFileAsync(
			'powershell.exe',
			['-NoProfile', '-NonInteractive', '-Command', ps],
			{timeout: ms},
		)
		return String(stdout || '')
	} catch (e) {
		const partial = (e as {stdout?: unknown})?.stdout
		return typeof partial === 'string' ? partial : ''
	}
}

/** Parse a ConvertTo-Csv line (all fields double-quoted). */
function parseCsvLine(line: string): string[] {
	const out: string[] = []
	let cur = ''
	let inQuotes = false
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				cur += '"'
				i++
			} else {
				inQuotes = !inQuotes
			}
		} else if (ch === ',' && !inQuotes) {
			out.push(cur)
			cur = ''
		} else {
			cur += ch
		}
	}
	out.push(cur)
	return out.map(s => s.trim())
}

/**
 * Native Windows enumeration (primary on win32): one CIM query returns
 * name/pid/path/memory/CPU-times/IO. CPU% + I/O rate come from deltas
 * against the previous snapshot, so the first poll shows 0.0 rates.
 */
async function windowsFullList(): Promise<ProcInfo[]> {
	try {
		const os = await import('node:os')
		const cores = Math.max(1, os.cpus()?.length ?? 1)
		const totalMem = Math.max(1, os.totalmem())
		const text = await runPowerShell(
			'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,ExecutablePath,WorkingSetSize,KernelModeTime,UserModeTime,ReadTransferCount,WriteTransferCount | ConvertTo-Csv -NoTypeInformation',
			12000,
		)
		if (!text.trim()) return []
		const at = Date.now()
		const out: ProcInfo[] = []
		const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
		// Skip CSV header row.
		const startIdx =
			lines.length > 0 && /ProcessId/i.test(lines[0] ?? '') ? 1 : 0
		for (const line of lines.slice(startIdx)) {
			const parts = parseCsvLine(line)
			if (parts.length < 8) continue
			const pid = Number(parts[0])
			if (!Number.isFinite(pid) || pid <= 0) continue
			const name = parts[1] || `pid ${pid}`
			const exePath = parts[2] || ''
			const ws = Number(parts[3])
			const kt = Number(parts[4])
			const ut = Number(parts[5])
			const rd = Number(parts[6])
			const wr = Number(parts[7])
			const rss = Number.isFinite(ws) ? ws : 0
			const memRssMB = Math.round((rss / 1024 / 1024) * 10) / 10
			const mem = Math.round((rss / totalMem) * 100 * 10) / 10
			let cpu = 0
			if (Number.isFinite(kt) && Number.isFinite(ut)) {
				const total = kt + ut // 100ns units
				const prev = prevCpuCim.get(pid)
				if (prev && at > prev.at) {
					const dtSec = (at - prev.at) / 1000
					const d = total - prev.total
					if (d >= 0 && dtSec > 0.2)
						cpu = Math.round((d / 1e7 / dtSec / cores) * 100 * 10) / 10
				}
				prevCpuCim.set(pid, {total, at})
			}
			let readKBs = 0
			let writeKBs = 0
			if (Number.isFinite(rd) && Number.isFinite(wr)) {
				const prev = prevIoCim.get(pid)
				if (prev && at > prev.at) {
					const dt = (at - prev.at) / 1000
					if (dt > 0.2) {
						const dr = rd - prev.read
						const dw = wr - prev.write
						if (dr >= 0) readKBs = dr / 1024 / dt
						if (dw >= 0) writeKBs = dw / 1024 / dt
					}
				}
				prevIoCim.set(pid, {read: rd, write: wr, at})
			}
			out.push({
				pid,
				name,
				cpu: Math.min(100 * cores, Math.max(0, cpu)),
				mem: Math.max(0, mem),
				memRssMB,
				path: exePath,
				diskReadKBs: Math.round(readKBs * 10) / 10,
				diskWriteKBs: Math.round(writeKBs * 10) / 10,
				diskTotalKBs: Math.round((readKBs + writeKBs) * 10) / 10,
				ioSupported: true,
			})
		}
		if (prevCpuCim.size > SNAPSHOT_PRUNE_AT) {
			const live = new Set(out.map(p => p.pid))
			for (const pid of prevCpuCim.keys())
				if (!live.has(pid)) prevCpuCim.delete(pid)
		}
		if (prevIoCim.size > SNAPSHOT_PRUNE_AT) {
			const live = new Set(out.map(p => p.pid))
			for (const pid of prevIoCim.keys())
				if (!live.has(pid)) prevIoCim.delete(pid)
		}
		out.sort((a, b) => b.cpu - a.cpu || b.memRssMB - a.memRssMB)
		return out.slice(0, LIST_CAP)
	} catch {
		return []
	}
}

/** Native Linux fallback: enumerate /proc (no spawn, no si). */
function linuxFullList(): ProcInfo[] {
	try {
		const os = require('node:os') as typeof import('node:os')
		const totalMem = Math.max(1, os.totalmem())
		const at = Date.now()
		const out: ProcInfo[] = []
		let entries: string[] = []
		try {
			entries = fs.readdirSync('/proc')
		} catch {
			return []
		}
		for (const entry of entries) {
			if (!/^\d+$/.test(entry)) continue
			const pid = Number(entry)
			try {
				const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
				// comm (name) is parenthesized and may contain spaces.
				const m = stat.match(/^\d+ \((.*)\) ([^ ]+) /)
				const name = (m?.[1] || '').trim() || `pid ${pid}`
				const rest = stat.slice((m?.[0] ?? '').length).split(' ')
				// utime=field13, stime=field14 of stat (0-based after comm).
				const utime = Number(rest[11] ?? 0)
				const stime = Number(rest[12] ?? 0)
				const rssPages = Number(rest[21] ?? 0)
				let rssBytes =
					Number.isFinite(rssPages) && rssPages > 0 ? rssPages * 4096 : 0
				try {
					const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8')
					const vm = status.match(/^VmRSS:\s+(\d+)\s+kB/m)
					if (vm) rssBytes = Number(vm[1]) * 1024
				} catch {
					/* keep page estimate */
				}
				let exe = ''
				try {
					exe = fs.readlinkSync(`/proc/${pid}/exe`)
				} catch {
					try {
						const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
						exe = (cmd.split('\0')[0] ?? '').trim()
					} catch {
						exe = ''
					}
				}
				let cpu = 0
				if (Number.isFinite(utime) && Number.isFinite(stime)) {
					const total = utime + stime // clock ticks
					const prev = prevCpuLinux.get(pid)
					if (prev && at > prev.at) {
						const dtSec = (at - prev.at) / 1000
						const d = total - prev.total
						if (d >= 0 && dtSec > 0.2) cpu = (d / 100 / dtSec) * 100
					}
					prevCpuLinux.set(pid, {total, at})
				}
				let readKBs = 0
				let writeKBs = 0
				try {
					const ioRaw = fs.readFileSync(`/proc/${pid}/io`, 'utf8')
					let r = 0
					let w = 0
					for (const line of ioRaw.split('\n')) {
						if (line.startsWith('read_bytes:'))
							r = Number(line.split(':')[1]?.trim() ?? 0)
						else if (line.startsWith('write_bytes:'))
							w = Number(line.split(':')[1]?.trim() ?? 0)
					}
					const prev = prevIoLinux.get(pid)
					if (prev && at > prev.at) {
						const dt = (at - prev.at) / 1000
						if (dt > 0.2) {
							if (r - prev.read >= 0) readKBs = (r - prev.read) / 1024 / dt
							if (w - prev.write >= 0) writeKBs = (w - prev.write) / 1024 / dt
						}
					}
					prevIoLinux.set(pid, {read: r || 0, write: w || 0, at})
				} catch {
					/* no io counters */
				}
				const memRssMB = Math.round((rssBytes / 1024 / 1024) * 10) / 10
				out.push({
					pid,
					name,
					cpu: Math.round(Math.max(0, cpu) * 10) / 10,
					mem: Math.round((rssBytes / totalMem) * 100 * 10) / 10,
					memRssMB,
					path: exe,
					diskReadKBs: Math.round(readKBs * 10) / 10,
					diskWriteKBs: Math.round(writeKBs * 10) / 10,
					diskTotalKBs: Math.round((readKBs + writeKBs) * 10) / 10,
					ioSupported: true,
				})
			} catch {
				/* exited mid-scan */
			}
		}
		out.sort((a, b) => b.cpu - a.cpu || b.memRssMB - a.memRssMB)
		return out.slice(0, LIST_CAP)
	} catch {
		return []
	}
}
/** Linux: read /proc/<pid>/io for enrichment candidates (cheap, no spawn). */
function linuxIo(pids: number[]): Map<number, {read: number; write: number}> {
	const out = new Map<number, {read: number; write: number}>()
	if (process.platform !== 'linux') return out
	for (const pid of pids.slice(0, 120)) {
		try {
			const raw = fs.readFileSync(`/proc/${pid}/io`, 'utf8')
			let r = 0
			let w = 0
			for (const line of raw.split('\n')) {
				if (line.startsWith('read_bytes:'))
					r = Number(line.split(':')[1]?.trim() ?? 0)
				else if (line.startsWith('write_bytes:'))
					w = Number(line.split(':')[1]?.trim() ?? 0)
			}
			if (Number.isFinite(r) || Number.isFinite(w))
				out.set(pid, {read: r || 0, write: w || 0})
		} catch {
			/* process exited / permission denied */
		}
	}
	return out
}

export async function getProcessList(): Promise<ProcInfo[]> {
	if (inFlight) return inFlight
	// Throttle: never start more often than every LIST_THROTTLE_MS.
	const now = Date.now()
	const wait = LIST_THROTTLE_MS - (now - lastStart)
	if (wait > 0) await new Promise(r => setTimeout(r, wait))
	lastStart = Date.now()

	inFlight = (async () => {
		// Windows: the single CIM query is primary (one spawn per tick).
		// systeminformation is the secondary fallback, not a co-query.
		if (process.platform === 'win32') {
			try {
				const native = await windowsFullList()
				if (native.length > 0) return native
			} catch {
				/* fall through to si */
			}
		}
		const mod = lazySi()
		let raw: RawProc[] = []
		if (mod) {
			try {
				// First si.processes() call warms up WMI; allow longer than
				// the old 5s so cold starts don't fall into the 1-row fallback.
				const res = await withTimeout(mod.processes(), 12000, null)
				const list = (res as unknown as {list?: RawProc[]})?.list
				if (Array.isArray(list)) raw = list
			} catch {
				raw = []
			}
		}
		// Native fallback when systeminformation is missing/slow (packaged
		// builds): full process list without si, so we never show 1 row.
		if (raw.length === 0) {
			try {
				if (process.platform === 'win32') {
					// Already tried above; retry once in case the first
					// snapshot raced WMI warmup.
					const fb = await windowsFullList()
					if (fb.length > 0) return fb
				} else if (process.platform === 'linux') {
					const fb = linuxFullList()
					if (fb.length > 0) return fb
				}
			} catch {
				/* fall through to last-resort row */
			}
			let memRssMB = 0
			let mem = 0
			try {
				const os = await import('node:os')
				const rss = process.memoryUsage().rss
				memRssMB = Math.round((rss / 1024 / 1024) * 10) / 10
				const total = os.totalmem()
				if (total > 0) mem = Math.round((rss / total) * 100 * 10) / 10
			} catch {
				/* keep zeros */
			}
			return [
				{
					pid: process.pid,
					name: 'involvex-term',
					cpu: 0,
					mem,
					memRssMB,
					path: process.execPath || '',
					diskReadKBs: 0,
					diskWriteKBs: 0,
					diskTotalKBs: 0,
					ioSupported: false,
				},
			]
		}

		const at = Date.now()
		let io = new Map<number, {read: number; write: number}>()
		let ioSupported = false
		try {
			// Note: win32 never reaches here with data in the common case
			// (CIM is primary); the si fallback rows simply report no I/O
			// rather than paying for a second CIM spawn per tick.
			if (process.platform === 'linux') {
				const top = raw
					.map(r => Number(r.pid ?? 0))
					.filter(pid => Number.isFinite(pid) && pid > 0)
				io = linuxIo(top)
				ioSupported = true
			}
		} catch {
			io = new Map()
		}

		const out: ProcInfo[] = raw.map(r => {
			const pid = Math.floor(num(r.pid, 0))
			const cpu = num(r.cpu ?? r.cpuu ?? r.pcpu ?? r.pcpuu, 0)
			const mem = num(r.mem ?? r.pmem, 0)
			const rssBytes = num(r.memRss ?? r.mem_rss, 0)
			const cur = io.get(pid)
			const prev = prevIoLinux.get(pid)
			let readKBs = 0
			let writeKBs = 0
			if (cur && prev && at > prev.at) {
				const dt = (at - prev.at) / 1000
				if (dt > 0.2) {
					const dr = cur.read - prev.read
					const dw = cur.write - prev.write
					// Counter reset (pid reuse) -> treat as no rate.
					if (dr >= 0) readKBs = dr / 1024 / dt
					if (dw >= 0) writeKBs = dw / 1024 / dt
				}
			}
			if (cur) prevIoLinux.set(pid, {read: cur.read, write: cur.write, at})
			return {
				pid,
				name: str(r.name) || `pid ${pid}`,
				cpu: Math.round(cpu * 10) / 10,
				mem: Math.round(mem * 10) / 10,
				memRssMB: Math.round((rssBytes / 1024 / 1024) * 10) / 10,
				path: str(r.path),
				parentPid:
					r.parentPid != null
						? Math.floor(num(r.parentPid, 0))
						: r.ppid != null
							? Math.floor(num(r.ppid, 0))
							: undefined,
				started: str(r.started) || undefined,
				diskReadKBs: Math.round(readKBs * 10) / 10,
				diskWriteKBs: Math.round(writeKBs * 10) / 10,
				diskTotalKBs: Math.round((readKBs + writeKBs) * 10) / 10,
				ioSupported: ioSupported || cur != null,
			}
		})

		// Prune stale snapshots (exited pids) to bound memory.
		if (prevIoLinux.size > SNAPSHOT_PRUNE_AT) {
			const live = new Set(out.map(p => p.pid))
			for (const pid of prevIoLinux.keys())
				if (!live.has(pid)) prevIoLinux.delete(pid)
		}

		// Cap IPC payload: top LIST_CAP by CPU. Client can still sort/filter.
		out.sort((a, b) => b.cpu - a.cpu)
		return out.slice(0, LIST_CAP)
	})()

	try {
		return await inFlight
	} finally {
		inFlight = null
	}
}

/** Processes that must never be killed from the UI. Compared case-
 * insensitively against the resolved image name, with and without `.exe`.
 * Deliberately narrow: restartable shells like explorer.exe are NOT listed
 * (killing explorer is a legitimate troubleshooting step). */
const PROTECTED_PROCESS_NAMES = new Set([
	'idle',
	'system',
	'registry',
	'smss.exe',
	'csrss.exe',
	'wininit.exe',
	'services.exe',
	'lsass.exe',
	'winlogon.exe',
])

/** Best-effort image-name lookup for guard checks (never trusted for allow). */
async function processNameOf(pid: number): Promise<string | null> {
	try {
		if (process.platform === 'win32') {
			// pid is an already-validated integer here, safe to interpolate.
			const out = await runPowerShell(
				`(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -ExpandProperty Name)`,
				3000,
			)
			const name = out
				.split(/\r?\n/)
				.map(s => s.trim())
				.filter(Boolean)[0]
			return name || null
		}
		if (process.platform === 'linux') {
			return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() || null
		}
		return null
	} catch {
		return null
	}
}

function isProtectedName(name: string): boolean {
	const base = name.toLowerCase().trim()
	if (!base) return false
	return (
		PROTECTED_PROCESS_NAMES.has(base) ||
		PROTECTED_PROCESS_NAMES.has(base.replace(/\.exe$/, ''))
	)
}

export async function killProcess(
	pid: number,
): Promise<{ok: boolean; error?: string}> {
	const id = Math.floor(Number(pid))
	if (!Number.isInteger(id) || id <= 0) return {ok: false, error: 'Invalid pid'}
	if (id === process.pid)
		return {ok: false, error: 'Refusing to kill the terminal itself'}
	if (id <= 4) return {ok: false, error: 'Refusing to kill a system process'}
	// Main-side guard: the renderer's confirm dialog is UX only and can be
	// bypassed by calling the IPC channel directly, so critical processes
	// are refused here where the caller cannot skip the check.
	try {
		const name = await processNameOf(id)
		if (name && isProtectedName(name))
			return {ok: false, error: `Refusing to kill system process "${name}"`}
	} catch {
		/* lookup is best-effort; OS permissions still apply below */
	}
	try {
		process.kill(id)
		return {ok: true}
	} catch {
		/* fall through to platform helper */
	}
	try {
		// Native `timeout` kills the helper on expiry; only a clean exit
		// reports success (a timed-out kill must not claim ok:true).
		if (process.platform === 'win32') {
			await execFileAsync('taskkill.exe', ['/PID', String(id), '/F'], {
				timeout: 5000,
			})
			return {ok: true}
		}
		await execFileAsync('kill', ['-9', String(id)], {timeout: 5000})
		return {ok: true}
	} catch (e) {
		if ((e as {killed?: boolean})?.killed)
			return {ok: false, error: 'Kill timed out'}
		return {ok: false, error: e instanceof Error ? e.message : String(e)}
	}
}
