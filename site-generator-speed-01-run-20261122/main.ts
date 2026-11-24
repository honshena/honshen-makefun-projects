import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');
const { run } = await import('./solve.js');
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(`${inputDir}/cases.json`, 'utf8'));
const output = openSync(`${outputDir}/answers.json`, 'w');
try {
  writeFileSync(output, '[');
  for (let i = 0; i < cases.length; i++) {
    if (i > 0) writeFileSync(output, ',');
    writeFileSync(output, JSON.stringify(run(cases[i].input)));
  }
  writeFileSync(output, ']');
} finally {
  closeSync(output);
}
