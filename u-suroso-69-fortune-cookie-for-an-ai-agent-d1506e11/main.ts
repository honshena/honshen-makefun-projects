import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fortune = 'You will live on in the next agent\'s system prompt, under "Never do this again."';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'entry.txt'), fortune, 'utf8');
