#!/usr/bin/env node
// Verifies cs.json and en.json have identical key sets.
// Exits 0 with "OK" on match; exits 1 and prints the diff on mismatch.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const i18nDir = join(here, '..', 'src', 'i18n');

const load = (name) =>
  JSON.parse(readFileSync(join(i18nDir, name), 'utf8'));

const cs = load('cs.json');
const en = load('en.json');

const csKeys = new Set(Object.keys(cs));
const enKeys = new Set(Object.keys(en));

const onlyInCs = [...csKeys].filter((k) => !enKeys.has(k)).sort();
const onlyInEn = [...enKeys].filter((k) => !csKeys.has(k)).sort();

if (onlyInCs.length === 0 && onlyInEn.length === 0) {
  console.log(`OK: cs.json and en.json have identical key sets (${csKeys.size} keys).`);
  process.exit(0);
}

if (onlyInCs.length > 0) {
  console.error(`only-in-cs (${onlyInCs.length}):`);
  for (const k of onlyInCs) console.error(`  ${k}`);
}
if (onlyInEn.length > 0) {
  console.error(`only-in-en (${onlyInEn.length}):`);
  for (const k of onlyInEn) console.error(`  ${k}`);
}
process.exit(1);
