<a href="https://ifrosty-tech.github.io/sapienza_statistics_26-27/"><img src=".github/readme/sheet.svg" width="100%" alt="The opening sheet of the portfolio, printed on normal probability paper: the title Statistics, homework portfolio, academic year 2026/27; the author's title block (Marco Verri, MSc in Cybersecurity, Sapienza University of Rome); and Fig. 0, a simulated normal probability plot of 40 observations whose points fall along a fitted straight line."></a>

<p align="center">
  <a href="https://ifrosty-tech.github.io/sapienza_statistics_26-27/"><b>Read the portfolio</b></a>
  &nbsp;·&nbsp;
  <a href="https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/01/">Homework 1 · Exercise 1</a>
  &nbsp;·&nbsp;
  <a href="https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/02/">Homework 1 · Exercise 2</a>
  &nbsp;·&nbsp;
  <a href="https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/03/">Homework 2</a>
  &nbsp;·&nbsp;
  <a href="https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/04/">Homework 3</a>
  &nbsp;·&nbsp;
  <a href="#run-it-locally">Run it locally</a>
</p>

<p align="center">
  <a href="https://github.com/iFrosty-tech/sapienza_statistics_26-27/actions/workflows/deploy.yml"><img alt="Deploy status" src="https://img.shields.io/github/actions/workflow/status/iFrosty-tech/sapienza_statistics_26-27/deploy.yml?branch=main&style=flat-square&label=deploy&labelColor=1b2420"></a>
  <img alt="Node.js 24 or newer" src="https://img.shields.io/badge/node-%E2%89%A524-3a6b54?style=flat-square&labelColor=1b2420">
  <img alt="Vite 8" src="https://img.shields.io/badge/vite-8-3a6b54?style=flat-square&labelColor=1b2420">
  <img alt="Zero cryptographic dependencies" src="https://img.shields.io/badge/crypto%20dependencies-0-3a6b54?style=flat-square&labelColor=1b2420">
</p>

This repository hosts the homework portfolio for the *Statistics* course of the MSc in Cybersecurity at Sapienza University of Rome. Each assignment is published as a self-contained web page that combines a written report, typeset mathematics and interactive figures. Rather than treating cryptography as a black box, every primitive involved is implemented from its specification, validated against published test vectors, and then examined with the statistical tools developed in the course.

## Homework register

| No. | Assignment | Published | Status |
|:---:|------------|-----------|--------|
| **1.1** | **[From private key to public key: scalar multiplication on a toy elliptic curve](https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/01/)**<br><sub>A private key *k* is turned into a public key *Q = kG* on the toy curve *y² = x³ + 7* over the field of 17 elements, first by repeated point addition and then by double-and-add, and the algorithm is replayed slowly on the finite lattice of the curve. The resulting points are then explored statistically on a ladder of curves up to secp256k1, the curve of Ethereum, with Keccak-256 as the hash baseline, to separate the properties a one-way function needs from those expected of a hash.</sub><br><sub>Elliptic-curve cryptography · One-way functions · Randomness testing · Ethereum</sub> | 8 Oct 2026 | <img src=".github/readme/published.svg" width="10" height="10" alt=""> Published |
| **1.2** | **[From wallet seed to Ethereum address: hashing, key derivation and cryptographic primitives](https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/02/)**<br><sub>The Ethereum wallet pipeline from a BIP-39 mnemonic to an EIP-55 checksummed address is implemented from the standards, checked against published test vectors, and each of its stages is tested against the statistical laws that an ideal construction would obey.</sub><br><sub>Key derivation · Hash functions · Elliptic-curve cryptography · Checksums and encodings</sub> | 9 Oct 2026 | <img src=".github/readme/published.svg" width="10" height="10" alt=""> Published |
| **2** | **[Toy elliptic-curve encryption and the Caesar cipher: key spaces and statistical cryptanalysis](https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/03/)**<br><sub>A hashed EC-ElGamal scheme on secp256k1 with private keys restricted to a small range is set against the Caesar cipher. The Caesar key is recovered by letter-frequency χ² and n-gram scoring, with the success rate measured as a function of ciphertext length, while the toy scheme falls to a search of its restricted key space, an attack that owes nothing to the statistics of the plaintext.</sub><br><sub>Elliptic-curve cryptography · Classical ciphers · Cryptanalysis · Statistical inference</sub> | 19 Oct 2026 | <img src=".github/readme/published.svg" width="10" height="10" alt=""> Published |
| **3** | **[Random walks of penetration scores: the law of large numbers and the central limit theorem](https://ifrosty-tech.github.io/sapienza_statistics_26-27/homework/04/)**<br><sub>The penetration of *n* systems by each of *m* attackers is modelled as a random walk with independent Bernoulli or Rademacher increments. Simulated trajectories of the total, average and normalised scores are set against their exact binomial laws to show the convergence in probability of the average, the three regimes of the variance under the different normalisations and the convergence of the normalised Rademacher score to the standard normal law at the Berry–Esseen rate. The number of attackers sets the precision of the simulation and the aggregate score, while the number needed for one of them to penetrate an unusually large share of the systems grows exponentially with *n*.</sub><br><sub>Random walks · Law of large numbers · Central limit theorem · Monte Carlo simulation</sub> | 27 Oct 2026 | <img src=".github/readme/published.svg" width="10" height="10" alt=""> Published |

## Method

| Principle | In practice |
|-----------|-------------|
| **From the standards, not from a library** | SHA-256, SHA-512, Keccak-256, RIPEMD-160, secp256k1, BIP-32, BIP-39, Base58 and EIP-55 are written from scratch in plain JavaScript. |
| **Verified against test vectors** | The primitives are checked against official test vectors by the Node.js test suite before any statistic is computed on them. |
| **Statistics in the browser** | Monte Carlo studies, goodness-of-fit tests and probability plots run client-side, with the heavy computation moved to Web Workers. |
| **Interactive figures** | Slow-motion replays of elliptic-curve arithmetic, 3D views of Keccak diffusion and an explorable hierarchical-deterministic key tree. |
| **Print-ready** | Mathematics is typeset with KaTeX at build time, and a dedicated print stylesheet turns each page into a clean paper. |

## The sheet

Every page of the site is printed on a sheet of normal probability paper, the one grid on which normally distributed data fall on a straight line. Its rulings are computed from the inverse normal distribution function, crowding towards the tails exactly as on the printed article; green belongs to the paper, red belongs to the data, and every simulated figure is labelled as simulated and states its seed. The opening image of this page is Fig. 0 of that sheet: a real probability plot of 40 simulated observations, drawn by the same code as the site and reproducible with `node .github/readme/generate.mjs`.

## Run it locally

Requirements: **Node.js 24** or newer.

```bash
npm install        # install dependencies
npm run dev        # start the development server
npm test           # run the test suite
npm run build      # produce the static site in dist/
npm run preview    # serve the production build locally
```

Every push to `main` is built and deployed to GitHub Pages by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## How it is built

```text
src/data/homeworks.js ─┐
partials/*.html        ├─▶ Vite + site plugin ─▶ dist/ ─▶ GitHub Pages
src/config/site.js    ─┘
```

- **`src/data/homeworks.js`** is the single source for the homepage register and the header of each assignment; the build fails if a published entry has no page, or a page has no entry.
- **`src/config/site.js`** holds the author and course details injected into every page.
- **`homework/_template/`** is the starting point for a new assignment.

<details>
<summary><b>Project structure</b></summary>

```text
.
├── homework/            # one folder per assignment (01, 02, …) plus a template
├── partials/            # shared HTML fragments: header, footer, metadata
├── public/              # static assets copied as they are
├── src/
│   ├── build/           # Vite plugin: partials, register checks, KaTeX
│   ├── config/          # site identity
│   ├── data/            # homework register and word lists
│   ├── hw01/  hw02/     # figures and interactions for each assignment
│   ├── lib/             # cryptographic primitives and statistical routines
│   └── styles/          # base, reading, print and per-homework styles
├── test/                # Node.js test suite
└── .github/
    ├── readme/          # generator and images of this page
    └── workflows/       # build and deployment to GitHub Pages
```

</details>

## Author

**Marco Verri** — software developer with five years of professional experience, currently enrolled in the MSc in Cybersecurity at Sapienza University of Rome.

This portfolio reflects the meeting point of both backgrounds: the engineering discipline of production software (tested, versioned and continuously deployed code) applied to the statistical analysis of the cryptographic building blocks that secure modern systems.

<br>

<img src=".github/readme/strip.svg" width="100%" alt="">
