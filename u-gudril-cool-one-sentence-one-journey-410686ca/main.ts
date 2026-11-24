import { mkdirSync, writeFileSync } from 'node:fs';

const outputDir = '/output';
const entry = 'I set out across the salt flats in my father’s boots to sell them for a ticket home, but halfway to the station I found a boy wrapping his feet in newspaper, and at the station I sold my coat and watched my father’s boots climb aboard without me.';

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/entry.txt`, entry, 'utf8');
