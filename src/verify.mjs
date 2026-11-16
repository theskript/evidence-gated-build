import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { render } from '../reference/render.mjs';
import { isMain } from './paths.mjs';

function parseStyle(style) {
  const out = {};
  for (const m of style.matchAll(/([a-z-]+):\s*(-?\d+(?:\.\d+)?)px/g)) out[m[1]] = Number(m[2]);
  return out;
}

export function parseHtml(html) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');
  const c = /<div class="layout" style="([^"]*)"/.exec(clean);
  const container = c ? parseStyle(c[1]) : null;
  const boxes = new Map();
  for (const m of clean.matchAll(/<div data-id="([^"]*)" style="([^"]*)"/g)) {
    const s = parseStyle(m[2]);
    boxes.set(m[1], { x: s.left, y: s.top, w: s.width, h: s.height });
  }
  return { container, boxes };
}

const drift = (a, b) => (Number.isFinite(a) ? Math.abs(a - b) : Infinity);

// `expected` ({ boxes, height }) replaces the reference geometry, e.g. with boxes taken from a design.
export function verify(html, spec, { tolerance = 0, expected = render(spec) } = {}) {
  const { container, boxes } = parseHtml(html);
  const problems = [];

  const containerDrift = container ? drift(container.height, expected.height) : Infinity;
  if (!container) problems.push('container element not found');

  const items = [];
  for (const e of expected.boxes) {
    const got = boxes.get(e.id);
    if (!got) {
      problems.push(`box "${e.id}" missing from html`);
      items.push({ id: e.id, drift: Infinity });
      continue;
    }
    const d = Math.max(drift(got.x, e.x), drift(got.y, e.y), drift(got.w, e.w), drift(got.h, e.h));
    items.push({ id: e.id, drift: d });
  }
  const known = new Set(expected.boxes.map((b) => b.id));
  for (const id of boxes.keys()) {
    if (!known.has(id)) {
      problems.push(`unexpected box "${id}" in html`);
      items.push({ id, drift: Infinity });
    }
  }

  const maxDrift = Math.max(containerDrift, ...items.map((i) => i.drift));
  return { ok: problems.length === 0 && maxDrift <= tolerance, tolerance, maxDrift, containerDrift, items, problems };
}

export function formatReport(r) {
  const lines = [`verify: tolerance ${r.tolerance}px`];
  for (const i of r.items) lines.push(`  ${i.id}: drift ${i.drift}px`);
  lines.push(`  container height: drift ${r.containerDrift}px`);
  for (const p of r.problems) lines.push(`  problem: ${p}`);
  lines.push(`max drift: ${r.maxDrift}px`);
  lines.push(r.ok ? 'verify: OK' : 'verify: FAILED');
  return lines.join('\n');
}

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { tolerance: { type: 'string' } } });
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const [specPath, htmlPath] = parsed.positionals;
  const tolerance = parsed.values.tolerance === undefined ? 0 : Number(parsed.values.tolerance);
  if (!specPath || !htmlPath || !Number.isFinite(tolerance) || tolerance < 0) {
    console.error('usage: node src/verify.mjs <spec.json> <file.html> [--tolerance N]');
    return 1;
  }
  try {
    const spec = JSON.parse(readFileSync(specPath, 'utf8'));
    const report = verify(readFileSync(htmlPath, 'utf8'), spec, { tolerance });
    console.log(formatReport(report));
    return report.ok ? 0 : 2;
  } catch (e) {
    console.error(`verify: ${e.message}`);
    return 1;
  }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
