// aether-fluid :: tools/make-icons.mjs
// Generates every PWA icon with a hand-written PNG encoder (zlib + CRC32 from
// the Node standard library only). No image library, no binary assets in git.
//
//   node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(fileURLToPath(new URL('../icons/', import.meta.url)));

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

// A two-armed vortex over a deep navy substrate. Pure maths, evaluated per
// sub-sample, so the result is analytic and scales to any size.
function shade(x, y, inset, maskable) {
  const dx = (x - 0.5) / inset;
  const dy = (y - 0.5) / inset;
  const r = Math.sqrt(dx * dx + dy * dy);
  const t = Math.atan2(dy, dx);

  const ang = t + 2.7 * r - 0.6;
  const arm = Math.pow(0.5 + 0.5 * Math.cos(2 * ang), 2.4);
  const fall = Math.exp(-r * 2.05);
  const core = Math.exp(-r * r * 26);
  const ring = Math.exp(-(r - 0.30) * (r - 0.30) * 34) * 0.5;

  let energy = arm * fall * 1.35 + core * 0.95 + ring * (0.6 + 0.4 * Math.cos(2 * ang + 1.2));
  if (maskable) {
    const ri = Math.sqrt((x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5));
    energy *= 1 - smoothstep(0.32, 0.44, ri);
  }
  energy = Math.min(1, energy);

  const hueMix = 0.5 + 0.5 * Math.cos(2 * ang + 1.1);
  const cr = (94 * (1 - hueMix) + 255 * hueMix) / 255;
  const cg = (225 * (1 - hueMix) + 110 * hueMix) / 255;
  const cb = (255 * (1 - hueMix) + 210 * hueMix) / 255;

  const sub = 8 + 16 * (1 - Math.min(1, r * 0.9));
  const rr = sub + cr * energy * 250;
  const gg = sub * 0.78 + cg * energy * 250;
  const bb = sub * 1.45 + cb * energy * 250;
  return [rr, gg, bb];
}

function renderIcon(size, options) {
  const samples = size > 256 ? 3 : 4;
  const inset = options.maskable ? 0.70 : 0.92;
  const out = Buffer.alloc(size * size * 4);
  const total = samples * samples;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          const c = shade(u, v, inset, options.maskable);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.min(255, Math.round(r / total));
      out[o + 1] = Math.min(255, Math.round(g / total));
      out[o + 2] = Math.min(255, Math.round(b / total));
      out[o + 3] = 255;
    }
  }
  return encodePng(size, size, out);
}

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-192.png', size: 192, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'favicon-64.png', size: 64, maskable: false },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const png = renderIcon(target.size, { maskable: target.maskable });
  writeFileSync(resolve(OUT_DIR, target.file), png);
  console.log(target.file + '  ' + target.size + 'x' + target.size + '  ' + png.length + ' bytes');
}
