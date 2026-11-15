import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCanary } from '../src/canary.mjs';
import { formatPair } from '../src/corpus.mjs';
import { CORPUS_DIR, ROOT } from '../src/paths.mjs';

const node = (script, args) =>
  spawnSync(process.execPath, [join(ROOT, script), ...args], { encoding: 'utf8' });

const withCorpusCopy = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'egb-canary-'));
  try {
    cpSync(CORPUS_DIR, dir, { recursive: true });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const mutate = (dir, file) => {
  const path = join(dir, file);
  const pair = JSON.parse(readFileSync(path, 'utf8'));
  pair.expected.height += 1;
  writeFileSync(path, formatPair(pair));
};

test('canary passes on the clean corpus', () => {
  const r = runCanary();
  assert.equal(r.changed.length, 0);
  assert.ok(r.total >= 14);
  const cli = node('src/canary.mjs', []);
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /unchanged/);
});

test('canary fails and names the pair when a stored output is mutated', () => {
  withCorpusCopy((dir) => {
    mutate(dir, 'stack-01.json');
    const r = runCanary({ corpusDir: dir });
    assert.equal(r.changed.length, 1);
    assert.equal(r.changed[0].file, 'stack-01.json');

    const cli = node('src/canary.mjs', ['--corpus', dir]);
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /stack-01\.json/);
    assert.match(cli.stdout, /reference has changed/);
  });
});

test('canary --refresh rewrites the stored output and the canary then passes', () => {
  withCorpusCopy((dir) => {
    mutate(dir, 'grid-02.json');
    const refresh = node('src/canary.mjs', ['--refresh', '--corpus', dir]);
    assert.equal(refresh.status, 0);
    assert.match(refresh.stdout, /1 of \d+ stored outputs rewritten/);
    assert.match(refresh.stdout, /grid-02\.json/);
    assert.equal(runCanary({ corpusDir: dir }).changed.length, 0);
  });
});

test('shipped corpus files are in the canonical format', () => {
  const pair = JSON.parse(readFileSync(join(CORPUS_DIR, 'grid-01.json'), 'utf8'));
  assert.equal(formatPair(pair), readFileSync(join(CORPUS_DIR, 'grid-01.json'), 'utf8'));
});
