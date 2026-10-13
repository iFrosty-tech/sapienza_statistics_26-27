/**
 * Homework register: the single source for the homepage table and for the
 * header of each homework page.
 *
 * Entry shape:
 * {
 *   number: 1,                         // integer; page lives at homework/01/
 *   title: 'Title of the assignment',
 *   abstract: 'One or two sentences summarising the work.',
 *   topics: ['Topic', 'Topic'],
 *   published: '2026-10-15',           // ISO date (publication or due date)
 *   status: 'published',               // 'published' | 'upcoming'
 * }
 *
 * A published entry requires the folder homework/NN/index.html, and every
 * homework folder (except those starting with "_") requires an entry here;
 * the build fails otherwise.
 */
export default [
  {
    number: 1,
    title: 'From private key to public key: scalar multiplication on a toy elliptic curve',
    abstract:
      'A private key k is turned into a public key Q = kG on the toy curve y² = x³ + 7 over the field of 17 elements, first by repeated point addition and then by double-and-add, and the algorithm is replayed slowly on the finite lattice of the curve. The resulting points are then explored statistically on a ladder of curves up to secp256k1, the curve of Ethereum, with Keccak-256 as the hash baseline, to separate the properties a one-way function needs from those expected of a hash.',
    topics: ['Elliptic-curve cryptography', 'One-way functions', 'Randomness testing', 'Ethereum'],
    published: '2026-10-08',
    status: 'published',
  },
  {
    number: 2,
    title: 'From wallet seed to Ethereum address: hashing, key derivation and cryptographic primitives',
    abstract:
      'The Ethereum wallet pipeline from a BIP-39 mnemonic to an EIP-55 checksummed address is implemented from the standards, checked against published test vectors, and each of its stages is tested against the statistical laws that an ideal construction would obey.',
    topics: ['Key derivation', 'Hash functions', 'Elliptic-curve cryptography', 'Checksums and encodings'],
    published: '2026-10-09',
    status: 'published',
  },
];
