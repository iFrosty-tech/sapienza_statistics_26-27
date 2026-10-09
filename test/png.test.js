/**
 * The minimal PNG encoder used to rasterise the strict-avalanche heat map at
 * build time: signature, chunk layout, CRC and the raw scanline format.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { crc32, encodePng, pngDataUrl } from '../src/lib/png.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readChunks(png) {
  const chunks = [];
  let offset = 8;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    chunks.push({ type, data, crc });
    offset += 12 + length;
  }
  return chunks;
}

test('crc32 of "123456789" is the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('a 2×2 RGBA image encodes to signature, IHDR, IDAT (filter 0 scanlines) and IEND', () => {
  const rgba = Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255, // row 0: red, green
    0, 0, 255, 255, 10, 20, 30, 40, // row 1: blue, translucent grey
  ]);
  const png = encodePng({ width: 2, height: 2, rgba });
  assert.deepEqual([...png.subarray(0, 8)], SIGNATURE);

  const chunks = readChunks(png);
  assert.deepEqual(
    chunks.map((c) => c.type),
    ['IHDR', 'IDAT', 'IEND'],
  );

  const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13);
  assert.equal(ihdr.getUint32(0), 2, 'width');
  assert.equal(ihdr.getUint32(4), 2, 'height');
  assert.deepEqual([...chunks[0].data.subarray(8)], [8, 6, 0, 0, 0], 'bit depth 8, RGBA, no interlace');

  const raw = inflateSync(chunks[1].data);
  assert.deepEqual([...raw], [0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 10, 20, 30, 40]);

  // CRC covers the chunk type and its data.
  for (const c of chunks) {
    const typeBytes = new TextEncoder().encode(c.type);
    const joined = new Uint8Array(typeBytes.length + c.data.length);
    joined.set(typeBytes);
    joined.set(c.data, typeBytes.length);
    assert.equal(c.crc, crc32(joined), `${c.type} crc`);
  }
  assert.equal(chunks[2].data.length, 0);
});

test('encodePng validates its input and pngDataUrl produces a base64 data URL', () => {
  assert.throws(() => encodePng({ width: 2, height: 2, rgba: new Uint8Array(3) }), /16 bytes/);
  const url = pngDataUrl(encodePng({ width: 1, height: 1, rgba: Uint8Array.from([0, 0, 0, 255]) }));
  assert.ok(url.startsWith('data:image/png;base64,iVBORw0KGgo'), url.slice(0, 40));
});
