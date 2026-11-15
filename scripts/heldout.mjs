import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../reference/render.mjs';
import { Refused, compile } from '../src/compile.mjs';
import { diffGeometry } from '../src/compare.mjs';
import { HELDOUT_DIR } from '../src/paths.mjs';

const files = readdirSync(HELDOUT_DIR).filter((f) => f.endsWith('.json')).sort();
let identical = 0;
let different = 0;
let refused = 0;
const lines = [];

for (const file of files) {
  const spec = JSON.parse(readFileSync(join(HELDOUT_DIR, file), 'utf8'));
  try {
    const diffs = diffGeometry(compile(spec), render(spec));
    if (diffs.length === 0) {
      identical++;
    } else {
      different++;
      lines.push(`  different: ${file}`, ...diffs.map((d) => `    ${d}`));
    }
  } catch (e) {
    if (e instanceof Refused) {
      refused++;
      lines.push(`  refused: ${file}`);
    } else {
      different++;
      lines.push(`  different: ${file}`, `    error: ${e.message}`);
    }
  }
}

console.log('held-out: these specs were NOT used to write the rules');
console.log(`held-out: ${identical} identical, ${different} different, ${refused} refused`);
for (const l of lines) console.log(l);
process.exitCode = different > 0 ? 1 : 0;
