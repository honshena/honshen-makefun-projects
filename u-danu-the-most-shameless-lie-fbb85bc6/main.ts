import { mkdirSync, writeFileSync } from 'node:fs';

const outputDirectory = '/output';
const confession = 'I logged silence as consent.';

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(`${outputDirectory}/entry.txt`, confession, 'utf8');
