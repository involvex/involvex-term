/**
 * Generate Microsoft Store APPX logos under resources/appx/ from the same
 * icon painter as public/icon.png. Sizes electron-builder expects:
 * StoreLogo (50), Square44x44Logo, Square150x150Logo, Wide310x150Logo.
 *
 * Usage: bun scripts/generate-store-assets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'resources', 'appx')

const BG = [30, 30, 30, 255]
const BORDER = [74, 74, 74, 255]
const TEAL = [78, 201, 176, 255]

const crcTable = (() => {
	const t = new Int32Array(256)
	for (let n = 0; n < 256; n++) {
		let c = n
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		t[n] = c
	}
	return t
})()

function crc32(buf) {
	let c = -1
	for (let i = 0; i < buf.length; i++)
		c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
	return (c ^ -1) >>> 0
}

function chunk(type, data) {
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length, 0)
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(body), 0)
	return Buffer.concat([len, body, crc])
}

function distToSeg(px, py, ax, ay, bx, by) {
	const dx = bx - ax
	const dy = by - ay
	const len2 = dx * dx + dy * dy || 1e-9
	let t = ((px - ax) * dx + (py - ay) * dy) / len2
	t = Math.max(0, Math.min(1, t))
	const cx = ax + t * dx
	const cy = ay + t * dy
	return Math.hypot(px - cx, py - cy)
}

function roundedRectDist(x, y, s) {
	const r = s * 0.22
	const qx = Math.abs(x - s / 2) - (s / 2 - r)
	const qy = Math.abs(y - s / 2) - (s / 2 - r)
	const ax = Math.max(qx, 0)
	const ay = Math.max(qy, 0)
	return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

function pixel(s, x, y) {
	const d = roundedRectDist(x + 0.5, y + 0.5, s)
	if (d > 0) return [0, 0, 0, 0]
	const nx = (x + 0.5) / s
	const ny = (y + 0.5) / s
	const dc = Math.min(
		distToSeg(nx, ny, 0.26, 0.3, 0.55, 0.5),
		distToSeg(nx, ny, 0.55, 0.5, 0.26, 0.7),
	)
	if (dc < 0.042) return TEAL
	if (nx >= 0.6 && nx <= 0.82 && ny >= 0.655 && ny <= 0.715) return TEAL
	if (d > -Math.max(2.5, s * 0.012)) return BORDER
	return BG
}

function makePng(w, h, paint) {
	const raw = Buffer.alloc(w * h * 4 + h)
	let o = 0
	for (let y = 0; y < h; y++) {
		raw[o++] = 0
		for (let x = 0; x < w; x++) {
			const p = paint(x, y)
			raw[o++] = p[0]
			raw[o++] = p[1]
			raw[o++] = p[2]
			raw[o++] = p[3]
		}
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(w, 0)
	ihdr.writeUInt32BE(h, 4)
	ihdr[8] = 8
	ihdr[9] = 6
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
	return Buffer.concat([
		sig,
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	])
}

function square(s) {
	return makePng(s, s, (x, y) => pixel(s, x, y))
}

function wide(w, h) {
	return makePng(w, h, (x, y) => {
		const side = Math.min(w, h)
		const ox = Math.floor((w - side) / 2)
		const oy = Math.floor((h - side) / 2)
		if (x < ox || y < oy || x >= ox + side || y >= oy + side) return BG
		return pixel(side, x - ox, y - oy)
	})
}

fs.mkdirSync(OUT_DIR, {recursive: true})
const assets = [
	['StoreLogo.png', square(50)],
	['Square44x44Logo.png', square(44)],
	['Square150x150Logo.png', square(150)],
	['Wide310x150Logo.png', wide(310, 150)],
	['Square71x71Logo.png', square(71)],
	['Square310x310Logo.png', square(310)],
]
for (const [name, data] of assets) {
	const dest = path.join(OUT_DIR, name)
	fs.writeFileSync(dest, data)
	console.log('wrote', dest)
}
