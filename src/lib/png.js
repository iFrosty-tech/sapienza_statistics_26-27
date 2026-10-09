/**
 * A minimal PNG encoder for build-time rasters (the strict-avalanche heat map).
 * Node only: it compresses with node:zlib. The browser rasterises the same
 * pixels through a canvas instead (see src/hw01/render.js).
 *
 * Output: 8-bit RGBA, no interlace, every scanline with filter type 0 (None).
 * Reference: ISO/IEC 15948:2004 (PNG), sections 5 (datastream structure),
 * 11.2 (IHDR, IDAT, IEND) and 9 (filtering).
 */

import { deflateSync } from 'node:zlib';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* CRC-32 (IEEE 802.3, polynomial 0xEDB88320), table-driven as in the PNG specification, annex D. */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

/** CRC-32 of a byte string, as an unsigned 32-bit integer. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(value) {
  return Uint8Array.from([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/**
 * Encodes an RGBA pixel buffer (row-major, 4 bytes per pixel) as a PNG file.
 * @param {{ width: number, height: number, rgba: Uint8Array | Uint8ClampedArray }} image
 * @returns {Uint8Array}
 */
export function encodePng({ width, height, rgba }) {
  if (!(width > 0 && height > 0)) throw new Error('encodePng needs positive dimensions');
  if (rgba.length !== width * height * 4) {
    throw new Error(`encodePng expected ${width * height * 4} bytes of RGBA, got ${rgba.length}`);
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // bit depth 8, colour type 6 (RGBA), deflate, adaptive filtering, no interlace
  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return png;
}

/** A data: URL embedding a PNG file. */
export function pngDataUrl(png) {
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}
