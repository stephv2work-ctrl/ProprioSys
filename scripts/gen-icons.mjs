// Generates the PWA icons with no image dependencies: a tiny PNG encoder
// rasterising the same eye mark as public/icon.svg (supersampled for AA).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [0, 0, 0];
const FG = [250, 204, 21];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// Shape in unit coords centred at 0 — kept within r≈0.36 so it survives maskable cropping.
function inside(x, y) {
  // Almond eye outline: intersection of two circles, stroked.
  const R = 0.52;
  const off = 0.34;
  const d1 = Math.hypot(x, y - off);
  const d2 = Math.hypot(x, y + off);
  const lens = d1 < R && d2 < R;
  const innerLens = d1 < R - 0.06 && d2 < R - 0.06;
  const pupil = Math.hypot(x, y) < 0.11;
  return (lens && !innerLens) || pupil;
}

function png(size) {
  const SS = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size - 0.5;
          const y = (py + (sy + 0.5) / SS) / size - 0.5;
          if (inside(x, y)) hit++;
        }
      const a = hit / (SS * SS);
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] + (FG[i] - BG[i]) * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size));
  console.log(`public/${name}`);
}
