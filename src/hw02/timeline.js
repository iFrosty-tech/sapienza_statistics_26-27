/**
 * Dated events of the historical context (§5): public-key cryptography, the
 * hash standards, the wallet standards and the two entropy failures of §7.
 * Every date was verified against the source named in `source` (research
 * notes of homework 02); where a technology has a draft or preliminary date
 * and a final one, both are kept: `first` is the earlier one.
 *
 * `assignment` is the date given in the assignment text, for Table 5.
 */

/** @typedef {{ date: string, label: string }} DatedLabel */

/**
 * @type {readonly { id: string, title: string, detail: string, date: string, dateLabel: string,
 *   first?: { date: string, label: string, dateLabel: string }, kind: 'public-key' | 'hash' | 'wallet' | 'ethereum' | 'failure',
 *   assignment?: string, source: string }[]}
 */
export const TIMELINE = Object.freeze([
  {
    id: 'dh',
    title: 'Diffie and Hellman, "New directions in cryptography"',
    detail: 'IEEE Transactions on Information Theory 22(6)',
    date: '1976-11',
    dateLabel: 'Nov 1976',
    kind: 'public-key',
    source: 'DH1976',
  },
  {
    id: 'rsa',
    title: 'RSA (Rivest, Shamir, Adleman)',
    detail: 'MIT technical memo MIT-LCS-TM-082; Communications of the ACM 21(2)',
    first: { date: '1977-04', label: 'memo', dateLabel: 'Apr 1977' },
    date: '1978-02',
    dateLabel: 'Feb 1978',
    kind: 'public-key',
    assignment: '1977',
    source: 'RSA1978',
  },
  {
    id: 'miller',
    title: 'Miller, "Use of Elliptic Curves in Cryptography"',
    detail: 'CRYPTO ’85; proceedings published in 1986',
    first: { date: '1985', label: 'conference', dateLabel: '1985' },
    date: '1986',
    dateLabel: '1986',
    kind: 'public-key',
    source: 'Miller1986',
  },
  {
    id: 'koblitz',
    title: 'Koblitz, "Elliptic curve cryptosystems"',
    detail: 'Mathematics of Computation 48(177)',
    date: '1987',
    dateLabel: '1987',
    kind: 'public-key',
    source: 'Koblitz1987',
  },
  {
    id: 'sec2-v1',
    title: 'SEC 2 version 1.0: first publication of secp256k1',
    detail: 'Certicom Research, Standards for Efficient Cryptography',
    date: '2000-09-20',
    dateLabel: '20 Sep 2000',
    kind: 'public-key',
    source: 'SEC2',
  },
  {
    id: 'fips180-2',
    title: 'FIPS 180-2: SHA-256, SHA-384 and SHA-512 (SHA-2)',
    detail: 'Draft announced 30 May 2001; final standard 1 August 2002',
    first: { date: '2001-05-30', label: 'draft', dateLabel: '30 May 2001' },
    date: '2002-08-01',
    dateLabel: '1 Aug 2002',
    kind: 'hash',
    assignment: '2001',
    source: 'NIST-FIPS180-2',
  },
  {
    id: 'sha3-competition',
    title: 'NIST announces the SHA-3 competition',
    detail: 'Public competition for a new hash standard',
    date: '2007-11-02',
    dateLabel: '2 Nov 2007',
    kind: 'hash',
    source: 'NIST-SHA3',
  },
  {
    id: 'sec2',
    title: 'SEC 2 version 2.0: secp256k1 domain parameters',
    detail: 'Certicom Research, Standards for Efficient Cryptography',
    date: '2010-01-27',
    dateLabel: '27 Jan 2010',
    kind: 'public-key',
    source: 'SEC2',
  },
  {
    id: 'bip32',
    title: 'BIP-32: hierarchical deterministic wallets',
    detail: 'Assigned 11 February 2012',
    date: '2012-02-11',
    dateLabel: '11 Feb 2012',
    kind: 'wallet',
    assignment: '2012',
    source: 'BIP32',
  },
  {
    id: 'keccak-selected',
    title: 'Keccak selected as the winner of the SHA-3 competition',
    detail: 'NIST announcement',
    date: '2012-10-02',
    dateLabel: '2 Oct 2012',
    kind: 'hash',
    source: 'NIST-SHA3',
  },
  {
    id: 'bip39',
    title: 'BIP-39: mnemonic code for generating deterministic keys',
    detail: 'Assigned 10 September 2013',
    date: '2013-09-10',
    dateLabel: '10 Sep 2013',
    kind: 'wallet',
    assignment: '2013',
    source: 'BIP39',
  },
  {
    id: 'whitepaper',
    title: 'Ethereum whitepaper',
    detail: 'Dated by ethereum.org',
    date: '2013-11-27',
    dateLabel: '27 Nov 2013',
    kind: 'ethereum',
    source: 'EthereumOrg',
  },
  {
    id: 'bip44',
    title: 'BIP-44: multi-account hierarchy for deterministic wallets',
    detail: 'Assigned 24 April 2014',
    date: '2014-04-24',
    dateLabel: '24 Apr 2014',
    kind: 'wallet',
    assignment: '2014',
    source: 'BIP44',
  },
  {
    id: 'fips202',
    title: 'FIPS 202: the SHA-3 standard',
    detail: 'Draft May 2014; final standard 4 August 2015',
    first: { date: '2014-05', label: 'draft', dateLabel: 'May 2014' },
    date: '2015-08-04',
    dateLabel: '4 Aug 2015',
    kind: 'hash',
    assignment: '2015',
    source: 'NIST-SHA3',
  },
  {
    id: 'slip44',
    title: 'SLIP-0044: registered coin types (60 = Ether)',
    detail: 'Created 9 July 2014',
    date: '2014-07-09',
    dateLabel: '9 Jul 2014',
    kind: 'wallet',
    source: 'SLIP44',
  },
  {
    id: 'frontier',
    title: 'Ethereum mainnet launch (Frontier)',
    detail: 'Uses Keccak-256 as submitted to the competition, not FIPS 202',
    date: '2015-07-30',
    dateLabel: '30 Jul 2015',
    kind: 'ethereum',
    source: 'EthereumOrg',
  },
  {
    id: 'fips180-4',
    title: 'FIPS 180-4: Secure Hash Standard (August 2015 revision, the edition cited)',
    detail: 'Specifies SHA-1 and the SHA-2 family, SHA-512 included',
    date: '2015-08',
    dateLabel: 'Aug 2015',
    kind: 'hash',
    source: 'FIPS180-4',
  },
  {
    id: 'eip55',
    title: 'EIP-55: mixed-case checksum address encoding',
    detail: 'Created 14 January 2016 (now ERC-55)',
    date: '2016-01-14',
    dateLabel: '14 Jan 2016',
    kind: 'ethereum',
    assignment: '2016',
    source: 'EIP55',
  },
  {
    id: 'profanity',
    title: 'Profanity vanity-address generator: vulnerability disclosed',
    detail: '32-bit seed for 256-bit private keys (1inch disclosure)',
    date: '2022-09-15',
    dateLabel: '15 Sep 2022',
    kind: 'failure',
    source: '1inch2022',
  },
  {
    id: 'milksad',
    title: 'Milk Sad: Libbitcoin Explorer "bx seed" disclosure (CVE-2023-39910)',
    detail: 'Mersenne Twister seeded with 32 bits',
    date: '2023-08-08',
    dateLabel: '8 Aug 2023',
    kind: 'failure',
    source: 'MilkSad2023',
  },
].sort((a, b) => (a.first?.date ?? a.date).localeCompare(b.first?.date ?? b.date)));

/** Fractional year of an ISO date, a year-month or a year. */
export function fractionalYear(date) {
  const [y, m, d] = date.split('-').map(Number);
  if (m === undefined) return y + 0.5;
  if (d === undefined) return y + (m - 0.5) / 12;
  return y + (m - 1 + (d - 1) / 31) / 12;
}
