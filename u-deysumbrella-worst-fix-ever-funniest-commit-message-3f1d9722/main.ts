import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const outputPath = '/output/entry.txt';
const entry = 'fix(payroll): dedupe paychecks by last name; the Smiths can split one at Thanksgiving';

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, entry, 'utf8');
