import { deflateSync } from "node:zlib";

/**
 * Minimal, standards-valid PNG encoder for rendered-image tests. A fake base64
 * string can satisfy `browserImageSchema` while failing to decode, so image
 * tests need bytes Chromium really renders: assert `naturalWidth > 0` against
 * these.
 */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export interface PngFixture {
  readonly base64: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png";
}

export function makePng(width = 8, height = 6): PngFixture {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  // Each scanline starts with filter type 0, then RGB triples.
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(0);
    for (let x = 0; x < width; x++)
      rows.push((x * 32) % 256, (y * 40) % 256, 128);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(rows), { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
  return {
    base64: png.toString("base64"),
    width,
    height,
    mimeType: "image/png",
  };
}

/** A tiny valid JPEG header-free fixture is not needed; PNG covers rendering. */
export function dataUrl(png: PngFixture): string {
  return `data:${png.mimeType};base64,${png.base64}`;
}
