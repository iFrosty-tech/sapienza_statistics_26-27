/**
 * Zero-dependency Vite plugin that turns the HTML sources into finished static
 * pages at build time (and on every request in development):
 *
 *   <!-- @include partials/name.html -->     inlines a shared partial (nestable)
 *   <!-- @homework-register -->              renders the register table from src/data/homeworks.js
 *   <!-- @plot id=fig1 n=40 seed=7 dist=normal -->
 *                                            renders a probability plot canvas with a static SVG;
 *                                            its statistics are exposed as {{plot.fig1.mean}} etc.
 *   <!-- @phi-strip -->                      renders a strip of the paper's probability scale,
 *                                            ruled at Φ⁻¹(p) from 0.01% to 99.99%
 *   <!-- @figure id=name -->                 a figure computed by the homework's own provider
 *                                            (see below); its statistics are exposed as
 *                                            {{fig.name.stat}} tokens
 *   <span data-tex>…</span>                  inline TeX rendered with KaTeX
 *   <div data-tex-display>…</div>            display TeX rendered with KaTeX
 *   {{site.author}}, {{hw.title}}, {{base}}  tokens from src/config/site.js and the register
 *
 * Figure provider: when homework/NN/figures.js exists next to the page, its
 * default export is called once per build of that page,
 *   async ({ base, site, entry, isBuild, root }) => ({ html, tokens }),
 * where `html` maps figure ids to the HTML that replaces each @figure marker
 * and `tokens` maps "id.stat" keys to strings exposed as {{fig.id.stat}}.
 * The provider runs in Node, so a homework can pre-compute its simulations at
 * build time and ship static, printable figures; the page's own script may
 * then re-draw them live. Note that modules the provider imports are cached
 * by Node for the lifetime of the dev server; restart it after editing them.
 *
 * Output is plain HTML, readable and printable without JavaScript.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import katex from 'katex';
import { invNorm, simulateProbabilityPlot } from '../lib/normal.js';
import { MAJOR_P, MINOR_P, formatNumber, renderProbabilityPlotSVG } from '../lib/probability-plot.js';

const HOMEWORK_DIR = 'homework';
const TEMPLATE_PLACEHOLDERS = {
  number: 0,
  title: 'Homework title',
  abstract:
    'Abstract placeholder: state the question addressed, the method used and the main conclusion in two or three sentences.',
  topics: ['Topic placeholder', 'Topic placeholder'],
  published: '',
  status: 'upcoming',
};

const toPosix = (p) => p.split(sep).join('/');

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const pad2 = (n) => String(n).padStart(2, '0');

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Homework folders that become build inputs: homework/NN/index.html, skipping
 * folders whose name starts with "_" (templates, drafts).
 * @param {string} root project root
 */
export function discoverHomeworkPages(root) {
  const dir = resolve(root, HOMEWORK_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => ({ name: d.name, file: resolve(dir, d.name, 'index.html') }))
    .filter((p) => existsSync(p.file))
    .map((p) => {
      if (!/^\d{2}$/.test(p.name)) {
        throw new Error(
          `[site] homework/${p.name}/ must be named with two digits (e.g. homework/01/); prefix drafts with "_".`,
        );
      }
      return { ...p, number: Number(p.name) };
    })
    .sort((a, b) => a.number - b.number);
}

async function importFresh(file) {
  const url = pathToFileURL(file);
  url.searchParams.set('v', String(statSync(file).mtimeMs));
  return (await import(url.href)).default;
}

function validateRegistry(registry, pages) {
  if (!Array.isArray(registry)) throw new Error('[site] src/data/homeworks.js must export an array.');
  const seen = new Set();
  for (const e of registry) {
    const where = `[site] homework register entry ${JSON.stringify(e?.number)}`;
    if (!Number.isInteger(e.number) || e.number < 1 || e.number > 99) throw new Error(`${where}: number must be an integer 1–99.`);
    if (seen.has(e.number)) throw new Error(`${where}: duplicate number.`);
    seen.add(e.number);
    if (typeof e.title !== 'string' || !e.title.trim()) throw new Error(`${where}: title is required.`);
    if (!['published', 'upcoming'].includes(e.status)) throw new Error(`${where}: status must be 'published' or 'upcoming'.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.published ?? '')) throw new Error(`${where}: published must be an ISO date (YYYY-MM-DD).`);
    if (e.topics && !Array.isArray(e.topics)) throw new Error(`${where}: topics must be an array of strings.`);
    if (e.status === 'published' && !pages.some((p) => p.number === e.number)) {
      throw new Error(`${where}: status is 'published' but homework/${pad2(e.number)}/index.html does not exist.`);
    }
  }
  for (const p of pages) {
    if (!seen.has(p.number)) {
      throw new Error(`[site] homework/${p.name}/ has no entry in src/data/homeworks.js.`);
    }
  }
}

function statusMark(status) {
  const label = status === 'published' ? 'Published' : 'Upcoming';
  return `<span class="status" data-status="${status}"><svg class="status__mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="4.25"/></svg><span class="status__text">${label}</span></span>`;
}

function renderRegister(registry, base) {
  const entries = [...registry].sort((a, b) => a.number - b.number);
  const blankLines = Math.max(entries.length === 0 ? 3 : 1, 4 - entries.length);
  const rows = [];

  entries.forEach((e, k) => {
    const no = pad2(e.number);
    const title =
      e.status === 'published'
        ? `<a class="register__link" href="${base}${HOMEWORK_DIR}/${no}/">${escapeHtml(e.title)}</a>`
        : `<span class="register__pending-title">${escapeHtml(e.title)}</span>`;
    const abstract = e.abstract ? `<p class="register__abstract">${escapeHtml(e.abstract)}</p>` : '';
    const topics = (e.topics ?? []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    rows.push(
      `<tr class="register__row" data-status="${e.status}">` +
        `<td class="register__line" aria-hidden="true">${k + 1}</td>` +
        `<th scope="row" class="register__no" data-label="No.">${no}</th>` +
        `<td class="register__title" data-label="Title">${title}${abstract}</td>` +
        `<td class="register__topics" data-label="Topics"><ul class="topic-list">${topics}</ul></td>` +
        `<td class="register__date" data-label="Date"><time datetime="${e.published}">${e.published}</time></td>` +
        `<td class="register__status" data-label="Status">${statusMark(e.status)}</td>` +
        `</tr>`,
    );
  });

  if (entries.length === 0) {
    rows.push(
      `<tr class="register__row register__row--empty">` +
        `<td class="register__line" aria-hidden="true">1</td>` +
        `<td class="register__empty" colspan="5"><p class="register__empty-title">No entries yet.</p>` +
        `<p class="register__empty-note">Each homework will be entered on this register when it is published, with its own page at a permanent address of the form <code>/homework/NN/</code>.</p></td>` +
        `</tr>`,
    );
  }

  const startLine = Math.max(entries.length, entries.length === 0 ? 1 : 0);
  for (let k = 0; k < blankLines; k += 1) {
    rows.push(
      `<tr class="register__row register__row--blank" aria-hidden="true">` +
        `<td class="register__line">${startLine + k + 1}</td><td colspan="5"></td></tr>`,
    );
  }

  return (
    `<table class="register" data-count="${entries.length}">` +
    `<caption class="visually-hidden">Register of homework assignments, ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</caption>` +
    // Fixed column widths (with table-layout: fixed) keep empty and filled states on the same ruling.
    `<colgroup><col class="register__col--line"><col class="register__col--no"><col class="register__col--title">` +
    `<col class="register__col--topics"><col class="register__col--date"><col class="register__col--status"></colgroup>` +
    `<thead><tr><td class="register__line" aria-hidden="true"></td>` +
    `<th scope="col">No.</th><th scope="col">Title</th><th scope="col">Topics</th><th scope="col">Date</th><th scope="col">Status</th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

function parseAttributes(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w-]+)=(?:"([^"]*)"|(\S+))/g)) attrs[m[1]] = m[2] ?? m[3];
  return attrs;
}

/**
 * Replaces every `<!-- @figure id=… -->` marker with the provider's HTML.
 * @param {string} html
 * @param {Record<string, string>} figures html by figure id
 * @param {string} file page path, for error messages
 */
export function applyFigureMarkers(html, figures, file) {
  return html.replace(/<!--\s*@figure\s+([^>]*?)\s*-->/g, (_, attrs) => {
    const { id } = parseAttributes(attrs);
    if (!id) throw new Error(`[site] ${file}: @figure marker without an id.`);
    if (typeof figures?.[id] !== 'string') {
      throw new Error(`[site] ${file}: @figure "${id}" is not provided by the homework's figures.js.`);
    }
    return figures[id];
  });
}

/**
 * Namespaces provider statistics as `fig.<id>.<stat>` tokens. Keys must be
 * dot-separated identifiers so that they match the {{token}} grammar.
 * @param {Record<string, string>} tokens
 */
export function figureTokens(tokens) {
  const out = {};
  for (const [key, value] of Object.entries(tokens ?? {})) {
    if (!/^[a-zA-Z][\w.]*$/.test(key)) {
      throw new Error(`[site] figure token "${key}" must be a dot-separated identifier (letters, digits, underscores).`);
    }
    if (typeof value !== 'string') throw new Error(`[site] figure token "${key}" must be a string.`);
    out[`fig.${key}`] = value;
  }
  return out;
}

function renderPlotMarker(source, models) {
  const a = parseAttributes(source);
  const id = a.id || 'pplot';
  const n = Number(a.n || 40);
  const seed = Number(a.seed || 1) >>> 0;
  const dist = a.dist || 'normal';
  const model = simulateProbabilityPlot({ n, seed, dist });
  models.set(id, model);
  const svg = renderProbabilityPlotSVG(model, { width: 960, height: 520, id, xLabel: a.xlabel });
  const xLabelAttr = a.xlabel ? ` data-x-label="${escapeHtml(a.xlabel)}"` : '';
  return `<div class="pplot__canvas" data-pplot-canvas data-id="${escapeHtml(id)}" data-n="${n}" data-seed="${seed}" data-dist="${escapeHtml(dist)}"${xLabelAttr}>${svg}</div>`;
}

/**
 * A strip of the probability scale, the signature of the paper, for pages that
 * do not carry a full plot in their first viewport. Rulings sit at Φ⁻¹(p), so
 * they crowd towards the tails exactly as on the full sheet.
 */
function renderPhiStrip() {
  const zMin = invNorm(0.0001);
  const zMax = invNorm(0.9999);
  const pos = (p) => ((invNorm(p / 100) - zMin) / (zMax - zMin)) * 100;
  const fmt = (x) => x.toFixed(3);
  const line = (p, cls, y1) =>
    `<line class="phi-strip__ruling ${cls}" x1="${fmt(pos(p) * 10)}" x2="${fmt(pos(p) * 10)}" y1="${y1}" y2="16" vector-effect="non-scaling-stroke"/>`;
  const rulings = [
    ...MINOR_P.map((p) => line(p, 'is-minor', 8)),
    ...MAJOR_P.map((p) => line(p, p === 50 ? 'is-median' : 'is-major', 2)),
  ].join('');
  const labels = [1, 10, 50, 90, 99]
    .map((p) => `<span class="phi-strip__label" style="left:${pos(p).toFixed(2)}%">${p}</span>`)
    .join('');
  return (
    `<div class="phi-strip" aria-hidden="true">` +
    `<svg class="phi-strip__svg" viewBox="0 0 1000 16" preserveAspectRatio="none" focusable="false">${rulings}` +
    `<line class="phi-strip__base" x1="0" x2="1000" y1="16" y2="16" vector-effect="non-scaling-stroke"/></svg>` +
    `<div class="phi-strip__labels">${labels}</div></div>`
  );
}

function renderTex(html, file, stash) {
  return html.replace(
    /<(span|div)\s+data-tex(-display)?\s*>([\s\S]*?)<\/\1>/g,
    (_, tag, display, body) => {
      const tex = decodeEntities(body.trim());
      try {
        const rendered = katex.renderToString(tex, {
          displayMode: Boolean(display),
          throwOnError: true,
          output: 'htmlAndMathml',
        });
        stash.push(`<${tag} class="math${display ? ' math--display' : ''}">${rendered}</${tag}>`);
        return `<!--tex:${stash.length - 1}-->`;
      } catch (error) {
        throw new Error(`[site] KaTeX error in ${file}: ${error.message}`);
      }
    },
  );
}

function expandIncludes(html, root, depth = 0) {
  if (depth > 6) throw new Error('[site] @include nesting is too deep (possible cycle).');
  return html.replace(/<!--\s*@include\s+([\w./-]+)\s*-->/g, (_, path) => {
    const file = resolve(root, path);
    if (!file.startsWith(resolve(root) + sep)) throw new Error(`[site] @include outside project: ${path}`);
    if (!existsSync(file)) throw new Error(`[site] @include not found: ${path}`);
    return expandIncludes(readFileSync(file, 'utf8'), root, depth + 1);
  });
}

/**
 * @param {{ root: string }} options
 * @returns {import('vite').Plugin}
 */
export function sitePlugin({ root }) {
  let base = '/';
  let isBuild = false;
  const configFile = resolve(root, 'src/config/site.js');
  const registryFile = resolve(root, 'src/data/homeworks.js');
  const buildDate = new Date().toISOString().slice(0, 10);

  return {
    name: 'site-static-html',
    configResolved(config) {
      base = config.base;
      isBuild = config.command === 'build';
    },
    configureServer(server) {
      const watched = [resolve(root, 'partials'), configFile, registryFile];
      server.watcher.add(watched);
      server.watcher.on('change', (file) => {
        if (watched.some((w) => file === w || file.startsWith(w + sep))) {
          server.ws.send({ type: 'full-reload' });
        }
      });
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const site = await importFresh(configFile);
        const registry = await importFresh(registryFile);
        const pages = discoverHomeworkPages(root);
        validateRegistry(registry, pages);

        const rel = toPosix(relative(root, ctx.filename));
        const hwMatch = rel.match(/^homework\/([^/]+)\/index\.html$/);
        const pagePath = rel.replace(/index\.html$/, '');

        let out = expandIncludes(html, root);
        // Rendered math is stashed so TeX braces never collide with {{tokens}}.
        const mathStash = [];
        out = renderTex(out, rel, mathStash);
        out = out.replace(/<!--\s*@homework-register\s*-->/g, () => renderRegister(registry, base));
        out = out.replace(/<!--\s*@phi-strip\s*-->/g, () => renderPhiStrip());
        const plotModels = new Map();
        out = out.replace(/<!--\s*@plot\s+([^>]*?)\s*-->/g, (_, attrs) => renderPlotMarker(attrs, plotModels));

        // The homework's register entry (template pages use placeholders).
        let entry = null;
        if (hwMatch) {
          const isTemplate = hwMatch[1].startsWith('_');
          entry = isTemplate ? TEMPLATE_PLACEHOLDERS : registry.find((e) => pad2(e.number) === hwMatch[1]);
          if (!entry) throw new Error(`[site] ${rel} has no entry in src/data/homeworks.js.`);
        }

        // Figures computed by the homework's own provider, if it has one.
        let providedTokens = {};
        if (hwMatch) {
          const figuresFile = resolve(root, HOMEWORK_DIR, hwMatch[1], 'figures.js');
          if (existsSync(figuresFile)) {
            const provide = await importFresh(figuresFile);
            const figures = await provide({ base, site, entry, isBuild, root });
            out = applyFigureMarkers(out, figures?.html ?? {}, rel);
            providedTokens = figureTokens(figures?.tokens ?? {});
          }
        }

        const studentIdPending = /^0+$/.test(site.studentId);
        const tokens = {
          base,
          'site.author': site.author,
          'site.studentId': site.studentId,
          'site.studentIdState': studentIdPending ? 'pending' : 'set',
          'site.degree': site.degree,
          'site.degreeNative': site.degreeNative,
          'site.course': site.course,
          'site.university': site.university,
          'site.academicYear': site.academicYear,
          'site.siteUrl': site.siteUrl,
          'site.repoUrl': site.repoUrl,
          'site.buildDate': buildDate,
          'page.canonical': site.siteUrl + pagePath,
        };

        // Static figures print their statistics too: {{plot.<id>.mean}} and friends.
        for (const [id, m] of plotModels) {
          Object.assign(tokens, {
            [`plot.${id}.n`]: String(m.n),
            [`plot.${id}.mean`]: formatNumber(m.mean),
            [`plot.${id}.sd`]: formatNumber(m.sd),
            [`plot.${id}.r`]: formatNumber(m.fit.r, 3),
            [`plot.${id}.seed`]: String(m.seed),
            [`plot.${id}.population`]: m.population.label,
          });
        }

        if (entry) {
          Object.assign(tokens, providedTokens, {
            'hw.no': pad2(entry.number),
            'hw.title': entry.title,
            'hw.abstract': entry.abstract ?? '',
            'hw.published': entry.published,
            'hw.publishedLabel': entry.published
              ? longDate.format(new Date(`${entry.published}T00:00:00Z`))
              : 'Publication date',
            'hw.topics': (entry.topics ?? []).join(', '),
            'hw.status': entry.status,
          });
        }

        out = out.replace(/\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g, (match, key) => {
          if (!(key in tokens)) {
            const message = `[site] unknown token {{${key}}} in ${rel}`;
            if (isBuild) throw new Error(message);
            console.warn(message);
            return match;
          }
          // `base` is a URL prefix; everything else is text.
          return key === 'base' ? tokens[key] : escapeHtml(tokens[key]);
        });
        out = out.replace(/<!--tex:(\d+)-->/g, (_, i) => mathStash[Number(i)]);
        return out;
      },
    },
  };
}
