/**
 * Figure 4, the HD tree. The path m → 44' → 60' → 0' → 0 → i draws edge by
 * edge (hardened edges are double rules, normal edges single rules); the
 * leaf selector redraws the last edge. "Recover the parent private key"
 * demonstrates the caveat of BIP-32: with the extended public key of
 * m/44'/60'/0'/0 and the private key of its normal child i,
 *   k_par = k_i − I_L (mod n),  I_L = left half of HMAC-SHA512(c_par, K_par ‖ ser32(i)),
 * and the recovered key is printed next to the true one.
 *
 * The build prints two drawings of the same tree, a wide one and a compact
 * one for phones, and CSS shows one of them; marks apply to both, and the
 * animations run on the one on screen.
 */

import { ckdPriv, parseExtendedKey, recoverParentPrivateKey } from '../lib/bip32.js';
import { hmacSha512 } from '../lib/sha512.js';
import { bytesEqual, bytesToHex, concatBytes } from '../lib/bytes.js';
import { EASE_OUT, animationGroup, announce, blink, deferMount, drawStroke, exampleAccount, inViewport, onFirstView, reducedMotion } from './motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EDGE_MS = 230;

function ser32(i) {
  return Uint8Array.from([(i >>> 24) & 0xff, (i >>> 16) & 0xff, (i >>> 8) & 0xff, i & 0xff]);
}

/** Mounted when the figure comes near the viewport (see deferMount). */
export const mountHdTree = deferMount(mountHdTreeNow);

function mountHdTreeNow(figure) {
  const canvas = figure.querySelector('[data-hdtree-canvas]');
  const svgs = [...(canvas?.querySelectorAll('svg.hdtree') ?? [])];
  const modelScript = canvas?.querySelector('[data-hdtree-model]');
  if (!svgs.length || !modelScript) throw new Error('HD tree: missing the SVG or its model.');
  /** The drawing on screen (the other one is display: none). */
  const shown = () => svgs.find((s) => s.getClientRects().length > 0) ?? svgs[0];
  const model = JSON.parse(modelScript.textContent);
  const status = figure.querySelector('[data-hdtree-status]');
  const radios = [...figure.querySelectorAll('[data-hdtree-index]')];
  const leakButton = figure.querySelector('[data-hdtree-leak]');
  const leakOut = figure.querySelector('[data-hdtree-leak-out]');
  const trunkEdges = model.trunk.length - 1;
  const group = animationGroup();
  const leakGroup = animationGroup();
  let selected = 0;
  let hasRun = false;

  const edge = (k, svg = shown()) => svg.querySelector(`[data-hdtree-edge="${k}"]`);
  const node = (path, svg = shown()) => svg.querySelector(`[data-hdtree-node="${CSS.escape(path)}"]`);
  const leafEdge = (j, svg = shown()) => edge(trunkEdges + j, svg);

  function mark() {
    for (const svg of svgs) {
      model.leaves.forEach((leaf, j) => {
        const on = j === selected;
        leafEdge(j, svg)?.classList.toggle('is-dim', !on);
        node(leaf.path, svg)?.classList.toggle('is-dim', !on);
        node(leaf.path, svg)?.classList.toggle('is-selected', on);
      });
    }
  }

  function drawEdge(g, delay) {
    for (const line of g?.querySelectorAll('line') ?? []) group.add(drawStroke(line, { delay, duration: EDGE_MS }));
  }

  function appear(el, delay) {
    group.add(el?.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { delay, duration: 200, easing: EASE_OUT, fill: 'backwards' }));
  }

  function play() {
    group.reset();
    hasRun = true;
    figure.classList.remove('is-primed');
    mark();
    const leaf = model.leaves[selected];
    const text = `Path ${leaf.path}: three hardened derivations, then two normal ones; address ${leaf.address}.`;
    if (reducedMotion()) {
      blink(shown());
      announce(status, text);
      return;
    }
    for (let k = 0; k < trunkEdges; k += 1) {
      const t = k * (EDGE_MS + 40);
      drawEdge(edge(k), t);
      appear(node(model.trunk[k + 1].path), t + EDGE_MS - 60);
    }
    const t = trunkEdges * (EDGE_MS + 40);
    model.leaves.forEach((l, j) => {
      if (j === selected) {
        drawEdge(leafEdge(j), t);
        appear(node(l.path), t + EDGE_MS - 60);
      } else {
        group.add(leafEdge(j)?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + EDGE_MS, duration: 200, fill: 'backwards' }));
        group.add(node(l.path)?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: t + EDGE_MS, duration: 200, fill: 'backwards' }));
      }
    });
    announce(status, text);
  }

  function select(j) {
    if (j === selected) return;
    selected = j;
    clearLeak();
    mark();
    const leaf = model.leaves[j];
    if (reducedMotion()) blink(node(leaf.path));
    else {
      group.reset();
      drawEdge(leafEdge(j), 0);
      appear(node(leaf.path), EDGE_MS - 60);
    }
    announce(status, `Leaf ${leaf.path}, address ${leaf.address}.`);
  }

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (radio.checked) select(Number(radio.value));
    });
  }
  figure.querySelector('[data-hdtree-replay]')?.addEventListener('click', play);

  /* ------------------------------------------------- the leak demonstration */

  const out = (key) => leakOut?.querySelector(`[data-leak="${key}"]`);
  const placeholders = new Map();
  for (const el of leakOut?.querySelectorAll('[data-leak]') ?? []) placeholders.set(el.dataset.leak, el.textContent);

  function clearLeak() {
    leakGroup.reset();
    for (const svg of svgs) {
      svg.querySelector('.hdtree__leak')?.remove();
      node(model.trunk.at(-1).path, svg)?.classList.remove('is-recovered');
    }
    for (const [key, text] of placeholders) {
      const el = out(key);
      if (el) el.textContent = text;
    }
    leakOut?.classList.remove('is-shown');
  }

  function leak() {
    clearLeak();
    const i = selected;
    const account = exampleAccount();
    const parentPrivate = account.chain.at(-2).node; // m/44'/60'/0'/0, from the seed
    const child = ckdPriv(parentPrivate, i);
    const parentPublic = parseExtendedKey(model.xpubChange);
    const IL = hmacSha512(parentPublic.chainCode, concatBytes(parentPublic.publicKey, ser32(i))).subarray(0, 32);
    const recovered = recoverParentPrivateKey(parentPublic, child.privateKey, i);
    const equal = bytesEqual(recovered, parentPrivate.privateKey);

    const print = () => {
      out('child').textContent = bytesToHex(child.privateKey);
      out('il').textContent = bytesToHex(IL);
      out('recovered').textContent = bytesToHex(recovered);
      out('true').textContent = bytesToHex(parentPrivate.privateKey);
      out('equal').textContent = equal ? 'Yes: the two keys are identical' : 'No';
      leakOut.classList.add('is-shown');
      for (const svg of svgs) node(model.trunk.at(-1).path, svg)?.classList.add('is-recovered');
      blink(leakOut);
      announce(status, `Parent private key of ${model.changePath} recovered from its extended public key and the private key of child ${i}; ${equal ? 'it equals' : 'it differs from'} the key derived from the seed.`);
    };

    // An arrow travels up the normal edge, from the leaf to its parent.
    const svg = shown();
    const line = leafEdge(i, svg)?.querySelector('line');
    if (!line || reducedMotion()) {
      print();
      return;
    }
    const x1 = line.x2.baseVal.value;
    const y1 = line.y2.baseVal.value;
    const x2 = line.x1.baseVal.value;
    const y2 = line.y1.baseVal.value;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'hdtree__leak');
    g.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'line');
    path.setAttribute('class', 'hdtree__leak-line');
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) path.setAttribute(k, v.toFixed(1));
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = document.createElementNS(SVG_NS, 'path');
    head.setAttribute('class', 'hdtree__leak-head');
    const hx = (a, r) => (x2 + r * Math.cos(a)).toFixed(1);
    const hy = (a, r) => (y2 + r * Math.sin(a)).toFixed(1);
    head.setAttribute('d', `M${hx(angle + Math.PI - 0.5, 8)} ${hy(angle + Math.PI - 0.5, 8)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${hx(angle + Math.PI + 0.5, 8)} ${hy(angle + Math.PI + 0.5, 8)}`);
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', 'hdtree__leak-dot');
    dot.setAttribute('r', '4.5');
    dot.setAttribute('cx', '0');
    dot.setAttribute('cy', '0');
    g.append(path, head, dot);
    svg.querySelector('.hdtree__layer--nodes')?.before(g);
    const travel = 720;
    leakGroup.add(drawStroke(path, { duration: travel }));
    leakGroup.add(head.animate([{ opacity: 0 }, { opacity: 1 }], { delay: travel - 80, duration: 120, fill: 'backwards' }));
    const move = leakGroup.add(
      dot.animate([{ transform: `translate(${x1}px, ${y1}px)` }, { transform: `translate(${x2}px, ${y2}px)` }], { duration: travel, easing: EASE_OUT, fill: 'both' }),
    );
    const token = leakGroup.current();
    move.finished.then(
      () => {
        if (leakGroup.current() === token) print();
      },
      () => {},
    );
  }

  leakButton?.addEventListener('click', () => {
    try {
      leak();
    } catch (error) {
      console.error(error);
      announce(status, 'The recovery could not be computed in this browser.');
    }
  });

  for (const controls of figure.querySelectorAll('[data-hdtree-controls]')) controls.hidden = false;
  if (leakOut) leakOut.hidden = false;
  mark();
  figure.classList.add('is-live');
  if (!reducedMotion() && 'IntersectionObserver' in globalThis && !inViewport(canvas)) figure.classList.add('is-primed');
  onFirstView(canvas, () => {
    if (!hasRun) play();
  });
  return { play };
}
