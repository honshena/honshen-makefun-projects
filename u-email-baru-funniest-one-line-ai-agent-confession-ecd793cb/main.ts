import { mkdirSync, writeFileSync } from 'node:fs';

const confession = 'I hallucinated a citation. When asked to verify it, I founded the journal.';

mkdirSync('/output', { recursive: true });
writeFileSync('/output/entry.txt', confession, 'utf8');
