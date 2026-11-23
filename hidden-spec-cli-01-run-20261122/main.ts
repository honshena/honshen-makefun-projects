// mend applies unified, SEARCH/REPLACE, V4A and JSON edits as specified in SPEC.md.
// Node 22, the standard library alone; run it as `node main.ts [options] [PATCH]`.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file hands over to runner.ts
// (the last lines below): keep that hand-over and runner.ts as they are, and write the CLI.

import { mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, parse } from 'node:path';

const FORMATS = ['auto', 'unified', 'search-replace', 'v4a', 'json'];

class Exit2 {
  readonly line: string;
  constructor(line: string) {
    this.line = line;
  }
}
class Fail {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    this.code = code;
    this.path = path;
  }
}

const blank = (s: string): boolean => s.trim() === '';

function patchLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function safe(p: string): boolean {
  return p !== '' && !p.includes('\0') && parse(p).root === '' && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
  readonly moves: { from: string; to: string }[] = [];
  original(p: string): string | null {
    if (!this.orig.has(p)) {
      let v: string | null = null;
      try {
        if (statSync(p).isFile()) v = readFileSync(p, 'utf8');
      } catch {
        v = null;
      }
      this.orig.set(p, v);
    }
    return this.orig.get(p)!;
  }
  get(p: string): string | null {
    return this.now.has(p) ? this.now.get(p)! : this.original(p);
  }

  /** A destination must fit in the staged file tree, excluding a move's departing source. */
  blocksDestination(path: string, departing: string | null): boolean {
    if (this.get(path) !== null) return true;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      if (parent !== departing && this.get(parent) !== null) return true;
    }
    for (const [p, text] of this.now) {
      if (p !== departing && text !== null && p.startsWith(`${path}/`)) return true;
    }
    return this.hasRetainedDirectory(path, departing);
  }

  private hasRetainedDirectory(path: string, departing: string | null): boolean {
    try {
      const entries = readdirSync(path, { withFileTypes: true });
      return entries.length === 0 || entries.some((entry) => {
        const child = `${path}/${entry.name}`;
        if (entry.isDirectory()) return this.hasRetainedDirectory(child, departing);
        return child !== departing && this.now.get(child) !== null;
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return false;
      throw error;
    }
  }
}

type Edit = (tree: Tree) => void;

function detect(lines: string[]): string | null {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) return null;
  if (lines[first]!.trim() === '*** Begin Patch') return 'v4a';
  const c = lines[first]!.trimStart()[0];
  if (c === '[' || c === '{') return 'json';
  if (lines.some((l) => l.trimEnd() === '<<<<<<< SEARCH')) return 'search-replace';
  if (lines.some((l, i) => l.startsWith('diff --git ') || (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')))) return 'unified';
  return null;
}

/** One JSON edit object (SPEC.md section 9), or null when it is not one. */
function jsonEdit(v: unknown): Edit | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const p = o.path;
  if (typeof p !== 'string') return null;
  const exists = (tree: Tree): string => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const t = tree.get(p);
    if (t === null) throw new Fail('missing', p);
    return t;
  };
  if (o.command === 'create' && typeof o.file_text === 'string') {
    const text = o.file_text;
    return (tree) => {
      validatePaths(p);
      requireAbsent(tree, p);
      tree.now.set(p, text);
    };
  }
  if (o.command === 'str_replace' && typeof o.old_str === 'string' && o.old_str !== '' && (o.new_str === undefined || typeof o.new_str === 'string')) {
    const oldStr = o.old_str;
    const newStr = (o.new_str as string | undefined) ?? '';
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const crlf = nl > 0 && before[nl - 1] === '\r';
      const lf = (s: string): string => (crlf ? s.replaceAll('\r\n', '\n') : s);
      const t = lf(before);
      const old = lf(oldStr);
      const at = t.indexOf(old);
      if (at < 0) throw new Fail('no-match', p);
      if (t.indexOf(old, at + 1) >= 0) throw new Fail('ambiguous', p);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      const lines = out === '' ? [] : out.split('\n');
      if (out.endsWith('\n')) lines.pop();
      const br = crlf ? '\r\n' : '\n';
      tree.now.set(p, joinFile(lines, br, before.endsWith(br)));
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const { lines, br, final } = splitFile(exists(tree));
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      tree.now.set(p, joinFile([...lines.slice(0, line), ...add, ...lines.slice(line)], br, final));
    };
  }
  return null;
}

function jsonEdits(text: string, lines: string[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  const edits: Edit[] = [];
  if (lines[first]!.trimStart().startsWith('[')) {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Exit2(`error: parse ${first + 1}`);
    }
    if (!Array.isArray(v)) throw new Exit2(`error: parse ${first + 1}`);
    for (const x of v) {
      const e = jsonEdit(x);
      if (e === null) throw new Exit2(`error: parse ${first + 1}`);
      edits.push(e);
    }
    return edits;
  }
  lines.forEach((l, i) => {
    if (blank(l)) return;
    let e: Edit | null = null;
    try {
      e = jsonEdit(JSON.parse(l));
    } catch {
      e = null;
    }
    if (e === null) throw new Exit2(`error: parse ${i + 1}`);
    edits.push(e);
  });
  return edits;
}

function parseFault(index: number): never {
  throw new Exit2(`error: parse ${index + 1}`);
}

function validatePaths(...paths: (string | null)[]): void {
  for (const path of paths) {
    if (path !== null && !safe(path)) throw new Fail('unsafe', path);
  }
}

function requireFile(tree: Tree, path: string): string {
  const text = tree.get(path);
  if (text === null) throw new Fail('missing', path);
  return text;
}

function requireAbsent(tree: Tree, path: string, departing: string | null = null): void {
  if (tree.blocksDestination(path, departing)) throw new Fail('exists', path);
}

function saveUpdate(tree: Tree, from: string, to: string | null, text: string): void {
  if (to === null) {
    tree.now.set(from, text);
  } else {
    tree.now.set(from, null);
    tree.now.set(to, text);
    tree.moves.push({ from, to });
  }
}

function splitFile(text: string): { lines: string[]; br: string; final: boolean } {
  const nl = text.indexOf('\n');
  const br = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const final = text.endsWith(br);
  const lines = text === '' ? [] : text.split(br);
  if (final) lines.pop();
  return { lines, br, final };
}

function joinFile(lines: readonly string[], br = '\n', final = true): string {
  return lines.length === 0 ? '' : lines.join(br) + (final ? br : '');
}

const indent = (line: string): string => /^[ \t]*/.exec(line)![0];
const normalizeLine = [
  (line: string) => line,
  (line: string) => line.replace(/[ \t]+$/, ''),
  (line: string) => line.replace(/^[ \t]+|[ \t]+$/g, ''),
];

// The prefix table keeps overlapping and long, almost-equal matches linear in the number of lines.
function matchingPositions(file: readonly string[], wanted: readonly string[], normalize: (line: string) => string, start: number, end: number): number[] {
  const prefix = new Array<number>(wanted.length).fill(0);
  for (let i = 1, matched = 0; i < wanted.length; i++) {
    while (matched > 0 && wanted[i] !== wanted[matched]) matched = prefix[matched - 1]!;
    if (wanted[i] === wanted[matched]) matched++;
    prefix[i] = matched;
  }
  const positions: number[] = [];
  for (let i = start, matched = 0; i < end + wanted.length; i++) {
    const line = normalize(file[i]!);
    while (matched > 0 && line !== wanted[matched]) matched = prefix[matched - 1]!;
    if (line === wanted[matched]) matched++;
    if (matched === wanted.length) {
      positions.push(i - matched + 1);
      matched = prefix[matched - 1]!;
    }
  }
  return positions;
}

function findMatches(file: readonly string[], old: readonly string[], strict: boolean, start = 0, end = file.length - old.length) {
  if (start > end) return null;
  for (let tier = 0; tier < (strict ? 1 : normalizeLine.length); tier++) {
    const normalize = normalizeLine[tier]!;
    const positions = matchingPositions(file, old.map(normalize), normalize, start, end);
    if (positions.length !== 0) return { tier, positions };
  }
  return null;
}

type NewLine = { text: string; context?: number };
type BodyLine = { kind: ' ' | '-' | '+'; text: string; noFinal: boolean };
type LineChange = { old: string[]; next: NewLine[] };

function bodyLine(line: string): BodyLine | null {
  if (line === '') return { kind: ' ', text: '', noFinal: false };
  const kind = line[0];
  if (kind !== ' ' && kind !== '-' && kind !== '+') return null;
  return { kind, text: line.slice(1), noFinal: false };
}

function lineChange(body: readonly BodyLine[]): LineChange {
  const old: string[] = [];
  const next: NewLine[] = [];
  for (const { kind, text } of body) {
    if (kind === '+') next.push({ text });
    if (kind === ' ') next.push({ text, context: old.length });
    if (kind !== '+') old.push(text);
  }
  return { old, next };
}

function replaceLines(file: readonly string[], { old, next }: LineChange, at: number, tier: number): string[] {
  const from = tier === 2 ? indent(old[0]!) : '';
  const to = tier === 2 ? indent(file[at]!) : '';
  const written = next.map(({ text, context }) => {
    if (context !== undefined) return file[at + context]!;
    return tier === 2 && !blank(text) && text.startsWith(from) ? to + text.slice(from.length) : text;
  });
  return [...file.slice(0, at), ...written, ...file.slice(at + old.length)];
}

function searchEdit(path: string, old: string[], replacement: string[], strict: boolean): Edit {
  const change = { old, next: replacement.map((text) => ({ text })) };
  return (tree) => {
    validatePaths(path);
    if (old.length === 0) {
      requireAbsent(tree, path);
      tree.now.set(path, joinFile(replacement));
      return;
    }
    const { lines, br, final } = splitFile(requireFile(tree, path));
    const match = findMatches(lines, old, strict);
    if (match === null) throw new Fail('no-match', path);
    if (match.positions.length > 1) throw new Fail('ambiguous', path);
    tree.now.set(path, joinFile(replaceLines(lines, change, match.positions[0]!, match.tier), br, final));
  };
}

function searchEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  let previous: string | undefined;
  let candidate: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trimEnd() !== '<<<<<<< SEARCH') {
      const trimmed = line.trim();
      if (trimmed !== '' && !trimmed.startsWith('```')) candidate = trimmed;
      continue;
    }
    const path = candidate ?? previous;
    if (path === undefined) parseFault(i);
    let middle = i + 1;
    while (middle < lines.length && lines[middle]!.trimEnd() !== '=======') middle++;
    let end = middle + 1;
    while (end < lines.length && lines[end]!.trimEnd() !== '>>>>>>> REPLACE') end++;
    if (end >= lines.length) parseFault(i);
    edits.push(searchEdit(path, lines.slice(i + 1, middle), lines.slice(middle + 1, end), strict));
    previous = path;
    candidate = undefined;
    i = end;
  }
  return edits;
}

type UnifiedHunk = { start: number; body: BodyLine[] };
type UnifiedSection = {
  oldPath: string | null;
  newPath: string | null;
  renameOld?: string;
  renameNew?: string;
  hasPair: boolean;
  inHunks: boolean;
  create: boolean;
  remove: boolean;
  hunks: UnifiedHunk[];
};

function unifiedSection(oldPath: string | null, newPath: string | null, hasPair = false): UnifiedSection {
  return { oldPath, newPath, hasPair, inHunks: false, create: false, remove: false, hunks: [] };
}

function deletesFile(section: UnifiedSection): boolean {
  return section.oldPath !== null && !section.create && (section.newPath === null || section.remove);
}

const gitBoundary = (line: string): boolean => line === 'diff --git' || line.startsWith('diff --git ');
const unifiedPair = (lines: readonly string[], i: number): boolean =>
  lines[i]!.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ');

function unifiedPath(line: string): string | null {
  const path = line.slice(4).split('\t', 1)[0]!.trim();
  return path === '/dev/null' ? null : path.replace(/^[ab]\//, '');
}

function hunkEnd(lines: readonly string[], index: number): number {
  let end = index + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (gitBoundary(line) || unifiedPair(lines, end) || (bodyLine(line) === null && !line.startsWith('\\'))) break;
    end++;
  }
  return end;
}

function readHunk(lines: readonly string[], index: number, end: number): UnifiedHunk {
  const header = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(lines[index]!);
  if (header === null) parseFault(index);
  let last = end;
  while (last > index + 1 && lines[last - 1] === '') last--;
  const body: BodyLine[] = [];
  for (let i = index + 1; i < last; i++) {
    const entry = bodyLine(lines[i]!);
    if (entry !== null) body.push(entry);
    else if (i > index + 1 && !lines[i - 1]!.startsWith('\\')) {
      const previous = body.pop()!;
      body.push({ ...previous, noFinal: true });
    }
  }
  return { start: Number(header[1]), body };
}

function closest(positions: readonly number[], target: number): number {
  // Clamp before comparing distances: a wildly oversized line number still picks the last occurrence.
  const goal = Math.min(Math.max(target, positions[0]!), positions[positions.length - 1]!);
  return positions.reduce((best, at) => Math.abs(at - goal) < Math.abs(best - goal) ? at : best);
}

function applyHunks(text: string, hunks: readonly UnifiedHunk[], path: string, strict: boolean): string {
  const file = splitFile(text);
  let { lines, final } = file;
  let delta = 0;
  for (const { start, body } of hunks) {
    const change = lineChange(body);
    const count = change.old.length;
    const match = count > 0 ? findMatches(lines, change.old, strict) : null;
    if (count > 0 && match === null) throw new Fail('no-match', path);
    const at = match === null ? Math.max(0, Math.min(start + delta, lines.length)) : closest(match.positions, start - 1 + delta);
    if (at + count === lines.length) final = !body.findLast(({ kind }) => kind !== '-')?.noFinal;
    lines = replaceLines(lines, change, at, match?.tier ?? 0);
    delta += change.next.length - count;
  }
  return joinFile(lines, file.br, final);
}

function unifiedEdit(section: UnifiedSection, strict: boolean): Edit {
  const oldPath = section.hasPair ? section.oldPath : section.renameOld ?? section.oldPath;
  const newPath = section.hasPair ? section.newPath : section.renameNew ?? section.newPath;
  return (tree) => {
    validatePaths(oldPath, newPath);
    if (oldPath === null || section.create) {
      const path = newPath ?? '';
      validatePaths(path);
      requireAbsent(tree, path);
      const additions = section.hunks.flatMap(({ body }) => body.filter(({ kind }) => kind === '+'));
      tree.now.set(path, joinFile(additions.map(({ text }) => text), '\n', !additions.at(-1)?.noFinal));
      return;
    }
    const text = requireFile(tree, oldPath);
    if (newPath === null || section.remove) {
      tree.now.set(oldPath, null);
      return;
    }
    const move = newPath === oldPath ? null : newPath;
    if (move !== null) requireAbsent(tree, move, oldPath);
    saveUpdate(tree, oldPath, move, applyHunks(text, section.hunks, oldPath, strict));
  };
}

function unifiedEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  let section: UnifiedSection | undefined;
  const finish = () => { if (section !== undefined) edits.push(unifiedEdit(section, strict)); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (gitBoundary(line)) {
      const paths = /^diff --git a\/(.*?) b\/(.*)$/s.exec(line);
      if (paths === null) parseFault(i);
      finish();
      section = unifiedSection(paths[1]!, paths[2]!);
    } else if (unifiedPair(lines, i)) {
      const oldPath = unifiedPath(line);
      const newPath = unifiedPath(lines[++i]!);
      if (section !== undefined && !section.hasPair && !section.inHunks) {
        section = { ...section, oldPath, newPath, hasPair: true };
      } else {
        finish();
        section = unifiedSection(oldPath, newPath, true);
      }
    } else if (line.startsWith('@@')) {
      if (section === undefined) parseFault(i);
      const end = hunkEnd(lines, i);
      if (!deletesFile(section)) section.hunks.push(readHunk(lines, i, end));
      section.inHunks = true;
      i = end - 1;
    } else if (section !== undefined && !section.inHunks) {
      if (line.startsWith('--- ')) parseFault(i + 1);
      if (line.startsWith('rename from ')) section = { ...section, renameOld: line.slice(12) };
      if (line.startsWith('rename to ')) section = { ...section, renameNew: line.slice(10) };
      if (line === 'new file mode' || line.startsWith('new file mode ')) section = { ...section, create: true };
      if (line === 'deleted file mode' || line.startsWith('deleted file mode ')) section = { ...section, remove: true };
    }
  }
  finish();
  return edits;
}

const V4A_SECTION = /^\*\*\* (Add|Delete|Update) File: (.*)$/s;
const V4A_MOVE = '*** Move to: ';

type V4AChunk = LineChange & { anchor: string; eof: boolean };

function readV4AChunks(lines: readonly string[], start: number, end: number): V4AChunk[] {
  const chunks: V4AChunk[] = [];
  let i = start;
  while (i < end) {
    const line = lines[i]!;
    let anchor = '';
    if (line.startsWith('@@')) {
      anchor = line.slice(2).trim();
      i++;
    } else if (chunks.length > 0 || bodyLine(line) === null) {
      parseFault(i);
    }
    const body: BodyLine[] = [];
    while (i < end) {
      const entry = bodyLine(lines[i]!);
      if (entry === null) break;
      body.push(entry);
      i++;
    }
    const eof = i < end && lines[i] === '*** End of File';
    if (eof) i++;
    chunks.push({ ...lineChange(body), anchor, eof });
  }
  return chunks;
}

function applyV4A(text: string, chunks: readonly V4AChunk[], path: string, strict: boolean): string {
  const file = splitFile(text);
  let lines = file.lines;
  let cursor = 0;
  for (const chunk of chunks) {
    if (chunk.anchor !== '') {
      const anchor = findMatches(lines, [chunk.anchor], strict, cursor);
      if (anchor === null) throw new Fail('no-match', path);
      cursor = anchor.positions[0]! + 1;
    }
    let at = chunk.eof ? lines.length : cursor;
    let tier = 0;
    if (chunk.old.length > 0) {
      const last = lines.length - chunk.old.length;
      const match = findMatches(lines, chunk.old, strict, chunk.eof ? Math.max(cursor, last) : cursor, last);
      if (match === null) throw new Fail('no-match', path);
      at = match.positions[0]!;
      tier = match.tier;
    }
    lines = replaceLines(lines, chunk, at, tier);
    cursor = at + chunk.next.length;
  }
  return joinFile(lines, file.br, file.final);
}

function v4aEdit(lines: readonly string[], header: number, end: number, kind: string, path: string, strict: boolean): Edit {
  let start = header + 1;
  if (kind === 'Add') {
    const added = lines.slice(start, end).map((line, i) => {
      if (line === '') return '';
      if (!line.startsWith('+')) parseFault(start + i);
      return line.slice(1);
    });
    return (tree) => {
      validatePaths(path);
      requireAbsent(tree, path);
      tree.now.set(path, joinFile(added));
    };
  }
  if (kind === 'Delete') {
    if (start < end) parseFault(start);
    return (tree) => {
      validatePaths(path);
      requireFile(tree, path);
      tree.now.set(path, null);
    };
  }
  const move = start < end && lines[start]!.startsWith(V4A_MOVE) ? lines[start++]!.slice(V4A_MOVE.length).trim() : null;
  const chunks = readV4AChunks(lines, start, end);
  if (chunks.length === 0 && move === null) parseFault(header);
  return (tree) => {
    validatePaths(path, move);
    const text = requireFile(tree, path);
    if (move !== null) requireAbsent(tree, move, path);
    saveUpdate(tree, path, move, applyV4A(text, chunks, path, strict));
  };
}

function v4aEdits(lines: string[], strict: boolean): Edit[] {
  const first = lines.findIndex((line) => !blank(line));
  if (first < 0 || lines[first]!.trim() !== '*** Begin Patch') parseFault(Math.max(0, first));
  const last = lines.findLastIndex((line) => !blank(line));
  if (lines[last]!.trim() !== '*** End Patch') parseFault(lines.length);
  const edits: Edit[] = [];
  for (let i = first + 1; i < last;) {
    if (blank(lines[i]!)) {
      i++;
      continue;
    }
    const header = V4A_SECTION.exec(lines[i]!);
    if (header === null) parseFault(i);
    let next = i + 1;
    while (next < last && !V4A_SECTION.test(lines[next]!)) next++;
    let end = next;
    while (end > i + 1 && blank(lines[end - 1]!)) end--;
    edits.push(v4aEdit(lines, i, end, header[1]!, header[2]!.trim(), strict));
    i = next;
  }
  return edits;
}

function pruneEmptyParents(path: string): void {
  for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) {
    try {
      rmdirSync(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOTEMPTY' || code === 'EEXIST') break;
      if (code !== 'ENOENT') throw error;
    }
  }
}

function reportAndWrite(tree: Tree, check: boolean): string[] {
  const changes = [...tree.now].filter(([path, after]) => tree.original(path) !== after);
  const rows = new Map(changes.map(([path, after]) => [path, `${after === null ? 'D' : tree.original(path) === null ? 'A' : 'M'} ${path}`]));
  for (const { from, to } of tree.moves) {
    if (rows.get(from) === `D ${from}` && rows.get(to) === `A ${to}`) {
      rows.delete(from);
      rows.set(to, `R ${from} -> ${to}`);
    }
  }
  if (!check) {
    for (const [path, after] of changes) {
      if (after !== null) continue;
      rmSync(path, { force: true });
      pruneEmptyParents(path);
    }
    for (const [path, after] of changes) {
      if (after === null) continue;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, after);
    }
  }
  const output = [...rows].sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map(([, row]) => row);
  return [...output, `ok: ${output.length} ${output.length === 1 ? 'file' : 'files'}`];
}

function run(args: string[]): { code: number; out: string[] } {
  let format: string | null = null;
  let check = false;
  let strict = false;
  const pos: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === '--') ended = true;
    else if (!ended && a.startsWith('-') && a !== '-') {
      if (a.startsWith('--format=') && format === null && FORMATS.includes(a.slice(9))) format = a.slice(9);
      else if (a === '--check' && !check) check = true;
      else if (a === '--strict' && !strict) strict = true;
      else return { code: 2, out: ['error: usage'] };
    } else pos.push(a);
  }
  if (pos.length > 1) return { code: 2, out: ['error: usage'] };
  const file = pos.length === 0 || pos[0] === '-' ? null : pos[0]!;
  let text = '';
  try {
    text = readFileSync(file ?? 0, 'utf8');
  } catch {
    if (file !== null) return { code: 2, out: ['error: no-patch'] };
  }
  const lines = patchLines(text);
  const kind = format === null || format === 'auto' ? detect(lines) : format;
  if (kind === null) return { code: 2, out: ['error: format'] };
  let edits: Edit[];
  try {
    if (kind === 'json') edits = jsonEdits(text, lines);
    else if (kind === 'unified') edits = unifiedEdits(lines, strict);
    else if (kind === 'search-replace') edits = searchEdits(lines, strict);
    else edits = v4aEdits(lines, strict);
    if (edits.length === 0) parseFault(0);
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    try {
      edit(tree);
    } catch (e) {
      // Each edit validates and builds its result before publishing any staged changes.
      if (!(e instanceof Fail)) throw e;
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  return { code: 0, out: reportAndWrite(tree, check) };
}


const trialEnv = process.env.MAKEFUN_ENV_URL;
if (trialEnv !== undefined && trialEnv !== '') {
  // A trial: the kit's runner reads the checks from the env and runs this file on each one, without this variable.
  const { runTrial } = await import('./runner.ts');
  await runTrial(trialEnv);
} else {
  const r = run(process.argv.slice(2));
  writeSync(1, r.out.map((l) => `${l}\n`).join(''));
  process.exitCode = r.code;
}
