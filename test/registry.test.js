/**
 * The homework register: optional display labels, their defaults, their
 * validation, and the guarantee that a label never changes a page's address
 * (homework/NN/ always follows the entry number).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryLabels, renderRegister, validateRegistry } from '../src/build/site-plugin.js';

const entry = (overrides = {}) => ({
  number: 1,
  title: 'A title',
  abstract: 'An abstract.',
  topics: ['Topic'],
  published: '2026-10-08',
  status: 'published',
  ...overrides,
});
const pages = [{ name: '01', number: 1 }];

test('an entry without labels is labelled by its number', () => {
  assert.deepEqual(entryLabels(entry()), { label: 'Homework 1', shortLabel: '01' });
  assert.deepEqual(entryLabels(entry({ number: 12 })), { label: 'Homework 12', shortLabel: '12' });
});

test('custom labels replace the defaults', () => {
  assert.deepEqual(entryLabels(entry({ label: 'Homework 1 · Exercise 1', shortLabel: '1.1' })), {
    label: 'Homework 1 · Exercise 1',
    shortLabel: '1.1',
  });
});

test('a short label changes the register number, not the address', () => {
  const html = renderRegister([entry({ label: 'Homework 1 · Exercise 1', shortLabel: '1.1' })], '/base/');
  assert.match(html, /href="\/base\/homework\/01\/"/);
  assert.match(html, /<th scope="row" class="register__no"[^>]*>.*1\.1.*<\/th>/);
  assert.match(html, /<span class="visually-hidden">Homework 1 · Exercise 1<\/span>/);
  assert.doesNotMatch(html, /homework\/1\.1\//);
});

test('an entry without labels keeps the two-digit register number', () => {
  const html = renderRegister([entry()], '/');
  assert.match(html, /<span aria-hidden="true"[^>]*>01<\/span>/);
  assert.match(html, /<span class="visually-hidden">Homework 1<\/span>/);
});

test('an upcoming entry without a page is valid and is not linked', () => {
  const upcoming = entry({ number: 3, status: 'upcoming', label: 'Homework 2', shortLabel: '2' });
  assert.doesNotThrow(() => validateRegistry([entry(), upcoming], pages));
  const html = renderRegister([upcoming], '/');
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /register__pending-title/);
});

test('labels must be non-empty strings when present', () => {
  assert.doesNotThrow(() => validateRegistry([entry({ label: 'Homework 1 · Exercise 1', shortLabel: '1.1' })], pages));
  assert.throws(() => validateRegistry([entry({ label: 3 })], pages), /label must be a non-empty string/);
  assert.throws(() => validateRegistry([entry({ label: '  ' })], pages), /label must be a non-empty string/);
  assert.throws(() => validateRegistry([entry({ shortLabel: '' })], pages), /shortLabel must be a non-empty string/);
  assert.throws(() => validateRegistry([entry({ shortLabel: 11 })], pages), /shortLabel must be a non-empty string/);
});
