/**
 * The Titanic data set (Dawson, 1995; the table Titanic of the R package
 * datasets): the 2,201 people aboard, cross-classified by travel class, sex and
 * outcome. Only the two-way margins used by the homework are kept: each row of
 * a table lists the people who died and the people who survived.
 *
 * The data set is published as counts. `records()` expands a table into one
 * record per person, so that the contingency table of the page is constructed
 * from a bivariate sample (X, F) and not copied from the counts; the order of
 * the records carries no information.
 */

import { expandRecords } from '../lib/independence.js';

export const OUTCOMES = Object.freeze(['Died', 'Survived']);

export const CLASSES = Object.freeze({
  xName: 'Class',
  fName: 'Outcome',
  xLevels: Object.freeze(['First', 'Second', 'Third', 'Crew']),
  fLevels: OUTCOMES,
  counts: Object.freeze([
    Object.freeze([122, 203]),
    Object.freeze([167, 118]),
    Object.freeze([528, 178]),
    Object.freeze([673, 212]),
  ]),
});

export const SEX = Object.freeze({
  xName: 'Sex',
  fName: 'Outcome',
  xLevels: Object.freeze(['Male', 'Female']),
  fLevels: OUTCOMES,
  counts: Object.freeze([Object.freeze([1364, 367]), Object.freeze([126, 344])]),
});

/** One record { x, f } per person of a data set. */
export function records(dataset) {
  return expandRecords(dataset.counts, dataset.xLevels, dataset.fLevels);
}
