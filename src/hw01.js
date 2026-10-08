/**
 * Entry point of homework 01. The shared read-mode styles and figure
 * enhancement come from homework.js; this adds the homework's own figures:
 * the group-law construction, the live hash demonstration and the
 * re-samplable experiment charts.
 */

import './homework.js';
import './styles/hw01.css';

import { mountGroupLaw } from './hw01/group-law.js';
import { mountDemo } from './hw01/demo.js';
import { mountChartFigures } from './hw01/figures.js';

for (const figure of document.querySelectorAll('[data-group-law]')) {
  try {
    mountGroupLaw(figure);
  } catch (error) {
    console.error(error);
  }
}

for (const figure of document.querySelectorAll('[data-demo]')) {
  try {
    mountDemo(figure);
  } catch (error) {
    console.error(error);
  }
}

mountChartFigures();
