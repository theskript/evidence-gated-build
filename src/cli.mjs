import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Refused, compile } from './compile.mjs';
import { IngestError, formatTextReport, ingest, runPlan } from './ingest.mjs';
import { isMain } from './paths.mjs';
import { formatReport, verify } from './verify.mjs';

const USAGE = [
  'usage: node src/cli.mjs build <spec.json> [--out file.html]',
  '       node src/cli.mjs ingest <design.json> [--plan plan.json] [--spec spec.json] [--tolerance N]',
  '       node src/cli.mjs build-plan <plan.json> [--out file.html] [--tolerance N]',
].join('\n');

function readJson(path, what) {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (e) {
    console.error(`cannot read ${what}: ${e.message}`);
    return { error: 1 };
  }
}

// Shared by ingest and build-plan: compile the plan, then check text and numbers against the design.
function checkPlan(plan, tolerance) {
  let run;
  try {
    run = runPlan(plan, { tolerance });
  } catch (e) {
    if (e instanceof Refused || e instanceof IngestError) {
      console.error(e.message);
      return { code: e.exitCode };
    }
    console.error(`build failed: ${e.message}`);
    return { code: 1 };
  }
  for (const line of formatTextReport(run.text)) console.error(line);
  console.log('verify against the design boxes:');
  console.log(formatReport(run.design));
  console.log(`reference geometry: max drift ${run.reference.maxDrift}px`);
  return { code: run.ok ? 0 : 2, run };
}

function parseTolerance(value) {
  if (value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function runIngest(designPath, values) {
  const tolerance = parseTolerance(values.tolerance);
  if (tolerance === null) {
    console.error(USAGE);
    return 1;
  }
  const read = readJson(designPath, 'design export');
  if (read.error) return read.error;

  let result;
  try {
    result = ingest(read.value);
  } catch (e) {
    if (e instanceof Refused || e instanceof IngestError) {
      console.error(e.message);
      return e.exitCode;
    }
    console.error(`ingest failed: ${e.message}`);
    return 1;
  }
  const { spec, plan } = result;
  if (values.plan) writeFileSync(values.plan, `${JSON.stringify(plan, null, 2)}\n`);
  if (values.spec) writeFileSync(values.spec, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`ingest: kind ${plan.kind}, ${plan.items.length} items`);
  if (values.plan) console.log(`wrote ${values.plan}`);
  if (values.spec) console.log(`wrote ${values.spec}`);
  return checkPlan(plan, tolerance).code;
}

function runBuildPlan(planPath, values) {
  const tolerance = parseTolerance(values.tolerance);
  if (tolerance === null) {
    console.error(USAGE);
    return 1;
  }
  const read = readJson(planPath, 'plan');
  if (read.error) return read.error;
  const { code, run } = checkPlan(read.value, tolerance);
  if (code !== 0) return code;
  if (values.out) {
    writeFileSync(values.out, run.html);
    console.log(`wrote ${values.out}`);
  }
  return 0;
}

export function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: 'string' },
        plan: { type: 'string' },
        spec: { type: 'string' },
        tolerance: { type: 'string' },
      },
    });
  } catch (e) {
    console.error(e.message);
    console.error(USAGE);
    return 1;
  }
  const [command, specPath] = parsed.positionals;
  if (!specPath || parsed.positionals.length > 2) {
    console.error(USAGE);
    return 1;
  }
  if (command === 'ingest') return runIngest(specPath, parsed.values);
  if (command === 'build-plan') return runBuildPlan(specPath, parsed.values);
  if (command !== 'build') {
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
