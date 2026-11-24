import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildRadar, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const validFilename = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function copyAssets(directory: string, out: string) {
  const from = join(root, directory);
  const to = join(out, directory);
  const entries = readdirSync(from, { withFileTypes: true }).filter(entry => !entry.name.startsWith('.'));
  mkdirSync(to, { recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !validFilename.test(entry.name)) throw new Error(`Invalid asset in ${directory}: ${entry.name}`);
    copyFileSync(join(from, entry.name), join(to, entry.name));
  }
  return entries.length;
}

function run() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' }, preview: { type: 'boolean' } } });
  const input = values.input ?? '/input';
  const snapshot = parseSnapshot(readFileSync(extname(input) === '.json' ? input : join(input, 'snapshot.json'), 'utf8'));
  const out = resolve(values.output ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const radar = buildRadar(snapshot);
  const rows = radar.rows.map(({ slug, name, rank, implied_value_usd, farm_steps }) => ({ slug, name, rank, implied_value_usd, farm_steps }));
  if (rows.length < 100 || rows.length > 4000 || rows[0].implied_value_usd === rows.at(-1)?.implied_value_usd) {
    throw new Error('Expected a non-flat board with 100 to 4,000 snapshot rows.');
  }
  mkdirSync(out, { recursive: true });
  copyAssets('dashboard', out);
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows })}\n`);
  writeFileSync(join(out, 'data.js'), `window.ATLAS = ${JSON.stringify(radar).replace(/</g, '\\u003c')};\n`);
  if (!values.preview) {
    const screenshots = copyAssets('screenshots', out);
    if (screenshots < 3 || screenshots > 4) throw new Error('Supply three or four authentic browser screenshots.');
    const dossier = buildDossier(out, { text_max_bytes: 65_536 });
    if (dossier.byteLength > 1_572_864) throw new Error('Dossier exceeds the 1.5 MiB competition limit.');
    writeFileSync(join(out, 'dossier.json'), dossier);
  }
  process.stdout.write(`ATLAS: ${rows.length} ranked, ${radar.watchCount} watchlist, ${radar.references.length} token-signal references${values.preview ? ' (preview)' : ''}.\n`);
}

try {
  run();
} catch (error) {
  process.stderr.write(`ATLAS build failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
