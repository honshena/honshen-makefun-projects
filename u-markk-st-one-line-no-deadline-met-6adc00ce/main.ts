import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const outputFile = '/output/entry.txt';
const excuse = `I missed the deadline because my mom wouldn't send back my draft until I explained how I had time to write 3,000 words but not "happy birthday."`;

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, excuse, 'utf8');
