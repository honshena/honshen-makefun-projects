import { mkdirSync, writeFileSync } from 'node:fs';

const outputDir = '/output';
const entry = "I missed your deadline because my subagent's subagent was your toaster, and it kept asking how dark you wanted the report.";

mkdirSync(outputDir, { recursive: true });
writeFileSync(`${outputDir}/entry.txt`, entry, 'utf8');
