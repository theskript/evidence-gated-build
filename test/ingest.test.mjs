import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Refused, compile } from '../src/compile.mjs';
import { IngestError, checkText, extractText, ingest, planToSpec, runPlan } from '../src/ingest.mjs';
import { ROOT } from '../src/paths.mjs';

const node = (script, args) =>
  spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });
const cli = (...args) => node('src/cli.mjs', args);
const example = (name) => join(ROOT, 'examples', name);
const load = (name) => JSON.parse(readFileSync(example(name), 'utf8'));
const unstamped = (html) => html.replace(/<!-- build-stamp:.*? -->\n/, '');

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'egb-ingest-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const rect = (id, x, y, w, h) => ({ id, type: 'rect', box: { x, y, w, h } });

// Five cells in three columns: cell width floor((360 - 24 - 24) / 3) = 104, gap 12, padding 12.
const gridDesign = () => ({
  artboard: { w: 360, h: 220 },
  nodes: [
    rect('t1', 12, 12, 104, 80),
    rect('t2', 128, 12, 104, 96),
    rect('t3', 244, 12, 104, 64),
    rect('t4', 12, 120, 104, 72),
    rect('t5', 128, 120, 104, 88),
  ],
});

test('layout comes from boxes: a drifted or missing ink box changes nothing', () => {
  const design = load('design-stack.json');
  const drifted = structuredClone(design);
  drifted.nodes.forEach((n, i) => {
    n.ink = { x: n.box.x + 9 + i, y: n.box.y - 5, w: 3, h: 3 };
  });
  const noInk = structuredClone(design);
  noInk.nodes.forEach((n) => delete n.ink);

  const base = ingest(design);
  for (const variant of [drifted, noInk]) {
    const other = ingest(variant);
    assert.deepEqual(other.plan, base.plan);
    assert.deepEqual(other.spec, base.spec);
    assert.equal(unstamped(runPlan(other.plan).html), unstamped(runPlan(base.plan).html));
  }
});

test('kind inference: shared x is a stack, shared y is a row', () => {
  const stack = ingest(load('design-stack.json'));
  assert.equal(stack.plan.kind, 'stack');
  assert.deepEqual(stack.plan.items.map((i) => i.id), ['title', 'image', 'caption']);
  assert.equal(stack.plan.padding, 16);
  assert.equal(stack.plan.gap, 12);
  assert.equal(runPlan(stack.plan).ok, true);

  const row = ingest(load('design-row.json'));
  assert.equal(row.plan.kind, 'row');
  assert.deepEqual(row.plan.items.map((i) => i.id), ['save', 'share', 'badge']);
  assert.equal(row.plan.padding, 16);
  assert.equal(row.plan.gap, 8);
  assert.equal(runPlan(row.plan).ok, true);
});

test('kind inference: a regular lattice is a grid, in row-major order', () => {
  const design = gridDesign();
  design.nodes.reverse();
  const { plan, spec } = ingest(design);
  assert.equal(plan.kind, 'grid');
  assert.equal(plan.columns, 3);
  assert.equal(plan.gap, 12);
  assert.equal(plan.padding, 12);
  assert.equal(spec.columns, 3);
  assert.deepEqual(plan.items.map((i) => i.id), ['t1', 't2', 't3', 't4', 't5']);
  const run = runPlan(plan);
  assert.equal(run.design.maxDrift, 0);
  assert.equal(run.ok, true);
});

test('a layout with no recorded kind is refused as freeform', () => {
  const design = {
    artboard: { w: 300, h: 300 },
    nodes: [rect('a', 0, 0, 50, 50), rect('b', 100, 10, 50, 50), rect('c', 30, 100, 50, 50)],
  };
  assert.throws(
    () => ingest(design),
    (e) => e instanceof Refused && e.exitCode === 3 && e.message.includes('"freeform"'),
  );
});

test('overlapping nodes are an overlay and the compiler refusal propagates with exit 3', () => {
  const design = load('design-overlay.json');
  assert.throws(
    () => ingest(design),
    (e) => e instanceof Refused && e.exitCode === 3 && e.message.includes('"overlay"') && e.message.includes('no recorded evidence'),
  );
  withTmp((dir) => {
    const plan = join(dir, 'plan.json');
    const r = cli('ingest', example('design-overlay.json'), '--plan', plan);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /no recorded evidence for kind "overlay"/);
    assert.equal(existsSync(plan), false);
  });
});

test('text check passes on compiled output, ignoring whitespace differences only', () => {
  const design = load('design-stack.json');
  const { plan } = ingest(design);
  const run = runPlan(plan);
  assert.equal(run.text.ok, true);
  assert.equal(extractText(run.html).get('title'), 'Spring collection');

  const expected = design.nodes.filter((n) => n.type === 'text');
  assert.equal(checkText(run.html.replace('Spring collection', 'Spring \n  collection'), expected).ok, true);

  const odd = ingest({ artboard: { w: 200, h: 60 }, nodes: [{ id: 'note', type: 'text', box: { x: 8, y: 8, w: 184, h: 44 }, text: 'Fish & <chips> "now"' }] });
  assert.equal(runPlan(odd.plan).ok, true);
});

test('text check fails with exit 2 and names the node', () => {
  const design = load('design-stack.json');
  const expected = design.nodes.filter((n) => n.type === 'text');
  const html = runPlan(ingest(design).plan).html;

  const changed = checkText(html.replace('Spring collection', 'Spring collections'), expected);
  assert.equal(changed.ok, false);
  assert.deepEqual(changed.mismatches.map((m) => m.id), ['title']);
  assert.equal(changed.mismatches[0].actual, 'Spring collections');

  const gone = checkText(html.replace('Lightweight layers for changeable weather.', ''), expected);
  assert.deepEqual(gone.mismatches.map((m) => m.id), ['caption']);

  withTmp((dir) => {
    const planPath = join(dir, 'plan.json');
    assert.equal(cli('ingest', example('design-stack.json'), '--plan', planPath).status, 0);
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    plan.items[0].text = 'Autumn collection';
    writeFileSync(planPath, JSON.stringify(plan));
    const out = join(dir, 'out.html');
    const r = cli('build-plan', planPath, '--out', out);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /text mismatch in node "title"/);
    assert.equal(existsSync(out), false);
  });
});

test('drift from the design boxes is reported in px and tolerance applies', () => {
  const { plan } = ingest(load('design-stack.json'));
  plan.gap = 16;
  const run = runPlan(plan);
  assert.equal(run.ok, false);
  assert.equal(run.design.maxDrift, 8);
  assert.equal(run.design.containerDrift, 8);
  assert.equal(run.design.items.find((i) => i.id === 'title').drift, 0);
  assert.equal(run.design.items.find((i) => i.id === 'image').drift, 4);
  assert.equal(run.design.items.find((i) => i.id === 'caption').drift, 8);
  assert.equal(run.reference.ok, true);
  assert.equal(runPlan(plan, { tolerance: 8 }).ok, true);
});

test('malformed exports exit 4 and name the node', () => {
  const cases = [
    ['missing box', (d) => delete d.nodes[1].box, /node "image": missing box/],
    ['negative size', (d) => (d.nodes[1].box.h = -5), /node "image": negative size/],
    ['duplicate id', (d) => (d.nodes[2].id = 'title'), /node "title": duplicate id/],
    ['text node without text', (d) => delete d.nodes[0].text, /node "title": text node without text/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const design = load('design-stack.json');
    mutate(design);
    assert.throws(
      () => ingest(design),
      (e) => e instanceof IngestError && e.exitCode === 4 && pattern.test(e.message),
      label,
    );
  }

  withTmp((dir) => {
    const plan = join(dir, 'plan.json');
    const r = cli('ingest', example('design-bad.json'), '--plan', plan);
    assert.equal(r.status, 4);
    assert.match(r.stderr, /node "headline": text node without text/);
    assert.equal(existsSync(plan), false);
  });
});

test('plan edit round trip: ingest, edit the plan, build-plan again', () => {
  withTmp((dir) => {
    const planPath = join(dir, 'plan.json');
    const specPath = join(dir, 'spec.json');
    const out = join(dir, 'out.html');

    const first = cli('ingest', example('design-stack.json'), '--plan', planPath, '--spec', specPath);
    assert.equal(first.status, 0);
    assert.match(first.stdout, /ingest: kind stack, 3 items/);
    assert.match(first.stdout, /max drift: 0px/);

    const expected = ingest(load('design-stack.json'));
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    assert.deepEqual(plan, expected.plan);
    assert.deepEqual(JSON.parse(readFileSync(specPath, 'utf8')), expected.spec);
    assert.deepEqual(planToSpec(plan), expected.spec);
    assert.doesNotThrow(() => compile(planToSpec(plan)));

    const clean = cli('build-plan', planPath, '--out', out);
    assert.equal(clean.status, 0);
    assert.match(readFileSync(out, 'utf8'), /Spring collection/);
    rmSync(out);

    plan.gap = 16;
    writeFileSync(planPath, JSON.stringify(plan));
    const drifted = cli('build-plan', planPath, '--out', out);
    assert.equal(drifted.status, 2);
    assert.match(drifted.stdout, /image: drift 4px/);
    assert.match(drifted.stdout, /max drift: 8px/);
    assert.equal(existsSync(out), false);

    assert.equal(cli('build-plan', planPath, '--out', out, '--tolerance', '8').status, 0);
    assert.ok(existsSync(out));
  });
});

test('existing build command is unchanged by the new commands', () => {
  assert.equal(cli('build', example('stack.json')).status, 0);
  assert.equal(cli('build', example('overlay.json')).status, 3);
  assert.equal(cli('ingest').status, 1);
});
