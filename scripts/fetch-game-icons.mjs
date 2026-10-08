/**
 * 게임 주문서 아이콘을 maplestory.io 에서 받아 저장소에 넣는다.
 *
 *   node scripts/fetch-game-icons.mjs
 *
 * 받아온 이미지는 넥슨의 저작물이며 MIT 적용 대상이 아니다 (LICENSE 참고).
 * 이 스크립트는 그 파일들이 어디서 왔는지를 코드로 남겨 두기 위한 것이다.
 *
 * 런타임에 불러오지 않고 굳이 받아서 커밋하는 이유:
 * 파비콘은 어차피 저장소 파일이어야 해서 원본을 피할 수 없고, 그렇다면 앱 아이콘만
 * 남의 서비스에 의존시킬 이유가 없다. 다 담으면 오프라인에서도 뜨고 maplestory.io
 * 장애에도 안 깨진다.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGION = 'gms';
const VERSION = 62;

/** 인벤 아이템 코드. 혼돈의 주문서 60%. */
const ITEMS = [2049100];
/** 파비콘으로 쓸 아이템 — 혼돈의 주문서 60% */
const FAVICON_ITEM = 2049100;

async function download(id) {
  const url = `https://maplestory.io/api/${REGION}/${VERSION}/item/${id}/icon`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── 최소한의 PNG 디코드/인코드 ───────────────────────────────────────────
// 파비콘을 정사각형으로 맞추려면 픽셀을 만져야 하는데, 그것 하나 때문에 이미지
// 라이브러리를 의존성에 넣고 싶지는 않다.

function decode(buf) {
  let pos = 8;
  let idat = Buffer.alloc(0);
  let meta;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      meta = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9] };
    } else if (type === 'IDAT') idat = Buffer.concat([idat, data]);
    pos += 12 + len;
  }
  if (!meta || meta.depth !== 8 || meta.color !== 6) {
    throw new Error(`지원하지 않는 PNG 형식: ${JSON.stringify(meta)}`);
  }

  const raw = inflateSync(idat);
  const { w, h } = meta;
  const stride = w * 4;
  const px = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? line[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      if (filter === 1) line[x] = (line[x] + a) & 255;
      else if (filter === 2) line[x] = (line[x] + b) & 255;
      else if (filter === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(px, y * stride);
    prev = line;
  }
  return { w, h, px };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function encode({ w, h, px }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), data.length + 8);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 정사각 캔버스 가운데에 놓고 정수배로 확대한다 (도트가 뭉개지지 않게 최근접). */
function toSquareFavicon(img, size) {
  const scale = Math.max(1, Math.floor(size / Math.max(img.w, img.h)));
  const dw = img.w * scale;
  const dh = img.h * scale;
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const from = (sy * img.w + sx) * 4;
      const to = ((y + oy) * size + (x + ox)) * 4;
      img.px.copy(px, to, from, from + 4);
    }
  }
  return { w: size, h: size, px };
}

mkdirSync(join(ROOT, 'public/game-icons'), { recursive: true });
for (const id of ITEMS) {
  const buf = await download(id);
  writeFileSync(join(ROOT, `public/game-icons/${id}.png`), buf);
  const { w, h } = decode(buf);
  console.log(`public/game-icons/${id}.png  ${w}x${h}  ${buf.length}B`);

  if (id === FAVICON_ITEM) {
    const favicon = encode(toSquareFavicon(decode(buf), 64));
    writeFileSync(join(ROOT, 'src/app/icon.png'), favicon);
    console.log(`src/app/icon.png  64x64  ${favicon.length}B  (${id} 기반)`);
  }
}
