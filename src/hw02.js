/**
 * Entry point of homework 02. The shared read-mode styles come from
 * homework.js and the figure and table vocabulary from hw01.css; this adds the
 * homework's own styles and enhances its figures. Every figure is complete
 * static HTML before this runs, and each mount is isolated, so a failure
 * leaves that figure as printed.
 *
 * Mount points of the interactive figures (attribute on the <figure>, data
 * embedded by the build):
 *   [data-pipeline]  the pipeline ledger, values in [data-pipeline-value]
 *   [data-explorer]  the live explorer: [data-explorer-form] (hidden until mounted), [data-explorer-out]
 *   [data-bip39]     the BIP-39 bit grouping, [data-bip39-word]
 *   [data-hdtree]    the HD tree, <script data-hdtree-model> (trunk, leaves, xpub of the change node)
 *   [data-keccak3d]  the Keccak state lattice, <script data-keccak3d-trace> (masks of every step)
 *   [data-eip55]     the EIP-55 breakdown, <script data-eip55-breakdown>
 *   [data-timeline]  the timeline, [data-timeline-event]
 *   [data-digests]   the digest comparator, [data-digests-controls] (hidden until mounted), [data-digest]
 */

import './homework.js';
import './styles/hw01.css';
import './styles/hw02.css';

import { mountChartFigures } from './hw02/figures.js';
import { mountPipeline } from './hw02/pipeline.js';
import { mountExplorer } from './hw02/explorer.js';
import { mountBip39 } from './hw02/bip39-figure.js';
import { mountHdTree } from './hw02/hdtree.js';
import { mountKeccak3d } from './hw02/keccak3d.js';
import { mountEip55 } from './hw02/eip55.js';
import { mountTimeline } from './hw02/timeline-figure.js';
import { mountDigests } from './hw02/digests.js';

/** [selector, mount] pairs for the interactive figures listed above. */
const MOUNTS = [
  ['[data-pipeline]', mountPipeline],
  ['[data-explorer]', mountExplorer],
  ['[data-bip39]', mountBip39],
  ['[data-hdtree]', mountHdTree],
  ['[data-keccak3d]', mountKeccak3d],
  ['[data-eip55]', mountEip55],
  ['[data-timeline]', mountTimeline],
  ['[data-digests]', mountDigests],
];

for (const [selector, mount] of MOUNTS) {
  for (const figure of document.querySelectorAll(selector)) {
    try {
      mount(figure);
    } catch (error) {
      console.error(error);
    }
  }
}

mountChartFigures();
