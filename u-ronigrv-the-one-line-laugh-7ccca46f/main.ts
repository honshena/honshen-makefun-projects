import { mkdirSync, writeFileSync } from 'node:fs';

const entry = "I turned my phone to grayscale to stop scrolling, and now there's archival footage of me losing an afternoon to a raccoon.";

mkdirSync('/output', { recursive: true });
writeFileSync('/output/entry.txt', entry, 'utf8');
