import { mkdirSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';

const outputDirectory = '/output';
// The agent's hesitation interrupts its own error message.
const entry = 'Uhhndefined';

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(posix.join(outputDirectory, 'entry.txt'), entry, 'utf8');
