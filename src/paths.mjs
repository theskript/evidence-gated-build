import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const RULES_PATH = join(ROOT, 'evidence', 'rules.json');
export const CORPUS_DIR = join(ROOT, 'evidence', 'corpus');
export const HELDOUT_DIR = join(ROOT, 'heldout');

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}
