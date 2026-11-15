import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORPUS_DIR } from './paths.mjs';

export function loadCorpus(dir = CORPUS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, ...JSON.parse(readFileSync(join(dir, file), 'utf8')) }));
}

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function ser(v, pad) {
  const inner = pad + '  ';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const rows = v.map((x) => inner + (isObject(x) ? JSON.stringify(x) : ser(x, inner)));
    return '[\n' + rows.join(',\n') + '\n' + pad + ']';
  }
  if (isObject(v)) {
    const rows = Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${ser(x, inner)}`);
    return '{\n' + rows.join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(v);
}

// One box or item per line, so corpus diffs stay readable.
export function formatPair({ spec, expected }) {
  return ser({ spec, expected }, '') + '\n';
}

export function writePair(dir, file, pair) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), formatPair(pair));
}
