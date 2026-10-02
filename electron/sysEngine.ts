import {createRequire} from 'node:module'
import os from 'node:os'
import type {SysStats} from './types.js'

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

/** Cheap CPU% from os.cpus() deltas — avoids systeminformation's WMI/subprocess cost per tick. */
let prevIdle = 0
let prevTotal = 0
function cpuFromOs(): number {
	try {
		const cpus = os.cpus()
		if (cpus.length === 0) return 0
		let idle = 0
		let total = 0
		for (const c of cpus) {
			idle += c.times.idle
			total +=
				c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
		}
		if (prevTotal > 0 && total > prevTotal) {
			const pct = Math.round(
				100 * (1 - (idle - prevIdle) / (total - prevTotal)),
			)
			prevIdle = idle
			prevTotal = total
			return Math.min(100, Math.max(0, pct))
		}
		prevIdle = idle
		prevTotal = total
		return 0
	} catch {
		return 0
	}
}

export async function getSysStats(): Promise<SysStats> {
	const total = os.totalmem()
	const free = os.freemem()
	const used = total - free
	// Fast path: os.cpus() delta is microseconds vs. systeminformation's
	// subprocess/WMI query every tick. Keep si as a periodic recalibrator.
	let cpuPercent = cpuFromOs()
	try {
		const mod = lazySi()
		if (mod && (prevTotal === 0 || Math.random() < 0.1)) {
			const load = await mod.currentLoad()
			const v = Math.round(load.currentLoad ?? NaN)
			if (Number.isFinite(v)) cpuPercent = Math.min(100, Math.max(0, v))
		}
	} catch {
		/* keep os.cpus() value */
	}
	const GB = 1024 ** 3
	return {
		cpuPercent,
		memUsedGB: Math.round((used / GB) * 10) / 10,
		memTotalGB: Math.round((total / GB) * 10) / 10,
		memPercent: total > 0 ? Math.round((100 * used) / total) : 0,
		uptimeSec: Math.floor(os.uptime()),
	}
}
