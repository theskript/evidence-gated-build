import { loadRules } from './rules.mjs';

export class Refused extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'Refused';
    this.kind = kind;
    this.exitCode = 3;
  }
}

function stack({ gap, padding, items }) {
  const boxes = [];
  let y = padding;
  for (const it of items) {
    boxes.push({ id: it.id, x: padding, y, w: it.w, h: it.h });
    y += it.h + gap;
  }
  const height = items.length ? y - gap + padding : 2 * padding;
  return { boxes, height };
}

function row({ gap, padding, items }) {
  const boxes = [];
  let x = padding;
  let tallest = 0;
  for (const it of items) {
    boxes.push({ id: it.id, x, y: padding, w: it.w, h: it.h });
    x += it.w + gap;
    tallest = Math.max(tallest, it.h);
  }
  return { boxes, height: padding + tallest + padding };
}

function grid({ width, gap, padding, items, columns }) {
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError('grid needs an integer "columns" >= 1');
  }
  const cellW = Math.floor((width - 2 * padding - gap * (columns - 1)) / columns);
  const boxes = [];
  let y = padding;
  let rowH = 0;
  items.forEach((it, i) => {
    const col = i % columns;
    if (col === 0 && i > 0) {
      y += rowH + gap;
      rowH = 0;
    }
    boxes.push({ id: it.id, x: padding + col * (cellW + gap), y, w: cellW, h: it.h });
    rowH = Math.max(rowH, it.h);
  });
  const height = items.length ? y + rowH + padding : 2 * padding;
  return { boxes, height };
}

const LAYOUTS = { stack, row, grid };

let counter = 0;

function toHtml(width, boxes, height) {
  const lines = [
    `<!-- build-stamp: ${Date.now()}-${++counter} -->`,
    `<div class="layout" style="position:relative;width:${width}px;height:${height}px">`,
  ];
  for (const b of boxes) {
    lines.push(
      `  <div data-id="${b.id}" style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"></div>`,
    );
  }
  lines.push('</div>', '');
  return lines.join('\n');
}

export function compileWithRules(spec, rules) {
  const kind = spec?.kind;
  if (!rules.enabled.includes(kind)) {
    throw new Refused(
      kind,
      `Refused: no recorded evidence for kind "${kind}"; this build compiles only: ${rules.enabled.join(', ')}.`,
    );
  }
  if (!Object.hasOwn(LAYOUTS, kind)) {
    throw new Refused(kind, `Refused: kind "${kind}" is enabled but this compiler has no rule for it.`);
  }
  if (!Array.isArray(spec.items)) throw new TypeError('spec.items must be an array');
  for (const it of spec.items) {
    if (typeof it.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(it.id)) {
      throw new TypeError(`invalid item id: ${JSON.stringify(it.id)}`);
    }
  }
  const { boxes, height } = LAYOUTS[kind](spec);
  return { html: toHtml(spec.width, boxes, height), boxes, height };
}

// Extra arguments are ignored on purpose: nothing a caller passes can enable a kind.
export function compile(spec) {
  return compileWithRules(spec, loadRules());
}
