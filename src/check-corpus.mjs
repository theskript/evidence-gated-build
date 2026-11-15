import { parseArgs } from 'node:util';
import { Refused, compileWithRules } from './compile.mjs';
import { diffGeometry } from './compare.mjs';
import { loadCorpus } from './corpus.mjs';
import { CORPUS_DIR, RULES_PATH, isMain } from './paths.mjs';
import { loadRules } from './rules.mjs';

export const MIN_EVIDENCE = 3;

export function checkCorpus({ corpusDir = CORPUS_DIR, rulesPath = RULES_PATH } = {}) {
  const rules = loadRules(rulesPath);
  const pairs = loadCorpus(corpusDir);

  const perKind = {};
  for (const p of pairs) perKind[p.spec.kind] = (perKind[p.spec.kind] ?? 0) + 1;

  const ruleProblems = [];
  for (const kind of rules.enabled) {
    const n = perKind[kind] ?? 0;
    if (n < MIN_EVIDENCE) {
      ruleProblems.push(`${kind}: enabled with ${n} corpus pair(s); at least ${MIN_EVIDENCE} required`);
    }
  }

  const result = { total: pairs.length, identical: 0, different: 0, refused: 0, details: [], ruleProblems, perKind };
  for (const p of pairs) {
    try {
      const out = compileWithRules(p.spec, rules);
      const diffs = diffGeometry(out, p.expected);
      if (diffs.length === 0) {
        result.identical++;
      } else {
        result.different++;
        result.details.push({ file: p.file, status: 'different', notes: diffs });
      }
    } catch (e) {
      if (e instanceof Refused) {
        result.refused++;
        result.details.push({ file: p.file, status: 'refused', notes: [e.message] });
      } else {
        result.different++;
        result.details.push({ file: p.file, status: 'different', notes: [`error: ${e.message}`] });
      }
    }
  }
  return result;
}

export function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: { corpus: { type: 'string' }, rules: { type: 'string' } } }));
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  const r = checkCorpus({ corpusDir: values.corpus, rulesPath: values.rules });

  console.log(`check-corpus: ${r.total} stored pairs`);
  console.log('in-sample: these pairs were used to write the rules');
  console.log(`in-sample: ${r.identical} identical, ${r.different} different, ${r.refused} refused`);
  for (const d of r.details) {
    console.log(`  ${d.status}: ${d.file}`);
    for (const note of d.notes) console.log(`    ${note}`);
  }
  if (r.ruleProblems.length) {
    console.log('rules: evidence requirement NOT met');
    for (const p of r.ruleProblems) console.log(`  ${p}`);
  } else {
    console.log(`rules: every enabled kind has at least ${MIN_EVIDENCE} corpus pairs`);
  }
  return r.different > 0 || r.ruleProblems.length > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
