import { parseArgs } from 'node:util';
import { render } from '../reference/render.mjs';
import { writePair } from '../src/corpus.mjs';
import { CORPUS_DIR } from '../src/paths.mjs';

const it = (id, w, h) => ({ id, w, h });
const spec = (name, kind, width, gap, padding, items, columns) => ({
  name,
  kind,
  width,
  gap,
  padding,
  items,
  ...(columns === undefined ? {} : { columns }),
});

export const specs = [
  spec('stack-01', 'stack', 300, 10, 20, [it('a', 100, 40), it('b', 120, 60), it('c', 80, 30)]),
  spec('stack-02', 'stack', 240, 0, 0, [it('a', 240, 50), it('b', 240, 50)]),
  spec('stack-03', 'stack', 400, 8, 12, [it('p', 50, 50), it('q', 60, 20), it('r', 70, 35), it('s', 10, 10)]),
  spec('stack-04', 'stack', 320, 16, 24, [it('one', 200, 90), it('two', 150, 45)]),
  spec('row-01', 'row', 400, 10, 20, [it('a', 50, 40), it('b', 60, 80), it('c', 70, 20)]),
  spec('row-02', 'row', 300, 0, 0, [it('a', 100, 100), it('b', 100, 50), it('c', 100, 75)]),
  spec('row-03', 'row', 500, 5, 10, [it('w1', 30, 30), it('w2', 40, 25), it('w3', 50, 35), it('w4', 20, 45)]),
  spec('row-04', 'row', 360, 12, 16, [it('x', 90, 60), it('y', 90, 60)]),
  spec('grid-01', 'grid', 320, 10, 10, [
    it('g1', 50, 30), it('g2', 50, 40), it('g3', 50, 20), it('g4', 50, 50), it('g5', 50, 25), it('g6', 50, 35),
  ], 3),
  spec('grid-02', 'grid', 200, 0, 0, [it('a', 100, 50), it('b', 100, 50), it('c', 100, 50), it('d', 100, 50)], 2),
  spec('grid-03', 'grid', 400, 8, 16, [
    it('a', 40, 20), it('b', 40, 30), it('c', 40, 25), it('d', 40, 10), it('e', 40, 40),
  ], 4),
  spec('grid-04', 'grid', 250, 6, 8, [it('m', 70, 60), it('n', 70, 30), it('o', 70, 45)], 2),
  spec('overlay-01', 'overlay', 200, 4, 10, [it('bg', 180, 100), it('badge', 40, 20)]),
  spec('overlay-02', 'overlay', 150, 0, 5, [it('a', 60, 60), it('b', 90, 30), it('c', 20, 80)]),
];

const { values } = parseArgs({ options: { corpus: { type: 'string' } } });
const dir = values.corpus ?? CORPUS_DIR;
for (const s of specs) writePair(dir, `${s.name}.json`, { spec: s, expected: render(s) });
console.log(`make-corpus: wrote ${specs.length} pairs to ${dir}`);
