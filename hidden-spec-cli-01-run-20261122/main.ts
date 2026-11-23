// main.ts is mend, the CLI SPEC.md specifies, and this is the kit's starting point for it (MIT). It does sections 1 to 4, 9 and 10 of SPEC.md: the command line, the output and
// exit codes, safe paths, format detection, JSON edits and the all-or-nothing write. The other three formats are
// detected and then read as holding no edit, so they answer `error: parse 1`: reading unified diffs (section 6),
// SEARCH/REPLACE blocks (section 7) and V4A patches (section 8), and matching lines at three tiers (section 5), are
// yours to write. Node 22, the standard library alone; run it as `node main.ts [options] [PATCH]`.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file hands over to runner.ts
// (the last lines below): keep that hand-over and runner.ts as they are, and write the CLI.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

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
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
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
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
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
      let count = 0;
      for (let k = t.indexOf(old); k >= 0; k = t.indexOf(old, k + 1)) count += 1;
      if (count === 0) throw new Fail('no-match', p);
      if (count > 1) throw new Fail('ambiguous', p);
      const at = t.indexOf(old);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      tree.now.set(p, crlf ? out.replaceAll('\n', '\r\n') : out);
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const br = nl > 0 && before[nl - 1] === '\r' ? '\r\n' : '\n';
      const lines = before === '' ? [] : before.split(br);
      const final = before !== '' && before.endsWith(br);
      if (final) lines.pop();
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      lines.splice(line, 0, ...add);
      tree.now.set(p, lines.length === 0 ? '' : lines.join(br) + (final ? br : ''));
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
    edits = kind === 'json' ? jsonEdits(text, lines) : kind === 'search-replace' ? searchEdits(lines, strict) : kind === 'v4a' ? v4aEdits(lines, strict) : unifiedEdits(lines, strict);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const rows: string[] = [];
  for (const p of [...tree.now.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    rows.push(`${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}`);
    if (check) continue;
    if (now === null) rmSync(p, { force: true });
    else {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, now);
    }
  }
  return { code: 0, out: [...rows, `ok: ${rows.length} ${rows.length === 1 ? 'file' : 'files'}`] };
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
function fileLines(t:string){const br=t.includes('\n')&&t.slice(0,t.indexOf('\n')).endsWith('\r')?'\r\n':'\n';let a=t===''?[]:t.split(br);const end=t!==''&&t.endsWith(br);if(end)a.pop();return {a,br,end};}
function matching(a:string[],o:string[],strict:boolean){for(let tier=0;tier<=(strict?0:2);tier++){const norm=(s:string)=>tier===0?s:tier===1?s.replace(/[ \t]+$/,''):s.trim();const hits:number[]=[];for(let i=0;i+o.length<=a.length;i++)if(o.every((v,j)=>norm(a[i+j]!)===norm(v)))hits.push(i);if(hits.length)return {tier,hits};}return {tier:-1,hits:[]};}
function replaceLines(a:string[],o:string[],n:string[],at:number,tier:number){let out=[...n];if(tier===2&&o.length){const f=a[at]!.match(/^[ \t]*/)?.[0]||'',p=o[0]!.match(/^[ \t]*/)?.[0]||'';out=out.map(x=>x.trim()&&p&&x.startsWith(p)?f+x.slice(p.length):x);}for(let j=0;j<o.length;j++)if(o[j]===n[j]&&j<out.length)out[j]=a[at+j]!;a.splice(at,o.length,...out);}
function lineEdit(path:string,old:string[],neu:string[],strict:boolean,mode:'unique'|'first'|'nearest',anchor=0):Edit{return tree=>{if(!safe(path))throw new Fail('unsafe',path);const t=tree.get(path);if(t===null)throw new Fail('missing',path);const {a,br,end}=fileLines(t);const m=matching(a,old,strict);if(m.hits.length===0)throw new Fail('no-match',path);if(mode==='unique'&&m.hits.length!==1)throw new Fail('ambiguous',path);let at=mode==='nearest'?m.hits.reduce((x,y)=>Math.abs(y-anchor)<Math.abs(x-anchor)?y:x):m.hits[0]!;replaceLines(a,old,neu,at,m.tier);tree.now.set(path,a.join(br)+(end?br:''));};}
function searchEdits(lines:string[],strict:boolean):Edit[]{const out:Edit[]=[];let prev=-1,lastPath:string|undefined;for(let i=0;i<lines.length;i++){if(lines[i]!.trimEnd()!=='<<<<<<< SEARCH')continue;let p:string|undefined;for(let k=i-1;k>prev;k--)if(!blank(lines[k]!)&&!lines[k]!.trim().startsWith('```')){p=lines[k]!.trim();break;}p??=lastPath;if(!p)throw new Exit2(`error: parse ${i+1}`);let sep=i+1;while(sep<lines.length&&lines[sep]!=='=======')sep++;let end=sep+1;while(end<lines.length&&lines[end]!.trimEnd()!=='>>>>>>> REPLACE')end++;if(sep>=lines.length||end>=lines.length)throw new Exit2(`error: parse ${i+1}`);const old=lines.slice(i+1,sep),neu=lines.slice(sep+1,end);if(!old.length)out.push(tree=>{if(!safe(p!))throw new Fail('unsafe',p!);if(tree.get(p!)!==null)throw new Fail('exists',p!);tree.now.set(p!,neu.join('\n')+'\n');});else out.push(lineEdit(p,old,neu,strict,'unique'));prev=end;lastPath=p;i=end;}return out;}
function v4aEdits(lines: string[], strict: boolean): Edit[] {
  let begin = lines.findIndex(line => !blank(line));
  let end = lines.length - 1;
  while (end >= 0 && blank(lines[end]!)) end--;
  if (begin < 0 || lines[begin]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${begin < 0 ? 1 : begin + 1}`);
  if (end < 0 || lines[end]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${lines.length + 1}`);
  const edits: Edit[] = [];
  const sectionHead = (line: string) => /^\*\*\* (?:Add File: |Delete File: |Update File: )/.test(line);
  for (let pos = begin + 1; pos < end;) {
    if (blank(lines[pos]!)) { pos++; continue; }
    const headerLine = pos + 1;
    const header = lines[pos++]!;
    const kind = header.startsWith('*** Add File: ') ? 'add' : header.startsWith('*** Delete File: ') ? 'delete' : header.startsWith('*** Update File: ') ? 'update' : null;
    if (!kind) throw new Exit2(`error: parse ${headerLine}`);
    const prefix = kind === 'add' ? '*** Add File: ' : kind === 'delete' ? '*** Delete File: ' : '*** Update File: ';
    const path = header.slice(prefix.length).trim();
    const body: { text: string; line: number }[] = [];
    while (pos < end && !sectionHead(lines[pos]!)) body.push({ text: lines[pos]!, line: ++pos });
    while (body.length && blank(body[body.length - 1]!.text)) body.pop();
    if (kind === 'add') {
      if (body.some(item => item.text !== '' && !item.text.startsWith('+'))) throw new Exit2(`error: parse ${body.find(item => item.text !== '' && !item.text.startsWith('+'))!.line}`);
      const content = body.map(item => item.text === '' ? '' : item.text.slice(1));
      edits.push(tree => {
        if (!safe(path)) throw new Fail('unsafe', path);
        if (tree.get(path) !== null) throw new Fail('exists', path);
        tree.now.set(path, content.length ? content.join('\n') + '\n' : '');
      });
    } else if (kind === 'delete') {
      if (body.length) throw new Exit2(`error: parse ${body[0]!.line}`);
      edits.push(tree => {
        if (!safe(path)) throw new Fail('unsafe', path);
        if (tree.get(path) === null) throw new Fail('missing', path);
        tree.now.set(path, null);
      });
    } else {
      let moveTo: string | null = null;
      let bodyStart = 0;
      if (body[0]?.text.startsWith('*** Move to: ')) {
        moveTo = body[0]!.text.slice('*** Move to: '.length).trim();
        bodyStart = 1;
      }
      type Chunk = { anchor: string; eof: boolean; old: string[]; next: string[] };
      const chunks: Chunk[] = [];
      let chunk: Chunk | null = null;
      const finishChunk = () => { if (chunk) { chunks.push(chunk); chunk = null; } };
      for (const item of body.slice(bodyStart)) {
        const text = item.text;
        if (text.startsWith('@@')) {
          finishChunk();
          chunk = { anchor: text.slice(2).trim(), eof: false, old: [], next: [] };
        } else if (text === '*** End of File') {
          if (!chunk) chunk = { anchor: '', eof: true, old: [], next: [] };
          chunk.eof = true;
          finishChunk();
        } else {
          if (!chunk) chunk = { anchor: '', eof: false, old: [], next: [] };
          if (text === '') { chunk.old.push(''); chunk.next.push(''); }
          else if (text[0] === ' ') { chunk.old.push(text.slice(1)); chunk.next.push(text.slice(1)); }
          else if (text[0] === '-') chunk.old.push(text.slice(1));
          else if (text[0] === '+') chunk.next.push(text.slice(1));
          else throw new Exit2(`error: parse ${item.line}`);
        }
      }
      finishChunk();
      if (!chunks.length && moveTo === null) throw new Exit2(`error: parse ${headerLine}`);
      edits.push(tree => {
        if (!safe(path)) throw new Fail('unsafe', path);
        const initial = tree.get(path);
        if (initial === null) throw new Fail('missing', path);
        if (moveTo !== null) {
          if (!safe(moveTo)) throw new Fail('unsafe', moveTo);
          if (tree.get(moveTo) !== null) throw new Fail('exists', moveTo);
        }
        const file = fileLines(initial);
        const content = [...file.a];
        let cursor = 0;
        for (const part of chunks) {
          if (part.anchor) {
            let found = -1;
            for (let tier = 0; tier <= (strict ? 0 : 2) && found < 0; tier++) {
              const normalize = (value: string) => tier === 0 ? value : tier === 1 ? value.replace(/[ \t]+$/, '') : value.trim();
              for (let at = cursor; at < content.length; at++) if (normalize(content[at]!) === normalize(part.anchor)) { found = at; break; }
            }
            if (found < 0) throw new Fail('no-match', path);
            cursor = found + 1;
          }
          let at = cursor;
          let tier = 0;
          if (part.old.length) {
            let found: ReturnType<typeof matching> | null = null;
            for (let t = 0; t <= (strict ? 0 : 2) && !found; t++) {
              const candidates = matching(content, part.old, t === 0);
              const filtered = candidates.hits.filter(index => index >= cursor && (!part.eof || index + part.old.length === content.length));
              if (filtered.length) found = { tier: t, hits: filtered };
            }
            if (!found) throw new Fail('no-match', path);
            at = found.hits[0]!;
            tier = found.tier;
          } else if (part.eof) at = content.length;
          replaceLines(content, part.old, part.next, at, tier);
          cursor = at + part.next.length;
        }
        const result = content.join(file.br) + (file.end ? file.br : '');
        if (moveTo !== null) {
          tree.now.set(moveTo, result);
          tree.now.set(path, null);
        } else {
          tree.now.set(path, result);
        }
      });
    }
  }
  return edits;
}
function unifiedEdits(lines:string[],strict:boolean):Edit[]{const out:Edit[]=[];for(let i=0;i<lines.length;){if(!lines[i]!.startsWith('diff --git ')&&!(lines[i]!.startsWith('--- ')&&(lines[i+1]||'').startsWith('+++ '))){i++;continue;}let old='',neu='',create=false,del=false;const start=i;if(lines[i]!.startsWith('diff --git ')){const m=lines[i]!.match(/^diff --git a\/(.+) b\/(.+)$/);if(!m)throw new Exit2(`error: parse ${i+1}`);old=m[1]!;neu=m[2]!;i++;}let hs:{o:string[];n:string[];a:number}[]=[];while(i<lines.length&&!lines[i]!.startsWith('diff --git ')){if(lines[i]!.startsWith('--- ')){if(!(lines[i+1]||'').startsWith('+++ '))throw new Exit2(`error: parse ${i+2}`);old=lines[i]!.slice(4).split('\t')[0]!.trim().replace(/^a\//,'');neu=lines[i+1]!.slice(4).split('\t')[0]!.trim().replace(/^b\//,'');if(old==='/dev/null')create=true;if(neu==='/dev/null')del=true;i+=2;continue;}if(lines[i]!.startsWith('new file mode'))create=true;if(lines[i]!.startsWith('deleted file mode'))del=true;const hm=lines[i]!.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);if(hm){const a=+hm[1]!-1;i++;const o:string[]=[],n:string[]=[];while(i<lines.length&&(/^[ +-]/.test(lines[i]!)||lines[i]==='')){let l=lines[i++]!;if(l[0]===' '){o.push(l.slice(1));n.push(l.slice(1));}else if(l[0]==='-')o.push(l.slice(1));else if(l[0]==='+')n.push(l.slice(1));}hs.push({o,n,a});continue;}i++;} // temporary
const path=del?old:old; if(!old||!neu)throw new Exit2(`error: parse ${start+1}`);if(del)out.push(t=>{if(!safe(path))throw new Fail('unsafe',path);if(t.get(path)===null)throw new Fail('missing',path);t.now.set(path,null);});else if(create)out.push(t=>{if(!safe(neu))throw new Fail('unsafe',neu);if(t.get(neu)!==null)throw new Fail('exists',neu);t.now.set(neu,hs.flatMap(h=>h.n).join('\n')+'\n');});else {out.push(t=>{if(!safe(old))throw new Fail('unsafe',old);if(t.get(old)===null)throw new Fail('missing',old);let cur=t.get(old)!;for(const h of hs){const {a,br,end}=fileLines(cur),m=matching(a,h.o,strict);if(!m.hits.length)throw new Fail('no-match',old);const at=m.hits.reduce((x,y)=>Math.abs(y-h.a)<Math.abs(x-h.a)?y:x);replaceLines(a,h.o,h.n,at,m.tier);cur=a.join(br)+(end?br:'');}t.now.set(old,cur);});}}return out;}

