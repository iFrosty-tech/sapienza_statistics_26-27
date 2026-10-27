/**
 * Homework register: the single source for the homepage table and for the
 * header of each homework page.
 *
 * Entry shape:
 * {
 *   number: 1,                         // integer; page lives at homework/01/
 *   label: 'Homework 1 · Exercise 1',  // optional; full name (default 'Homework 1')
 *   shortLabel: '1.1',                 // optional; boxed number, sheet code and register
 *                                      //   cell (default '01')
 *   title: 'Title of the assignment',
 *   abstract: 'One or two sentences summarising the work.',
 *   topics: ['Topic', 'Topic'],
 *   published: '2026-10-15',           // ISO date (publication or due date)
 *   status: 'published',               // 'published' | 'upcoming'
 * }
 *
 * A published entry requires the folder homework/NN/index.html, and every
 * homework folder (except those starting with "_") requires an entry here;
 * the build fails otherwise. The labels name an entry but never change its
 * address: homework/NN/ always follows the number, so a published URL stays
 * the same when an assignment is renamed. An upcoming entry needs no folder
 * and is listed in the register without a link.
 */
export default [
  {
    number: 1,
    label: 'Homework 1 · Exercise 1',
    shortLabel: '1.1',
    title: 'From private key to public key: scalar multiplication on a toy elliptic curve',
    abstract:
      'A private key k is turned into a public key Q = kG on the toy curve y² = x³ + 7 over the field of 17 elements, first by repeated point addition and then by double-and-add, and the algorithm is replayed slowly on the finite lattice of the curve. The resulting points are then explored statistically on a ladder of curves up to secp256k1, the curve of Ethereum, with Keccak-256 as the hash baseline, to separate the properties a one-way function needs from those expected of a hash.',
    topics: ['Elliptic-curve cryptography', 'One-way functions', 'Randomness testing', 'Ethereum'],
    published: '2026-10-08',
    status: 'published',
  },
  {
    number: 2,
    label: 'Homework 1 · Exercise 2',
    shortLabel: '1.2',
    title: 'From wallet seed to Ethereum address: hashing, key derivation and cryptographic primitives',
    abstract:
      'The Ethereum wallet pipeline from a BIP-39 mnemonic to an EIP-55 checksummed address is implemented from the standards, checked against published test vectors, and each of its stages is tested against the statistical laws that an ideal construction would obey.',
    topics: ['Key derivation', 'Hash functions', 'Elliptic-curve cryptography', 'Checksums and encodings'],
    published: '2026-10-09',
    status: 'published',
  },
  {
    number: 3,
    label: 'Homework 2',
    shortLabel: '2',
    title: 'Toy elliptic-curve encryption and the Caesar cipher: key spaces and statistical cryptanalysis',
    abstract:
      'A hashed EC-ElGamal scheme on secp256k1 with private keys restricted to a small range is set against the Caesar cipher. The Caesar key is recovered by letter-frequency χ² and n-gram scoring, with the success rate measured as a function of ciphertext length, while the toy scheme falls to a search of its restricted key space, an attack that owes nothing to the statistics of the plaintext.',
    topics: ['Elliptic-curve cryptography', 'Classical ciphers', 'Cryptanalysis', 'Statistical inference'],
    published: '2026-10-19',
    status: 'published',
  },
  {
    number: 4,
    label: 'Homework 3',
    shortLabel: '3',
    title: 'Random walks of penetration scores: the law of large numbers and the central limit theorem',
    abstract:
      'The penetration of n systems by each of m attackers is modelled as a random walk with independent Bernoulli or Rademacher increments. Simulated trajectories of the total, average and normalised scores are set against their exact laws to show the convergence in probability of the average, the three regimes of the variance under the different normalisations and the convergence of the normalised Rademacher score to the standard normal law.',
    topics: ['Random walks', 'Law of large numbers', 'Central limit theorem', 'Monte Carlo simulation'],
    published: '2026-10-27',
    status: 'upcoming',
  },
];
