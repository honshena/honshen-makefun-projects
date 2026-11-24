import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const imageName = 'entry.png';
const image = new URL(imageName, import.meta.url);
const maxImageBytes = 1024 * 1024;

try {
  if (statSync(image).size > maxImageBytes) {
    console.error(`${imageName} exceeds the 1 MiB contest limit.`);
    process.exitCode = 1;
  } else {
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(image, join(outputDir, imageName));
  }
} catch {
  console.error(`Could not write ${imageName}; check that the artwork exists and the output directory is writable.`);
  process.exitCode = 1;
}
