/**
 * BIP-32 hierarchical deterministic keys.
 *
 * Vectors: BIP-32, "Test Vectors" 1 to 5
 * (https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki), parsed
 * from the raw mediawiki file into test/fixtures/bip32-vectors.json without
 * changing any value (the subscript H of the hardened indices is written ').
 * Vectors 1 to 4 list the extended private and public keys of every chain;
 * vector 5 lists extended keys that must be rejected as invalid.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HARDENED_OFFSET,
  parsePath,
  masterKeyFromSeed,
  masterKeyFromDigest,
  ckdPriv,
  ckdPub,
  neuter,
  derivePath,
  derivePathChain,
  serializeExtendedKey,
  parseExtendedKey,
  fingerprint,
  recoverParentPrivateKey,
} from '../src/lib/bip32.js';
import { bytesToHex, hexToBytes, bigIntToBytes, concatBytes } from '../src/lib/bytes.js';
import { N } from '../src/lib/secp256k1.js';

const { vectors: VECTORS, invalid: INVALID } = JSON.parse(
  readFileSync(new URL('./fixtures/bip32-vectors.json', import.meta.url), 'utf8'),
);

test('the fixture holds vectors 1 to 4 and the 16 invalid keys of vector 5', () => {
  assert.deepEqual(VECTORS.map((v) => [v.id, v.chains.length]), [[1, 6], [2, 6], [3, 2], [4, 3]]);
  assert.equal(INVALID.length, 16);
});

test('parsePath accepts the apostrophe and h/H for hardened indices', () => {
  assert.deepEqual(parsePath('m'), []);
  assert.deepEqual(parsePath("m/44'/60'/0'/0/0"), [44 + HARDENED_OFFSET, 60 + HARDENED_OFFSET, HARDENED_OFFSET, 0, 0]);
  assert.deepEqual(parsePath('m/44h/60H/0'), [44 + HARDENED_OFFSET, 60 + HARDENED_OFFSET, 0]);
  assert.deepEqual(parsePath('m/2147483647'), [2147483647]);
  for (const bad of ['', '44/0', 'm/', 'm//0', 'm/-1', 'm/2147483648', "m/0''", 'm/0x10', 'n/0']) {
    assert.throws(() => parsePath(bad), /path/, bad);
  }
});

for (const vector of VECTORS) {
  test(`test vector ${vector.id}: every chain, xprv and xpub`, () => {
    const master = masterKeyFromSeed(hexToBytes(vector.seed));
    for (const { path, xpub, xprv } of vector.chains) {
      const node = derivePath(master, path);
      assert.equal(serializeExtendedKey(node, 'xprv'), xprv, `${path} xprv`);
      assert.equal(serializeExtendedKey(node, 'xpub'), xpub, `${path} xpub`);
      assert.equal(serializeExtendedKey(neuter(node), 'xpub'), xpub, `${path} neutered xpub`);
    }
  });

  test(`test vector ${vector.id}: parseExtendedKey round-trips every listed key`, () => {
    for (const { xpub, xprv } of vector.chains) {
      const priv = parseExtendedKey(xprv);
      const pub = parseExtendedKey(xpub);
      assert.equal(serializeExtendedKey(priv, 'xprv'), xprv);
      assert.equal(serializeExtendedKey(priv, 'xpub'), xpub);
      assert.equal(serializeExtendedKey(pub, 'xpub'), xpub);
      assert.equal(pub.privateKey, null);
      assert.equal(bytesToHex(pub.publicKey), bytesToHex(priv.publicKey));
    }
  });
}

test('CKDpub of the parent xpub gives the listed xpub of every non-hardened child', () => {
  let checked = 0;
  for (const vector of VECTORS) {
    for (let i = 1; i < vector.chains.length; i += 1) {
      const { path, xpub } = vector.chains[i];
      const indices = parsePath(path);
      const last = indices.at(-1);
      if (last >= HARDENED_OFFSET) continue;
      const parent = parseExtendedKey(vector.chains[i - 1].xpub);
      assert.equal(serializeExtendedKey(ckdPub(parent, last), 'xpub'), xpub, path);
      checked += 1;
    }
  }
  assert.ok(checked >= 5);
});

test('a child records the fingerprint of its parent (first 4 bytes of HASH160 of the parent public key)', () => {
  const master = masterKeyFromSeed(hexToBytes(VECTORS[0].seed));
  const child = parseExtendedKey(VECTORS[0].chains[1].xprv);
  assert.equal(bytesToHex(child.parentFingerprint), bytesToHex(fingerprint(master.publicKey)));
  assert.equal(child.depth, 1);
  assert.equal(child.childIndex, HARDENED_OFFSET);
  assert.equal(bytesToHex(master.parentFingerprint), '00000000');
});

test('derivePathChain returns the master and every intermediate node', () => {
  const master = masterKeyFromSeed(hexToBytes(VECTORS[0].seed));
  const chain = derivePathChain(master, "m/0'/1/2'/2/1000000000");
  assert.deepEqual(
    chain.map((c) => c.path),
    ['m', "m/0'", "m/0'/1", "m/0'/1/2'", "m/0'/1/2'/2", "m/0'/1/2'/2/1000000000"],
  );
  assert.deepEqual(chain.map((c) => c.hardened), [false, true, false, true, false, false]);
  chain.forEach((c, k) => assert.equal(serializeExtendedKey(c.node, 'xprv'), VECTORS[0].chains[k].xprv));
});

test('ckdPub refuses hardened indices; ckdPriv and serialisation refuse neutered nodes', () => {
  const master = masterKeyFromSeed(hexToBytes(VECTORS[0].seed));
  const pub = neuter(master);
  assert.equal(pub.privateKey, null);
  assert.notEqual(master.privateKey, null, 'neuter does not alter its argument');
  assert.throws(() => ckdPub(pub, HARDENED_OFFSET), /hardened/);
  assert.throws(() => ckdPriv(pub, 0), /private/);
  assert.throws(() => serializeExtendedKey(pub, 'xprv'), /private/);
  assert.throws(() => derivePath(pub, "m/0'"), /hardened/);
  assert.equal(serializeExtendedKey(derivePath(pub, 'm/0/1'), 'xpub'), serializeExtendedKey(derivePath(master, 'm/0/1'), 'xpub'));
  assert.throws(() => ckdPriv(master, 2 ** 32), /index/);
});

test('masterKeyFromSeed accepts 128 to 512-bit seeds only', () => {
  assert.throws(() => masterKeyFromSeed(new Uint8Array(15)), /seed/);
  assert.throws(() => masterKeyFromSeed(new Uint8Array(65)), /seed/);
  assert.doesNotThrow(() => masterKeyFromSeed(new Uint8Array(16)));
});

test('a master digest with IL = 0 or IL ≥ n is rejected', () => {
  const chainCode = new Uint8Array(32).fill(7);
  assert.throws(() => masterKeyFromDigest(concatBytes(new Uint8Array(32), chainCode)), (e) => e.code === 'INVALID_KEY');
  assert.throws(() => masterKeyFromDigest(concatBytes(bigIntToBytes(N, 32), chainCode)), (e) => e.code === 'INVALID_KEY');
  assert.equal(masterKeyFromDigest(concatBytes(bigIntToBytes(N - 1n, 32), chainCode)).depth, 0);
});

for (const { key, reason } of INVALID) {
  test(`test vector 5 rejects: ${reason}`, () => {
    assert.throws(() => parseExtendedKey(key));
  });
}

test('the security caveat: a parent xpub plus one non-hardened child private key reveals the parent private key', () => {
  const vector = VECTORS[0];
  const parentPrv = parseExtendedKey(vector.chains[1].xprv); // m/0'
  const parentPub = parseExtendedKey(vector.chains[1].xpub);
  const child = parseExtendedKey(vector.chains[2].xprv); // m/0'/1, non-hardened
  const recovered = recoverParentPrivateKey(parentPub, child.privateKey, 1);
  assert.equal(bytesToHex(recovered), bytesToHex(parentPrv.privateKey));
  assert.throws(() => recoverParentPrivateKey(parentPub, child.privateKey, HARDENED_OFFSET), /hardened/);
  assert.throws(() => recoverParentPrivateKey(parentPub, child.privateKey, 2), /does not match/);
});
