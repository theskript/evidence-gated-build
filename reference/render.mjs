// Stand-in for an external renderer we do not control. Deliberately naive and O(n^2).

export function render(spec) {
  const { kind, width, gap, padding, items } = spec;
  const n = items.length;

  if (kind === 'stack') {
    const boxes = [];
    for (let i = 0; i < n; i++) {
      let y = padding;
      for (let j = 0; j < i; j++) y += items[j].h + gap;
      boxes.push({ id: items[i].id, x: padding, y, w: items[i].w, h: items[i].h });
    }
    let height = padding;
    for (let i = 0; i < n; i++) height += items[i].h;
    if (n > 1) height += gap * (n - 1);
    height += padding;
    return { boxes, height };
  }

  if (kind === 'row') {
    const boxes = [];
    for (let i = 0; i < n; i++) {
      let x = padding;
      for (let j = 0; j < i; j++) x += items[j].w + gap;
      boxes.push({ id: items[i].id, x, y: padding, w: items[i].w, h: items[i].h });
    }
    let tallest = 0;
    for (let i = 0; i < n; i++) if (items[i].h > tallest) tallest = items[i].h;
    return { boxes, height: padding + tallest + padding };
  }

  if (kind === 'grid') {
    const columns = spec.columns;
    if (!Number.isInteger(columns) || columns < 1) {
      throw new RangeError('reference: grid needs an integer "columns" >= 1');
    }
    const cellW = Math.floor((width - 2 * padding - gap * (columns - 1)) / columns);
    const rows = Math.ceil(n / columns);
    const rowHeight = (r) => {
      let tallest = 0;
      for (let i = 0; i < n; i++) {
        if (Math.floor(i / columns) === r && items[i].h > tallest) tallest = items[i].h;
      }
      return tallest;
    };
    const boxes = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / columns);
      const col = i % columns;
      let y = padding;
      for (let r = 0; r < row; r++) y += rowHeight(r) + gap;
      boxes.push({ id: items[i].id, x: padding + col * (cellW + gap), y, w: cellW, h: items[i].h });
    }
    let height = padding;
    for (let r = 0; r < rows; r++) height += rowHeight(r);
    if (rows > 1) height += gap * (rows - 1);
    height += padding;
    return { boxes, height };
  }

  if (kind === 'overlay') {
    const boxes = items.map((it) => ({ id: it.id, x: padding, y: padding, w: it.w, h: it.h }));
    let tallest = 0;
    for (let i = 0; i < n; i++) if (items[i].h > tallest) tallest = items[i].h;
    return { boxes, height: padding + tallest + padding };
  }

  throw new Error(`reference: unsupported kind "${kind}"`);
}
