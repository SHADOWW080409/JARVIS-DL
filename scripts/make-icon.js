// Generates assets/icon.png (256x256 glowing geodisc) with no dependencies.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 256;
const px = Buffer.alloc(N * N * 4);
const c = N / 2;
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c) / c;
    const a = Math.atan2(y - c, x - c);
    let v = 0;
    for (let k = 0; k < 4; k++) {
      const sides = 6 + k;
      const r = 0.3 + 0.17 * k;
      // polygon radius at this angle
      const seg = (Math.PI * 2) / sides;
      const m = ((a % seg) + seg) % seg - seg / 2;
      const pr = r * Math.cos(seg / 2) / Math.cos(m);
      v = Math.max(v, Math.max(0, 1 - Math.abs(d - pr) * 48));
    }
    const glow = Math.max(0, 1 - d) * 0.35;
    const core = d < 0.12 ? 1 : 0;
    const i = (y * N + x) * 4;
    const t = Math.min(1, v + glow + core);
    const inside = d <= 0.98 ? 1 : 0;
    px[i] = Math.round(94 * t + 8 * (1 - t));
    px[i + 1] = Math.round(200 * t + 10 * (1 - t));
    px[i + 2] = Math.round(255 * t + 16 * (1 - t));
    px[i + 3] = inside * 255;
  }
}

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let v = n;
  for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
  return v >>> 0;
});
const crc = (b) => {
  let v = 0xffffffff;
  for (const x of b) v = crcTable[(v ^ x) & 255] ^ (v >>> 8);
  return (v ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const cr = Buffer.alloc(4);
  cr.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, cr]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote', out);
