import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compile } from '../src/compile.mjs';
import { verify } from '../src/verify.mjs';
import { ROOT } from '../src/paths.mjs';

const node = (script, args) =>
  spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });

const spec = JSON.parse(readFileSync(join(ROOT, 'examples', 'stack.json'), 'utf8'));

// Shift one box by 1px; the container line has no data-id so it is untouched.
const moveBox = (html, id) =>
  html.replace(
    new RegExp(`(data-id="${id}" style="[^"]*?left:)(\\d+)px`),
    (_, head, n) => `${head}${Number(n) + 1}px`,
  );

const withTmp = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'egb-verify-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('verify passes on clean compiler output with zero drift', () => {
  const r = verify(compile(spec).html, spec);
  assert.equal(r.ok, true);
  assert.equal(r.maxDrift, 0);
  assert.equal(r.items.length, spec.items.length);
  assert.ok(r.items.every((i) => i.drift === 0));
});

test('verify reports 1px drift when a box is moved and passes at tolerance 1', () => {
  const moved = moveBox(compile(spec).html, 'image');
  const strict = verify(moved, spec);
  assert.equal(strict.ok, false);
  assert.equal(strict.maxDrift, 1);
  assert.equal(strict.items.find((i) => i.id === 'image').drift, 1);
  assert.equal(strict.items.find((i) => i.id === 'title').drift, 0);
  assert.equal(verify(moved, spec, { tolerance: 1 }).ok, true);
});

test('verify cli exits 2 on drift and 0 within tolerance', () => {
  withTmp((dir) => {
    const specPath = join(dir, 'spec.json');
    const htmlPath = join(dir, 'out.html');
    writeFileSync(specPath, JSON.stringify(spec));
    writeFileSync(htmlPath, moveBox(compile(spec).html, 'caption'));

    const strict = node('src/verify.mjs', [specPath, htmlPath]);
    assert.equal(strict.status, 2);
    assert.match(strict.stdout, /max drift: 1px/);
    assert.match(strict.stdout, /caption: drift 1px/);

    assert.equal(node('src/verify.mjs', [specPath, htmlPath, '--tolerance', '1']).status, 0);
  });
});

test('verify fails when a box is missing or the container height is wrong', () => {
  const html = compile(spec).html;
  const missing = html.split('\n').filter((l) => !l.includes('data-id="title"')).join('\n');
  const r1 = verify(missing, spec, { tolerance: 100 });
  assert.equal(r1.ok, false);
  assert.match(r1.problems.join(' '), /"title" missing/);

  const taller = html.replace(/height:(\d+)px">/, (_, n) => `height:${Number(n) + 5}px">`);
  const r2 = verify(taller, spec);
  assert.equal(r2.ok, false);
  assert.equal(r2.containerDrift, 5);
});

test('the build-stamp differs between runs and verify ignores it', () => {
  const a = compile(spec).html;
  const b = compile(spec).html;
  assert.notEqual(a, b);
  assert.match(a, /<!-- build-stamp: [^>]+ -->/);
  assert.equal(verify(a, spec).ok, true);
  assert.equal(verify(b, spec).ok, true);
  const unstamped = (h) => h.replace(/<!-- build-stamp:.*? -->\n/, '');
  assert.equal(unstamped(a), unstamped(b));
});

test('cli build writes the html with --out and does not write on refusal', () => {
  withTmp((dir) => {
    const out = join(dir, 'grid.html');
    const ok = node('src/cli.mjs', ['build', join(ROOT, 'examples', 'grid.json'), '--out', out]);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /verify: OK/);
    assert.ok(existsSync(out));

    const refusedOut = join(dir, 'overlay.html');
    const bad = node('src/cli.mjs', ['build', join(ROOT, 'examples', 'overlay.json'), '--out', refusedOut]);
    assert.equal(bad.status, 3);
    assert.equal(existsSync(refusedOut), false);
  });
});
