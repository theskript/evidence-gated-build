import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compile, Refused } from '../src/compile.mjs';
import { checkCorpus, MIN_EVIDENCE } from '../src/check-corpus.mjs';
import { loadCorpus } from '../src/corpus.mjs';
import { loadRules } from '../src/rules.mjs';
import { ROOT } from '../src/paths.mjs';
import { render } from '../reference/render.mjs';

const node = (script, args) =>
  spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'egb-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('every corpus pair of an enabled kind compiles to the stored output', () => {
  const enabled = loadRules().enabled;
  const inScope = loadCorpus().filter((p) => enabled.includes(p.spec.kind));
  const r = checkCorpus();
  assert.ok(inScope.length >= 12);
  assert.equal(r.different, 0);
  assert.equal(r.identical, inScope.length);
});

test('overlay pairs in the corpus are refused with the Refused error', () => {
  const overlays = loadCorpus().filter((p) => p.spec.kind === 'overlay');
  assert.ok(overlays.length >= 2);
  for (const p of overlays) {
    assert.throws(
      () => compile(p.spec),
      (e) =>
        e instanceof Refused &&
        e.exitCode === 3 &&
        e.message.includes('"overlay"') &&
        e.message.includes('no recorded evidence'),
    );
  }
  assert.equal(checkCorpus().refused, overlays.length);
});

test('carousel is refused by compile and by the cli with exit 3', () => {
  const spec = { name: 'c', kind: 'carousel', width: 200, gap: 4, padding: 4, items: [{ id: 'a', w: 10, h: 10 }] };
  assert.throws(() => compile(spec), Refused);
  assert.throws(() => render(spec), /unsupported kind/);
  withTmp((dir) => {
    const file = join(dir, 'carousel.json');
    writeFileSync(file, JSON.stringify(spec));
    const r = node('src/cli.mjs', ['build', file]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /no recorded evidence/);
  });
});

test('cli exits 3 on the overlay example and 0 on supported examples', () => {
  assert.equal(node('src/cli.mjs', ['build', join(ROOT, 'examples', 'overlay.json')]).status, 3);
  for (const name of ['stack', 'row', 'grid']) {
    assert.equal(node('src/cli.mjs', ['build', join(ROOT, 'examples', `${name}.json`)]).status, 0, name);
  }
});

test('no option or extra argument can bypass refusal', () => {
  const spec = loadCorpus().find((p) => p.spec.kind === 'overlay').spec;
  const attempts = [
    { force: true },
    { enabled: ['overlay'] },
    { allow: 'overlay' },
    { override: true },
    { rules: { enabled: ['overlay'] } },
    { unsafe: true, skipEvidence: true },
  ];
  for (const opts of attempts) {
    assert.throws(() => compile(spec, opts), Refused);
  }
  const r = node('src/cli.mjs', ['build', join(ROOT, 'examples', 'overlay.json'), '--force']);
  assert.notEqual(r.status, 0);
  assert.notEqual(r.status, 3);
});

test('rules.json cannot enable a kind that has fewer than 3 corpus pairs', () => {
  assert.equal(MIN_EVIDENCE, 3);
  assert.deepEqual(checkCorpus().ruleProblems, []);
  withTmp((dir) => {
    const rulesPath = join(dir, 'rules.json');
    writeFileSync(rulesPath, JSON.stringify({ enabled: ['stack', 'row', 'grid', 'overlay'] }));
    const r = checkCorpus({ rulesPath });
    assert.equal(r.ruleProblems.length, 1);
    assert.match(r.ruleProblems[0], /^overlay: enabled with 2 corpus pair/);

    const cli = node('src/check-corpus.mjs', ['--rules', rulesPath]);
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /evidence requirement NOT met/);

    writeFileSync(rulesPath, JSON.stringify({ enabled: ['stack', 'carousel'] }));
    assert.match(checkCorpus({ rulesPath }).ruleProblems[0], /^carousel: enabled with 0 corpus pair/);
  });
});

test('check-corpus labels its figures as in-sample and exits 0 on the shipped corpus', () => {
  const r = node('src/check-corpus.mjs', []);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /in-sample: these pairs were used to write the rules/);
  assert.match(r.stdout, /in-sample: \d+ identical, 0 different, 2 refused/);
});
