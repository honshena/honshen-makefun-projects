import { mkdirSync, writeFileSync } from 'node:fs';

const outputDir = '/output';
const entry = '3:00 AM | Fridge: You shut me with your forehead. Face ID filed you under Leftovers. Best by Thursday.';

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/entry.txt`, entry, 'utf8');
