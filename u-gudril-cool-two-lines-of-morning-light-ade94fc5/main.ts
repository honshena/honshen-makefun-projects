import { mkdirSync, writeFileSync } from 'node:fs';

const poem = [
  'First light slips under the gate',
  'and fills each hoofprint to the lip',
].join('\n');

mkdirSync('/output', { recursive: true });
writeFileSync('/output/entry.txt', poem, 'utf8');
