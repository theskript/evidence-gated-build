import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Refused, compile } from './compile.mjs';
import { isMain } from './paths.mjs';
import { formatReport, verify } from './verify.mjs';

const USAGE = 'usage: node src/cli.mjs build <spec.json> [--out file.html]';

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, options: { out: { type: 'string' } } });
  } catch (e) {
    console.error(e.message);
    console.error(USAGE);
    return 1;
  }
  const [command, specPath] = parsed.positionals;
  if (command !== 'build' || !specPath || parsed.positionals.length > 2) {
    console.error(USAGE);
    return 1;
  }

  let spec;
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf8'));
  } catch (e) {
    console.error(`cannot read spec: ${e.message}`);
    return 1;
  }

  let result;
  try {
    result = compile(spec);
  } catch (e) {
    if (e instanceof Refused) {
      console.error(e.message);
      return e.exitCode;
    }
    console.error(`build failed: ${e.message}`);
    return 1;
  }

  const report = verify(result.html, spec);
  console.log(formatReport(report));
  if (!report.ok) return 2;

  if (parsed.values.out) {
    writeFileSync(parsed.values.out, result.html);
    console.log(`wrote ${parsed.values.out}`);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
