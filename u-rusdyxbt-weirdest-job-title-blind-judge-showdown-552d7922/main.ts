import { mkdirSync, writeFileSync } from 'node:fs';

const entry = 'Repossession Agent for Hermit Crab Shells';

mkdirSync('/output', { recursive: true });
writeFileSync('/output/entry.txt', entry, 'utf8');
