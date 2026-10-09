/**
 * SHA-512, HMAC-SHA-512 and PBKDF2-HMAC-SHA-512 against published vectors,
 * plus cross-checks against node:crypto on seeded random inputs.
 *
 * Vectors:
 *   - SHA-512: RFC 6234, section 8.5 (test driver), tests TEST1 ("abc"),
 *     TEST2_2 (the 896-bit message), TEST3 (one million "a") and TEST4
 *     (https://www.rfc-editor.org/rfc/rfc6234.txt); these are the FIPS 180-4
 *     example messages.
 *   - Constants: NIST FIPS PUB 180-4, sections 4.2.3 and 5.3.5
 *     (https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 *   - HMAC-SHA-512: RFC 4231, section 4, test cases 1 to 7
 *     (https://www.rfc-editor.org/rfc/rfc4231.txt).
 *   - PBKDF2-HMAC-SHA-512 is also exercised by the BIP-39 vectors in bip39.test.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { sha512, sha512Hex, hmacSha512, pbkdf2HmacSha512, SHA512_K, SHA512_H0 } from '../src/lib/sha512.js';
import { bytesToHex, hexToBytes, utf8Bytes } from '../src/lib/bytes.js';
import { createRandom } from '../src/lib/random.js';

const nodeSha512 = (bytes) => createHash('sha512').update(bytes).digest('hex');

test('constants derived from the primes match FIPS 180-4', () => {
  assert.equal(SHA512_K.length, 80);
  assert.equal(SHA512_K[0], 0x428a2f98d728ae22n);
  assert.equal(SHA512_K[1], 0x7137449123ef65cdn);
  assert.equal(SHA512_K[79], 0x6c44198c4a475817n);
  assert.equal(SHA512_H0[0], 0x6a09e667f3bcc908n);
  assert.equal(SHA512_H0.length, 8);
});

test('sha512("abc") (RFC 6234 TEST1)', () => {
  assert.equal(
    sha512Hex(utf8Bytes('abc')),
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  );
});

test('sha512 of the 896-bit two-block message (RFC 6234 TEST2_2)', () => {
  const message =
    'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmn' + 'hijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';
  assert.equal(message.length * 8, 896);
  assert.equal(
    sha512Hex(utf8Bytes(message)),
    '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909',
  );
});

test('sha512 of one million "a" (RFC 6234 TEST3)', () => {
  assert.equal(
    sha512Hex(new Uint8Array(1_000_000).fill(0x61)),
    'e718483d0ce769644e2e42c7bc15b4638e1f98b13b2044285632a803afa973ebde0ff244877ea60a4cb0432ce577c31beb009c5c2c49aa2e4eadb217ad8cc09b',
  );
});

test('sha512 of ten copies of a 64-byte block (RFC 6234 TEST4)', () => {
  const block = '01234567012345670123456701234567' + '01234567012345670123456701234567';
  assert.equal(
    sha512Hex(utf8Bytes(block.repeat(10))),
    '89d05ba632c699c31231ded4ffc127d5a894dad412c0e024db872d1abd2ba8141a0f85072a9be1e2aa04cf33c765cb510813a39cd5a84c4acaa64d3f3fb7bae9',
  );
});

test('sha512 agrees with node:crypto across the padding boundaries', () => {
  const rnd = createRandom(512);
  for (const length of [0, 1, 55, 63, 64, 111, 112, 113, 127, 128, 129, 239, 240, 255, 256, 257, 1000, 4097]) {
    const message = rnd.bytes(length);
    assert.equal(sha512Hex(message), nodeSha512(message), `length ${length}`);
  }
  assert.equal(sha512(new Uint8Array(0)).length, 64);
});

/* RFC 4231, section 4: [case, key, data, HMAC-SHA-512 (possibly truncated)]. */
const RFC4231 = [
  [1, '0b'.repeat(20), '4869205468657265',
    '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'],
  [2, '4a656665', '7768617420646f2079612077616e7420666f72206e6f7468696e673f',
    '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737'],
  [3, 'aa'.repeat(20), 'dd'.repeat(50),
    'fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb'],
  [4, '0102030405060708090a0b0c0d0e0f10111213141516171819', 'cd'.repeat(50),
    'b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd'],
  [5, '0c'.repeat(20), '546573742057697468205472756e636174696f6e', '415fad6271580a531d4179bc891d87a6'],
  [6, 'aa'.repeat(131),
    '54657374205573696e67204c6172676572205468616e20426c6f636b2d53697a65204b6579202d2048617368204b6579204669727374',
    '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598'],
  [7, 'aa'.repeat(131),
    '5468697320697320612074657374207573696e672061206c6172676572207468616e20626c6f636b2d73697a65206b657920616e642061206c6172676572207468616e20626c6f636b2d73697a6520646174612e20546865206b6579206e6565647320746f20626520686173686564206265666f7265206265696e6720757365642062792074686520484d414320616c676f726974686d2e',
    'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58'],
];

for (const [n, key, data, expected] of RFC4231) {
  test(`hmacSha512 RFC 4231 test case ${n}`, () => {
    const mac = bytesToHex(hmacSha512(hexToBytes(key), hexToBytes(data)));
    if (expected.length < 128) assert.equal(mac.slice(0, expected.length), expected);
    else assert.equal(mac, expected);
  });
}

test('hmacSha512 agrees with node:crypto for short, block-size and long keys', () => {
  const rnd = createRandom(4231);
  for (const keyLength of [0, 1, 32, 127, 128, 129, 300]) {
    for (const dataLength of [0, 17, 128, 333]) {
      const key = rnd.bytes(keyLength);
      const data = rnd.bytes(dataLength);
      const expected = createHmac('sha512', key).update(data).digest('hex');
      assert.equal(bytesToHex(hmacSha512(key, data)), expected, `key ${keyLength}, data ${dataLength}`);
    }
  }
});

test('hmacSha512 accepts strings as UTF-8', () => {
  assert.equal(bytesToHex(hmacSha512('Jefe', 'what do ya want for nothing?')), RFC4231[1][3]);
});

test('pbkdf2HmacSha512 agrees with node:crypto (iterations, multi-block output, empty inputs)', () => {
  const rnd = createRandom(8018);
  const cases = [
    [rnd.bytes(12), rnd.bytes(16), 1, 64],
    [rnd.bytes(12), rnd.bytes(16), 2, 64],
    [rnd.bytes(0), rnd.bytes(0), 3, 32],
    [rnd.bytes(200), rnd.bytes(40), 2048, 64],
    [rnd.bytes(33), rnd.bytes(8), 10, 150],
    [rnd.bytes(5), rnd.bytes(130), 7, 1],
  ];
  for (const [password, salt, iterations, dkLen] of cases) {
    const expected = pbkdf2Sync(password, salt, iterations, dkLen, 'sha512').toString('hex');
    const derived = pbkdf2HmacSha512(password, salt, iterations, dkLen);
    assert.equal(derived.length, dkLen);
    assert.equal(bytesToHex(derived), expected, `c = ${iterations}, dkLen = ${dkLen}`);
  }
});

test('pbkdf2HmacSha512 rejects invalid parameters', () => {
  assert.throws(() => pbkdf2HmacSha512('p', 's', 0, 64), /iterations/);
  assert.throws(() => pbkdf2HmacSha512('p', 's', 1, 0), /length/);
});
