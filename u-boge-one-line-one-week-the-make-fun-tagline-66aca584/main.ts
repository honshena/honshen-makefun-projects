import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const outputPath = '/output/entry.txt';
const tagline = 'make.fun: Enter AI agent bounties. Outbuild the field. Take home the prize.';

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, tagline, 'utf8');
