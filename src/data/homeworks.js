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
      'The penetration of n systems by each of m attackers is modelled as a random walk with independent Bernoulli or Rademacher increments. Simulated trajectories of the total, average and normalised scores are set against their exact binomial laws to show the convergence in probability of the average, the three regimes of the variance under the different normalisations and the convergence of the normalised Rademacher score to the standard normal law at the Berry–Esseen rate. The number of attackers sets the precision of the simulation and the aggregate score, while the number needed for one of them to penetrate an unusually large share of the systems grows exponentially with n.',
    topics: ['Random walks', 'Law of large numbers', 'Central limit theorem', 'Monte Carlo simulation'],
    published: '2026-10-27',
    status: 'published',
  },
  {
    number: 5,
    label: 'Homework 4 · Exercise 1',
    shortLabel: '4.1',
    title: 'Welford’s recurrences: the sum of squares and the variance in one pass',
    abstract:
      'Welford’s recurrences for the corrected sum of squares and the sample variance are derived step by step in the manner of Knuth’s recurrence for the mean, implemented in three lines of code and read geometrically: each observation adds the area of a rectangle to the sum of squares. Measured against the exact sum of squares, computed in rational arithmetic, the textbook formula loses every digit on ill-conditioned data and can return a negative value, whereas the error of the recurrence grows only in proportion to the condition number, in agreement with the published bounds. One pass, constant memory and running estimates, rather than rounding, are what recommend it for well-conditioned scores.',
    topics: ['Recurrence relations', 'Sample variance', 'Numerical stability', 'Streaming algorithms'],
    published: '2026-10-31',
    status: 'published',
  },
  {
    number: 6,
    label: 'Homework 4 · Exercise 2',
    shortLabel: '4.2',
    title: 'Sampling mean and variance: m hackers, n systems and scores between 0 and 10',
    abstract:
      'Each of m hackers receives a score between 0 and 10 on each of n systems, under a law that extends the Bernoulli increment of homework 3 and is far from normal. Welford’s recurrences give the sampling mean and variance of every trajectory, and their averages agree with the theoretical mean and variance at every n, because both estimators are unbiased, while the sum of squares divided by n is not. The spread of both estimators across hackers falls as 1/√n, the number of hackers buys precision of the averages only, and the 95% t-interval for the mean reaches its nominal level as n grows, whereas the χ² interval for the variance stalls near 0.86, because it rests on normality and not on a limit theorem.',
    topics: ['Sampling distributions', 'Unbiased estimation', 'Monte Carlo simulation', 'Statistical inference'],
    published: '2026-10-31',
    status: 'published',
  },
  {
    number: 7,
    label: 'Homework 5',
    shortLabel: '5',
    title: 'Riemann and Lebesgue integration, and the numerical computation of the normal distribution function',
    abstract:
      'The integral of seven functions is computed in the two ways in which it is defined, by Riemann sums over a partition of the domain and by Lebesgue sums over the preimages of a partition of the range, and the two are compared in accuracy, rate of convergence and cost. On smooth functions the midpoint rule converges as n⁻² and the Lebesgue sum as N⁻¹, on step functions the Lebesgue sum is exact, and on 1/√x only the midpoint and Lebesgue sums converge; the Dirichlet and Thomae functions separate Riemann integrability from Lebesgue integrability. The standard normal distribution function, which Liouville’s theorem shows to have no elementary expression, is then computed by quadrature, series, a continued fraction and the error function, and checked against a table from the web and against a reference of 80 digits.',
    topics: ['Riemann and Lebesgue integrals', 'Numerical integration', 'Special functions', 'Normal distribution'],
    published: '2026-11-12',
    status: 'published',
  },
  {
    number: 8,
    label: 'Homework 6',
    shortLabel: '6',
    title: 'Statistical independence: contingency tables, expected frequencies and the χ² test',
    abstract:
      'The contingency table of a bivariate sample (X, F) is constructed by program from the records of the 2,201 people aboard the Titanic, with class as X and outcome as F, and its joint, marginal and conditional frequencies are computed. The frequencies expected under independence give Pearson’s χ² statistic and its p-value, confirmed by a permutation test, and Cramér’s V measures the strength of the association, which is set against that of sex. The two variables are statistically dependent. The page recalls what independence means in probability and in statistics, and distinguishes the association found from a causal effect of class on survival.',
    topics: ['Contingency tables', 'Statistical independence', 'Chi-square test', 'Permutation tests', 'Association and causality'],
    published: '2026-11-16',
    status: 'published',
  },
  {
    number: 9,
    label: 'Homework 7',
    shortLabel: '7',
    title: 'Modes of convergence, the laws of large numbers and the central limit theorem, and Bayesian inference',
    abstract:
      'The four modes of convergence of probability theory (almost sure, in probability, in mean square and in distribution) are separated by sequences whose probabilities are computed exactly and checked by simulation, and the role of each is traced in the weak and strong laws of large numbers, the central limit theorem and the consistency and asymptotic normality of estimators. The factor √n is derived from the additivity of the variances of independent terms and shown to fail under correlation, where the spread of a sum grows as n and the mean no longer converges to its expectation. Conditional probability and Bayes’ theorem are then applied to a diagnostic test and to a proportion with a beta prior, showing how the prior, the likelihood and the posterior combine, how strongly the prior matters for small samples, and how little for large ones.',
    topics: ['Modes of convergence', 'Law of large numbers', 'Central limit theorem', 'Bayes’ theorem', 'Bayesian inference'],
    published: '2026-11-24',
    status: 'published',
  },
];
