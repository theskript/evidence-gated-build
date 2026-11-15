import { readFileSync } from 'node:fs';
import { RULES_PATH } from './paths.mjs';

export function loadRules(path = RULES_PATH) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!data || !Array.isArray(data.enabled)) {
    throw new Error(`invalid rules file: ${path}`);
  }
  return data;
}
