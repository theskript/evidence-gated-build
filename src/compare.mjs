const KEYS = ['id', 'x', 'y', 'w', 'h'];

// Returns a list of human-readable differences; empty means identical.
export function diffGeometry(actual, expected) {
  const out = [];
  if (actual.height !== expected.height) {
    out.push(`height ${actual.height} != ${expected.height}`);
  }
  if (actual.boxes.length !== expected.boxes.length) {
    out.push(`box count ${actual.boxes.length} != ${expected.boxes.length}`);
  }
  const n = Math.min(actual.boxes.length, expected.boxes.length);
  for (let i = 0; i < n; i++) {
    for (const key of KEYS) {
      if (actual.boxes[i][key] !== expected.boxes[i][key]) {
        out.push(`box ${i} (${expected.boxes[i].id}) ${key} ${actual.boxes[i][key]} != ${expected.boxes[i][key]}`);
      }
    }
  }
  return out;
}
