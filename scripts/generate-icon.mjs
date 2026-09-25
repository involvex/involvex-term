// Generates public/icon.png (256px) + public/icon.ico (16/32/48/256 PNG-entries).
// Pure Node (node:zlib), no external imaging tools. Run: bun scripts/generate-icon.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PNG = path.join(__dirname, "..", "public", "icon.png");
const OUT_ICO = path.join(__dirname, "..", "public", "icon.ico");

const BG = [30, 30, 30, 255]; // #1e1e1e
const BORDER = [74, 74, 74, 255];
const TEAL = [78, 201, 176, 255];

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function roundedRectDist(x, y, s) {
  const r = s * 0.22;
  const qx = Math.abs(x - s / 2) - (s / 2 - r);
  const qy = Math.abs(y - s / 2) - (s / 2 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function pixel(s, x, y) {
  const d = roundedRectDist(x + 0.5, y + 0.5, s);
  if (d > 0) return [0, 0, 0, 0]; // transparent corner
  const nx = (x + 0.5) / s;
  const ny = (y + 0.5) / s;
  // chevron ">"
  const dc =
    Math.min(
      distToSeg(nx, ny, 0.26, 0.3, 0.55, 0.5),
      distToSeg(nx, ny, 0.55, 0.5, 0.26, 0.7),
    );
  if (dc < 0.042) return TEAL;
  // underscore
  if (nx >= 0.6 && nx <= 0.82 && ny >= 0.655 && ny <= 0.715) return TEAL;
  // border ring
  if (d > -Math.max(2.5, s * 0.012)) return BORDER;
  return BG;
}

function makePng(s) {
  const raw = Buffer.alloc(s * s * 4 + s);
  let o = 0;
  for (let y = 0; y < s; y++) {
    raw[o++] = 0; // filter byte: none
    for (let x = 0; x < s; x++) {
      const p = pixel(s, x, y);
      raw[o++] = p[0];
      raw[o++] = p[1];
      raw[o++] = p[2];
      raw[o++] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const sizes = [16, 32, 48, 256];
const pngs = sizes.map((s) => ({ s, data: makePng(s) }));

fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
fs.writeFileSync(OUT_PNG, pngs.find((p) => p.s === 256).data);

// ICO with PNG-compressed entries (Vista+)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(pngs.length, 4);
const entries = [];
let offset = 6 + 16 * pngs.length;
for (const { s, data } of pngs) {
  const e = Buffer.alloc(16);
  e[0] = s === 256 ? 0 : s;
  e[1] = s === 256 ? 0 : s;
  e[2] = 0; // colors
  e[3] = 0; // reserved
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += data.length;
}
fs.writeFileSync(
  OUT_ICO,
  Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]),
);
console.log(`wrote ${OUT_PNG} + ${OUT_ICO}`);
