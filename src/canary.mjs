import { parseArgs } from 'node:util';
import { render } from '../reference/render.mjs';
import { diffGeometry } from './compare.mjs';
import { loadCorpus, writePair } from './corpus.mjs';
import { CORPUS_DIR, isMain } from './paths.mjs';

export function runCanary({ corpusDir = CORPUS_DIR } = {}) {
  const pairs = loadCorpus(corpusDir);
  const changed = [];
  for (const p of pairs) {
    let actual = null;
    let diffs;
    try {
      actual = render(p.spec);
      diffs = diffGeometry(actual, p.expected);
    } catch (e) {
      diffs = [`reference threw: ${e.message}`];
    }
    if (diffs.length) changed.push({ file: p.file, spec: p.spec, actual, differences: diffs });
  }
  return { total: pairs.length, changed };
}

export function refresh({ corpusDir = CORPUS_DIR } = {}) {
  const { total, changed } = runCanary({ corpusDir });
  const rewritten = [];
  for (const c of changed) {
    if (!c.actual) continue;
    writePair(corpusDir, c.file, { spec: c.spec, expected: c.actual });
    rewritten.push(c);
  }
  return { total, changed, rewritten };
}

export function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { refresh: { type: 'boolean' }, corpus: { type: 'string' } },
    }));
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const corpusDir = values.corpus ?? CORPUS_DIR;

  if (values.refresh) {
    const r = refresh({ corpusDir });
    console.log(`canary --refresh: ${r.rewritten.length} of ${r.total} stored outputs rewritten from the reference`);
    for (const c of r.changed) {
      console.log(`  ${c.file}: ${c.differences.length} difference(s) ${c.actual ? 'rewritten' : 'NOT rewritten'}`);
      for (const d of c.differences.slice(0, 5)) console.log(`    ${d}`);
    }
    return r.rewritten.length === r.changed.length ? 0 : 1;
  }

  const r = runCanary({ corpusDir });
  if (r.changed.length === 0) {
    console.log(`canary: reference output unchanged for all ${r.total} stored pairs`);
    return 0;
  }
  console.log(`canary: the reference has changed since the corpus was stored (${r.changed.length} of ${r.total} pairs)`);
  for (const c of r.changed) {
    console.log(`  ${c.file}`);
    for (const d of c.differences.slice(0, 5)) console.log(`    ${d}`);
  }
  return 1;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
