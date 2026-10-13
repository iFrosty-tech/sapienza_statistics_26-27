/**
 * Generates the images used by README.md: the opening sheet (Fig. 0), the
 * probability strip printed at the foot of the page, and the status mark of the
 * homework register.
 *
 * The images reproduce the site's sheet of normal probability paper with the
 * same code the site uses: the plot is the real output of
 * `renderProbabilityPlotSVG` for a fixed seed, and every ruling is placed at
 * Φ⁻¹(p). The files must work inside an <img> on GitHub, so they are fully
 * self-contained: the two typefaces are embedded as data URIs, the styles are
 * inline and the entrance motion is CSS only, with the final frame as the
 * default state.
 *
 * Usage, from the repository root:
 *   node .github/readme/generate.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import site from '../../src/config/site.js';
import { invNorm, simulateProbabilityPlot } from '../../src/lib/normal.js';
import { MAJOR_P, MINOR_P, formatNumber, renderProbabilityPlotSVG } from '../../src/lib/probability-plot.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/* Tokens, from DESIGN.md. */
const C = {
  paper: '#f7faf8',
  paperDeep: '#edf3ef',
  ink: '#1b2420',
  inkSoft: '#46524c',
  inkFaint: '#5d6a63',
  ruling: '#9cc3ae',
  rulingMinor: '#d3e6da',
  rulingInk: '#3a6b54',
  plot: '#d0462f',
};
const FORM = "'Libre Franklin Variable', 'Libre Franklin', 'Franklin Gothic Medium', 'Arial Narrow', sans-serif";
const SERIF = "'Source Serif 4 Variable', 'Source Serif 4', 'Iowan Old Style', Georgia, serif";
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/* The sample shown on the opening sheet. */
const SEED = 2627;
const N = 40;

const W = 1280;
const H = 640;
const X0 = 48; // left trim of the content
const X1 = W - 48; // right trim of the content

function fontFace(family, file) {
  const data = readFileSync(join(ROOT, 'node_modules/@fontsource-variable', file)).toString('base64');
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:100 900;font-style:normal;}`;
}

const FONT_FORM = fontFace('Libre Franklin Variable', 'libre-franklin/files/libre-franklin-latin-wght-normal.woff2');
const FONT_SERIF = fontFace('Source Serif 4 Variable', 'source-serif-4/files/source-serif-4-latin-wght-normal.woff2');

const r1 = (v) => Math.round(v * 10) / 10;

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/*
 * Approximate advance widths of Libre Franklin, in em, used only to place the
 * caption's provenance tag after its title; the title is then fitted to the
 * estimate with textLength, so the tag never collides with it.
 */
const ADVANCE = {
  a: 0.55, b: 0.58, c: 0.5, d: 0.58, e: 0.55, f: 0.33, g: 0.56, h: 0.58, i: 0.26, j: 0.26,
  k: 0.53, l: 0.26, m: 0.87, n: 0.58, o: 0.57, p: 0.58, q: 0.58, r: 0.37, s: 0.47, t: 0.35,
  u: 0.58, v: 0.52, w: 0.78, x: 0.52, y: 0.52, z: 0.47, ' ': 0.25, '.': 0.26,
};
const textWidth = (s, size) => [...s].reduce((sum, ch) => sum + (ADVANCE[ch] ?? (/\d/.test(ch) ? 0.56 : 0.66)), 0) * size;

/* ---------------------------------------------------------------- strip */

/**
 * A strip of the probability scale, drawn as the site's sheet edge: rulings at
 * Φ⁻¹(p) rising from a printed baseline, minor rulings at half height, the
 * median and the baseline in printed green ink, and the labels 1–99 below.
 */
function probabilityStrip({ left, right, top, baseline, labelY }) {
  const zMin = invNorm(0.0001);
  const zMax = invNorm(0.9999);
  const x = (p) => left + ((invNorm(p / 100) - zMin) / (zMax - zMin)) * (right - left);
  const mid = (top + baseline) / 2;
  const out = [];
  for (const p of MINOR_P) {
    out.push(`<line x1="${r1(x(p))}" x2="${r1(x(p))}" y1="${mid}" y2="${baseline}" stroke="${C.rulingMinor}"/>`);
  }
  for (const p of MAJOR_P) {
    const stroke = p === 50 ? C.rulingInk : C.ruling;
    out.push(`<line x1="${r1(x(p))}" x2="${r1(x(p))}" y1="${top}" y2="${baseline}" stroke="${stroke}"/>`);
  }
  out.push(`<line x1="${left}" x2="${right}" y1="${baseline}" y2="${baseline}" stroke="${C.rulingInk}"/>`);
  for (const p of [1, 10, 50, 90, 99]) {
    out.push(`<text class="strip-label" x="${r1(x(p))}" y="${labelY}" text-anchor="middle">${p}</text>`);
  }
  return `<g stroke-width="1" aria-hidden="true">${out.join('')}</g>`;
}

function sheetNumber(x, y) {
  return `<text class="caption" x="${x}" y="${y}" text-anchor="end">Sheet <tspan class="sheet-no">00</tspan></text>`;
}

/* --------------------------------------------------------- title block */

function titleBlock({ x, y, width, rowHeight }) {
  const rows = [
    [
      ['Name', site.author, 160],
      ['Degree', site.degree, 260],
      ['Course', site.course, width - 420],
    ],
    [
      ['Academic year', site.academicYear, 160],
      ['University', site.university, width - 160],
    ],
  ];
  const height = rows.length * rowHeight + (rows.length - 1);
  const out = [`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${C.ruling}"/>`];
  rows.forEach((cells, r) => {
    let cx = x;
    const cy = y + r * (rowHeight + 1);
    cells.forEach(([caption, value, w], c) => {
      const cw = c === cells.length - 1 ? x + width - cx : w - 1;
      out.push(
        `<rect x="${cx}" y="${cy}" width="${cw}" height="${rowHeight}" fill="${C.paper}"/>`,
        `<text class="caption" x="${cx + 13}" y="${cy + 23}">${escapeXml(caption)}</text>`,
        `<text class="field" x="${cx + 13}" y="${cy + 49}">${escapeXml(value)}</text>`,
      );
      cx += cw + 1;
    });
  });
  out.push(
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>`,
  );
  return `<g>${out.join('')}</g>`;
}

/* --------------------------------------------------------------- plot */

/**
 * The real probability plot, with the site's entrance choreography written as
 * per-element animation delays: rulings from the median outward, points from
 * the centre of the distribution outward, the fitted line last.
 */
function animatedPlot(model, { width, height }) {
  let svg = renderProbabilityPlotSVG(model, { width, height, id: 'sheet-plot' });

  svg = svg.replace(/<line class="(pplot__ruling[^"]*)" data-rank="(\d+)"/g, (_, cls, rank) => {
    const delay = Math.min(Number(rank) * 42, 620);
    return `<line class="${cls}" data-rank="${rank}" style="animation-delay:${delay}ms"`;
  });

  const order = model.z.map((z, i) => ({ i, d: Math.abs(z) })).sort((a, b) => a.d - b.d);
  const delayOf = new Map(order.map(({ i }, k) => [i, 520 + Math.min(k * 14, 560)]));
  svg = svg.replace(/<circle class="pplot__point" data-i="(\d+)"/g, (_, i) => {
    return `<circle class="pplot__point" data-i="${i}" style="animation-delay:${delayOf.get(Number(i))}ms"`;
  });

  let fitLength = 0;
  svg = svg.replace(/<line class="pplot__fit" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/, (m, a, b, c, d) => {
    fitLength = Math.ceil(Math.hypot(Number(c) - Number(a), Number(d) - Number(b)));
    return `${m} stroke-dasharray="${fitLength}"`;
  });

  // The accessible name belongs to the whole sheet, not to the nested plot.
  svg = svg
    .replace(/ role="img" aria-labelledby="[^"]*"/, ' aria-hidden="true"')
    .replace(/<title id="[^"]*">[^<]*<\/title><desc id="[^"]*">[^<]*<\/desc>/, '');

  return { svg, fitLength };
}

function plotStyles(fitLength) {
  return `
.pplot__svg{overflow:visible;font-family:${FORM};}
.pplot__vline{stroke:${C.rulingMinor};stroke-width:1;}
.pplot__vline.is-major{stroke:${C.ruling};}
.pplot__ruling{stroke-width:1;transform-box:fill-box;transform-origin:center;}
.pplot__ruling.is-major{stroke:${C.ruling};}
.pplot__ruling.is-minor{stroke:${C.rulingMinor};}
.pplot__ruling.is-median{stroke:${C.rulingInk};stroke-width:1.25;}
.pplot__frame{fill:none;stroke:${C.rulingInk};stroke-width:1.25;}
.pplot__plabel{fill:${C.rulingInk};font-size:11px;font-weight:550;font-variant-numeric:tabular-nums lining-nums;}
.pplot__plabel.is-complement{font-weight:400;}
.pplot__xlabel{fill:${C.inkSoft};font-size:11px;font-weight:500;font-variant-numeric:tabular-nums lining-nums;}
.pplot__axis-title{fill:${C.rulingInk};font-size:10.5px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;}
.pplot__fit{stroke:${C.ink};stroke-width:1.25;stroke-linecap:round;}
.pplot__point{fill:${C.plot};stroke:${C.paper};stroke-width:1;transform-box:fill-box;transform-origin:center;}

.pplot__ruling{animation:sheet-rule 560ms ${EASE} backwards;}
.pplot__vline,.pplot__labels,.pplot__frame{animation:sheet-fade 520ms ${EASE} 160ms backwards;}
.pplot__point{animation:sheet-drop 540ms ${EASE} backwards;}
.pplot__fit{animation:sheet-draw 640ms ${EASE} 1080ms backwards;}
@keyframes sheet-rule{from{transform:scaleX(0);opacity:0.2;}}
@keyframes sheet-fade{from{opacity:0;}}
@keyframes sheet-drop{from{opacity:0;transform:translateY(-26px);}}
@keyframes sheet-draw{from{stroke-dashoffset:${fitLength};}to{stroke-dashoffset:0;}}
@media (prefers-reduced-motion: reduce){*{animation:none !important;}}`;
}

/* -------------------------------------------------------------- sheet */

function sheet() {
  const model = simulateProbabilityPlot({ n: N, seed: SEED, dist: 'normal' });

  // The plot is rendered at the size the site uses for a narrow figure and
  // scaled up, so its printed labels stay legible at README width.
  const inner = { width: 440, height: 340 };
  const plotBox = { x: 656, y: 100, width: X1 - 656 };
  const scale = plotBox.width / inner.width;
  plotBox.height = r1(inner.height * scale);
  const { svg: plotSvg, fitLength } = animatedPlot(model, inner);
  const nested = plotSvg.replace(
    /<svg class="pplot__svg" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="([^"]+)" width="\d+" height="\d+"/,
    `<svg class="pplot__svg" x="${plotBox.x}" y="${plotBox.y}" viewBox="$1" width="${plotBox.width}" height="${plotBox.height}"`,
  );

  // Caption, aligned to the plot frame.
  const capX = r1(plotBox.x + 60 * scale);
  const capY1 = r1(plotBox.y + plotBox.height + 30);
  const capY2 = capY1 + 25;
  const titleText = 'Normal probability plot';
  const figW = textWidth('Fig. 0', 17) + 2;
  const titleW = r1(textWidth(titleText, 17));
  const tagX = r1(capX + figW + 7 + titleW + 12);
  const tagTextW = 76;
  const tagPad = 5;
  const stats = [
    `n = ${model.n}`,
    `mean ${formatNumber(model.mean)}`,
    `SD ${formatNumber(model.sd)}`,
    `r = ${formatNumber(model.fit.r, 3)}`,
    `seed ${model.seed}`,
  ].join(' · ');

  const caption = [
    `<text class="fig" x="${capX}" y="${capY1}"><tspan class="fig-no">Fig. 0</tspan>`,
    `<tspan x="${r1(capX + figW + 7)}" textLength="${titleW}" lengthAdjust="spacing">${titleText}</tspan></text>`,
    `<rect x="${tagX}" y="${capY1 - 13}" width="${tagTextW + 2 * tagPad}" height="17" fill="none" stroke="${C.rulingInk}" stroke-width="1"/>`,
    `<text class="tag" x="${tagX + tagPad}" y="${capY1}" textLength="${tagTextW}" lengthAdjust="spacing">Simulated</text>`,
    `<text class="seed" x="${capX}" y="${capY2}">${escapeXml(stats)} · population ${escapeXml(model.population.label)}</text>`,
  ].join('');

  // Masthead glyph: the favicon, a tiny ruled sheet with three points on a line.
  const glyph = `<g transform="translate(${X0} 60) scale(0.875)" aria-hidden="true">
<rect width="32" height="32" fill="${C.paper}"/>
<path d="M1 3.4h30M1 7.9h30M1 12.6h30M1 16h30M1 19.4h30M1 24.1h30M1 28.6h30" stroke="${C.ruling}" stroke-width="1"/>
<path d="M1 16h30" stroke="${C.rulingInk}" stroke-width="1.2"/>
<rect x="0.75" y="0.75" width="30.5" height="30.5" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
<path d="M5 27 27 5" stroke="${C.ink}" stroke-width="1.6"/>
<circle cx="9" cy="23.2" r="2.6" fill="${C.plot}"/><circle cx="15.6" cy="16.2" r="2.6" fill="${C.plot}"/><circle cx="21.4" cy="10.8" r="2.6" fill="${C.plot}"/>
</g>`;

  const lead = [
    'Interactive essays in which the building blocks',
    'of cryptography are implemented from their',
    'standards and put to statistical test.',
  ];

  const title = `${site.course}: homework portfolio, ${site.university}, academic year ${site.academicYear}`;
  const desc =
    `The opening sheet of the portfolio, printed on normal probability paper. ` +
    `It carries the author's title block (${site.author}, ${site.degree}) and Fig. 0, a simulated normal probability plot ` +
    `of ${model.n} observations (seed ${model.seed}) whose points fall close to the fitted straight line.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="sheet-title sheet-desc">
<title id="sheet-title">${escapeXml(title)}</title>
<desc id="sheet-desc">${escapeXml(desc)}</desc>
<style>
${FONT_FORM}
${FONT_SERIF}
text{font-family:${FORM};}
.caption{fill:${C.rulingInk};font-size:12.5px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;}
.sheet-no{font-size:15px;font-weight:750;letter-spacing:0.04em;font-variant-numeric:tabular-nums lining-nums;}
.strip-label{fill:${C.rulingInk};font-size:12px;font-weight:550;font-variant-numeric:tabular-nums lining-nums;}
.mast{fill:${C.ink};font-size:20px;font-weight:700;letter-spacing:-0.01em;}
.mast-year{font-weight:500;font-variant-numeric:tabular-nums lining-nums;}
.mast-uni{fill:${C.inkFaint};font-size:17px;font-weight:500;}
.display{fill:${C.ink};font-size:118px;font-weight:800;letter-spacing:-0.035em;}
.subtitle{fill:${C.inkSoft};font-size:40px;font-weight:500;letter-spacing:-0.015em;}
.subtitle .num{font-variant-numeric:tabular-nums lining-nums;}
.lead{fill:${C.inkSoft};font-family:${SERIF};font-size:23px;font-weight:400;font-variant-numeric:lining-nums proportional-nums;}
.field{fill:${C.ink};font-size:19px;font-weight:600;font-variant-numeric:tabular-nums lining-nums;}
.fig{fill:${C.ink};font-size:17px;font-weight:700;}
.fig-no{font-weight:800;}
.tag{fill:${C.rulingInk};font-size:11.5px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;}
.seed{fill:${C.inkFaint};font-size:15px;font-weight:500;font-variant-numeric:tabular-nums lining-nums;}
${plotStyles(fitLength)}
</style>
<rect width="${W}" height="${H}" fill="${C.paper}"/>
${probabilityStrip({ left: X0, right: 1100, top: 14, baseline: 34, labelY: 49 })}
${sheetNumber(X1, 49)}
${glyph}
<text class="mast" x="${X0 + 40}" y="81">${escapeXml(site.course)}<tspan class="mast-year" dx="8">${escapeXml(site.academicYear)}</tspan></text>
<text class="mast-uni" x="${X1}" y="81" text-anchor="end">${escapeXml(site.university)}</text>
<line x1="0" x2="${W}" y1="100.5" y2="100.5" stroke="${C.ruling}" stroke-width="1"/>
<text class="display" x="${X0 - 5}" y="216">${escapeXml(site.course)}</text>
<text class="subtitle" x="${X0}" y="266">Homework portfolio,</text>
<text class="subtitle" x="${X0}" y="312">academic year <tspan class="num">${escapeXml(site.academicYear)}</tspan></text>
<text class="lead">${lead.map((l, i) => `<tspan x="${X0}" y="${364 + i * 34}">${escapeXml(l)}</tspan>`).join('')}</text>
${titleBlock({ x: X0, y: 474, width: 560, rowHeight: 62 })}
${nested}
${caption}
<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
</svg>
`;
}

/* ---------------------------------------------------------- foot strip */

function footStrip() {
  const w = W;
  const h = 56;
  const line = `${site.course} · ${site.university} · ${site.academicYear}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${escapeXml(line)}">
<style>
${FONT_FORM}
text{font-family:${FORM};}
.caption{fill:${C.rulingInk};font-size:12.5px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;}
.sheet-no{font-size:15px;font-weight:750;letter-spacing:0.04em;font-variant-numeric:tabular-nums lining-nums;}
.strip-label{fill:${C.rulingInk};font-size:12px;font-weight:550;font-variant-numeric:tabular-nums lining-nums;}
</style>
<rect width="${w}" height="${h}" fill="${C.paper}"/>
<text class="caption" x="${X0}" y="32">${escapeXml(line)}</text>
${probabilityStrip({ left: 540, right: 1110, top: 12, baseline: 32, labelY: 47 })}
${sheetNumber(X1, 32)}
<rect x="0.75" y="0.75" width="${w - 1.5}" height="${h - 1.5}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
</svg>
`;
}

/* ---------------------------------------------------------- status mark */

function publishedMark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12" role="img" aria-label="Published"><circle cx="6" cy="6" r="5" fill="${C.plot}"/></svg>
`;
}

const outputs = {
  'sheet.svg': sheet(),
  'strip.svg': footStrip(),
  'published.svg': publishedMark(),
};
for (const [name, content] of Object.entries(outputs)) {
  writeFileSync(join(HERE, name), content);
  console.log(`${name}: ${(Buffer.byteLength(content) / 1024).toFixed(1)} KiB`);
}
