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
    title: 'A toy hash function on secp256k1 and its statistical properties',
    abstract:
      'A hash function is built from scalar and point arithmetic on the Bitcoin curve secp256k1 and put on trial: its digests are tested for uniformity, independence and avalanche against the binomial and chi-square laws an ideal hash would obey, and the structural flaws that statistics cannot see are exposed. A survey of cryptography and statistics in the major blockchains closes the work.',
    topics: ['Elliptic-curve cryptography', 'Hash functions', 'Randomness testing', 'Blockchains'],
    published: '2026-10-08',
    status: 'published',
  },
];
