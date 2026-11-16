import { compile } from './compile.mjs';
import { verify } from './verify.mjs';

export class IngestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IngestError';
    this.exitCode = 4;
  }
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function checkBox(box, label) {
  if (!box || typeof box !== 'object') throw new IngestError(`${label}: missing box`);
  for (const k of ['x', 'y', 'w', 'h']) {
    if (!isNum(box[k])) throw new IngestError(`${label}: box.${k} must be a finite number`);
  }
  if (box.w < 0 || box.h < 0) throw new IngestError(`${label}: negative size (w=${box.w}, h=${box.h})`);
}

export function validateDesign(design) {
  if (!design || typeof design !== 'object') throw new IngestError('design export must be a JSON object');
  const { artboard, nodes } = design;
  if (!artboard || !isNum(artboard.w) || !isNum(artboard.h) || artboard.w <= 0 || artboard.h <= 0) {
    throw new IngestError('artboard: w and h must be positive numbers');
  }
  if (!Array.isArray(nodes) || nodes.length === 0) throw new IngestError('nodes must be a non-empty array');
  const seen = new Set();
  nodes.forEach((n, i) => {
    if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !ID_PATTERN.test(n.id)) {
      throw new IngestError(`node #${i}: invalid id ${JSON.stringify(n?.id)}`);
    }
    const label = `node "${n.id}"`;
    if (seen.has(n.id)) throw new IngestError(`${label}: duplicate id`);
    seen.add(n.id);
    if (n.type !== 'text' && n.type !== 'rect') {
      throw new IngestError(`${label}: type must be "text" or "rect"`);
    }
    checkBox(n.box, label);
    if (n.type === 'text' && (typeof n.text !== 'string' || n.text.trim() === '')) {
      throw new IngestError(`${label}: text node without text`);
    }
    if (n.ink !== undefined) checkBox(n.ink, `${label} ink`);
  });
  return { artboard, nodes };
}

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const allEqual = (values) => values.every((v) => v === values[0]);
const byYX = (a, b) => a.box.y - b.box.y || a.box.x - b.box.x;

function lattice(nodes) {
  const rowMap = new Map();
  for (const n of nodes) {
    if (!rowMap.has(n.box.y)) rowMap.set(n.box.y, []);
    rowMap.get(n.box.y).push(n);
  }
  const rows = [...rowMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row.sort((a, b) => a.box.x - b.box.x));
  if (rows.length < 2) return null;
  const columns = rows[0].length;
  if (columns < 2) return null;
  const { x: x0, w } = rows[0][0].box;
  const step = rows[0][1].box.x - x0;
  if (step < w || step <= 0) return null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.length > columns || (r < rows.length - 1 && row.length !== columns)) return null;
    for (let c = 0; c < row.length; c++) {
      if (row[c].box.w !== w || row[c].box.x !== x0 + c * step) return null;
    }
  }
  return { ordered: rows.flat(), columns, gap: step - w };
}

// Kind comes from the layout boxes only; `ink` is never read.
export function inferKind(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (overlaps(nodes[i].box, nodes[j].box)) {
        return { kind: 'overlay', ordered: [...nodes].sort(byYX) };
      }
    }
  }
  if (allEqual(nodes.map((n) => n.box.x))) {
    const ordered = [...nodes].sort(byYX);
    const gap = ordered.length > 1 ? ordered[1].box.y - (ordered[0].box.y + ordered[0].box.h) : 0;
    return { kind: 'stack', ordered, padding: ordered[0].box.x, gap };
  }
  if (allEqual(nodes.map((n) => n.box.y))) {
    const ordered = [...nodes].sort(byYX);
    const gap = ordered.length > 1 ? ordered[1].box.x - (ordered[0].box.x + ordered[0].box.w) : 0;
    return { kind: 'row', ordered, padding: ordered[0].box.y, gap };
  }
  const grid = lattice(nodes);
  if (grid) return { kind: 'grid', ordered: grid.ordered, columns: grid.columns, padding: grid.ordered[0].box.x, gap: grid.gap };
  return { kind: 'freeform', ordered: [...nodes].sort(byYX) };
}

export function planToSpec(plan) {
  const spec = {
    name: plan.name,
    kind: plan.kind,
    width: plan.width,
    gap: plan.gap,
    padding: plan.padding,
    items: plan.items.map((it) => ({ id: it.id, w: it.w, h: it.h })),
  };
  if (plan.columns !== undefined) spec.columns = plan.columns;
  return spec;
}

export function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new IngestError('plan must be a JSON object');
  if (typeof plan.kind !== 'string') throw new IngestError('plan: kind must be a string');
  for (const k of ['width', 'height', 'gap', 'padding']) {
    if (!isNum(plan[k])) throw new IngestError(`plan: ${k} must be a finite number`);
  }
  if (!Array.isArray(plan.items)) throw new IngestError('plan: items must be an array');
  const seen = new Set();
  for (const it of plan.items) {
    if (typeof it?.id !== 'string' || !ID_PATTERN.test(it.id)) {
      throw new IngestError(`plan item: invalid id ${JSON.stringify(it?.id)}`);
    }
    const label = `plan item "${it.id}"`;
    if (seen.has(it.id)) throw new IngestError(`${label}: duplicate id`);
    seen.add(it.id);
    if (!isNum(it.w) || !isNum(it.h) || it.w < 0 || it.h < 0) throw new IngestError(`${label}: w and h must be non-negative numbers`);
    if (it.text !== undefined && typeof it.text !== 'string') throw new IngestError(`${label}: text must be a string`);
    checkBox(it.design, `${label} design`);
  }
}

// Compile refusals (Refused, exit 3) are deliberately not caught here.
export function ingest(designExport) {
  const { artboard, nodes } = validateDesign(designExport);
  const inferred = inferKind(nodes);
  const plan = {
    name: typeof designExport.name === 'string' ? designExport.name : 'ingested',
    kind: inferred.kind,
    width: artboard.w,
    height: artboard.h,
    gap: inferred.gap ?? 0,
    padding: inferred.padding ?? Math.min(...nodes.map((n) => n.box.x)),
  };
  if (inferred.columns !== undefined) plan.columns = inferred.columns;
  plan.items = inferred.ordered.map((n) => {
    const item = { id: n.id, w: n.box.w, h: n.box.h };
    const design = { x: n.box.x, y: n.box.y, w: n.box.w, h: n.box.h };
    if (n.type === 'text') {
      item.text = n.text;
      design.text = n.text;
    }
    item.design = design;
    return item;
  });
  const spec = planToSpec(plan);
  compile(spec);
  return { spec, plan };
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeHtml = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const normalise = (s) => s.replace(/\s+/g, ' ').trim();

const ITEM_DIV = /<div data-id="([^"]*)" style="[^"]*">([\s\S]*?)<\/div>/g;

export function withText(html, items) {
  const texts = new Map(items.filter((it) => it.text).map((it) => [it.id, it.text]));
  return html.replace(
    /(<div data-id="([^"]*)" style="[^"]*">)<\/div>/g,
    (m, open, id) => (texts.has(id) ? `${open}${escapeHtml(texts.get(id))}</div>` : m),
  );
}

export function extractText(html) {
  const out = new Map();
  for (const m of html.matchAll(ITEM_DIV)) {
    out.set(m[1], normalise(unescapeHtml(m[2].replace(/<[^>]*>/g, ''))));
  }
  return out;
}

// expected: [{ id, text? }]; a missing text means the item must be empty.
export function checkText(html, expected) {
  const actual = extractText(html);
  const mismatches = [];
  for (const e of expected) {
    const want = normalise(e.text ?? '');
    const got = actual.has(e.id) ? actual.get(e.id) : null;
    if (got !== want) mismatches.push({ id: e.id, expected: want, actual: got });
  }
  return { ok: mismatches.length === 0, mismatches };
}

export function formatTextReport(r) {
  return r.mismatches.map(
    (m) => `text mismatch in node "${m.id}": design has ${JSON.stringify(m.expected)}, output has ${JSON.stringify(m.actual)}`,
  );
}

// Compile a plan, then check text and geometry against the design values stored in it.
export function runPlan(plan, { tolerance = 0 } = {}) {
  validatePlan(plan);
  const spec = planToSpec(plan);
  const html = withText(compile(spec).html, plan.items);
  const text = checkText(
    html,
    plan.items.map((it) => ({ id: it.id, text: it.design.text })),
  );
  const design = verify(html, spec, {
    tolerance,
    expected: {
      boxes: plan.items.map((it) => ({ id: it.id, x: it.design.x, y: it.design.y, w: it.design.w, h: it.design.h })),
      height: plan.height,
    },
  });
  const reference = verify(html, spec, { tolerance });
  return { html, spec, text, design, reference, ok: text.ok && design.ok && reference.ok };
}
