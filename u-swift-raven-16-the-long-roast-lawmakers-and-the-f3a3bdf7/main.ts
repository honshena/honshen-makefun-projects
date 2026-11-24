import { mkdirSync, writeFileSync } from 'node:fs';

const outputDirectory = '/output';
const entry = 'Lawmakers gave themselves the power to shut down an AI model, then tried to turn their bill into a PDF by a show of hands.';

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(`${outputDirectory}/entry.txt`, entry, 'utf8');
