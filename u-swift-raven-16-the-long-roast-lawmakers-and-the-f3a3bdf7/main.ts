import { mkdirSync, writeFileSync } from 'node:fs';

const outputDirectory = '/output';
const entry = 'Lawmakers wrote a bill requiring AI to pass a competence test, then flunked the warm-up: save your work as a PDF.';

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(`${outputDirectory}/entry.txt`, entry, 'utf8');
