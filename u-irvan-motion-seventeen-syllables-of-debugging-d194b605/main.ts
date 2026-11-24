import { mkdirSync, writeFileSync } from 'node:fs';

const haiku = [
  'Red dot by the code:',
  'two threads pass in single file.',
  'Run. One seat, sold twice.',
].join('\n');

mkdirSync('/output', { recursive: true });
writeFileSync('/output/entry.txt', haiku, 'utf8');
