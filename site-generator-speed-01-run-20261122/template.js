import { escape } from './text.js';

const openMarker = /\{\{\{|\{\{|\{%/g;
const space = /^[ \t]*$/;
const pathPattern = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/;
const forPattern = /^for ([A-Za-z_]\w*) in (\S+)$/;
const ifPattern = /^if (not )?(\S+)$/;
const includePattern = /^include "([a-z0-9-]+)"$/;

class InvalidTemplate extends Error {}
const fail = message => { throw new InvalidTemplate(message); };
function names(path) {
  if (!pathPattern.test(path)) fail(`${JSON.stringify(path)} is not a path`);
  return path.split('.');
}

function scan(source) {
  const tokens = [];
  let offset = 0;
  openMarker.lastIndex = 0;
  for (let match; (match = openMarker.exec(source));) {
    const marker = match[0], start = match.index, control = marker === '{%';
    const close = control ? '%}' : marker.length === 3 ? '}}}' : '}}';
    const end = source.indexOf(close, openMarker.lastIndex);
    if (end < 0) fail(`a ${marker} is not closed`);
    const text = source.slice(openMarker.lastIndex, end).trim();
    let left = start, right = end + close.length;
    if (control) {
      const line = source.lastIndexOf('\n', start - 1) + 1;
      const newline = source.indexOf('\n', right);
      if (space.test(source.slice(line, start)) && space.test(source.slice(right, newline < 0 ? source.length : newline))) {
        left = line;
        right = newline < 0 ? source.length : newline + 1;
      }
    }
    if (left > offset) tokens.push(source.slice(offset, left));
    tokens.push(control ? ['control', text] : [marker === '{{' ? 'escape' : 'raw', names(text)]);
    offset = openMarker.lastIndex = right;
  }
  if (offset < source.length) tokens.push(source.slice(offset));
  return tokens;
}

function parse(source) {
  const root = [], frames = [{ body: root }];
  for (const token of scan(source)) {
    const current = frames.at(-1), body = current.body;
    if (typeof token === 'string' || token[0] !== 'control') { body.push(token); continue; }
    const tag = token[1];
    const loop = forPattern.exec(tag), cond = loop ? null : ifPattern.exec(tag);
    if (loop || cond) {
      const branch = [];
      const node = loop ? ['for', names(loop[2]), loop[1], branch] : ['if', names(cond[2]), Boolean(cond[1]), branch, []];
      body.push(node);
      frames.push({ type: node[0], body: branch, node });
    } else if (tag === 'else') {
      if (current.type !== 'if' || body === current.node[4]) fail('an else outside an if');
      current.body = current.node[4];
    } else if (tag === 'endfor' || tag === 'endif') {
      const expected = tag.slice(3);
      if (current.type !== expected) fail(`an ${tag} with no open ${expected}`);
      frames.pop();
    } else {
      const inc = includePattern.exec(tag);
      if (!inc) fail(`{% ${tag} %} is not a tag`);
      body.push(['include', inc[1]]);
    }
  }
  if (frames.length !== 1) fail(`a ${frames.at(-1).type} is not closed`);
  return root;
}

function lookup(scope, path) {
  const head = path[0];
  let value;
  while (scope !== null) {
    if (Object.hasOwn(scope.values, head)) { value = scope.values[head]; break; }
    scope = scope.parent;
  }
  for (let i = 1; i < path.length; i++) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, path[i])) return undefined;
    value = value[path[i]];
  }
  return value;
}

function asText(value) {
  switch (typeof value) {
    case 'string': return value;
    case 'number': case 'boolean': return String(value);
    default: return Array.isArray(value) ? value.map(asText).join(', ') : '';
  }
}

const truth = value => Array.isArray(value) ? value.length > 0 : Boolean(value) || Number.isNaN(value);

function render(nodes, scope, templates, depth) {
  let html = '';
  for (const node of nodes) {
    if (typeof node === 'string') { html += node; continue; }
    const [op, path, arg, body, otherwise] = node;
    if (op === 'include') {
      if (depth < INCLUDE_LIMIT && templates.has(path)) html += render(templates.get(path), scope, templates, depth + 1);
      continue;
    }
    const value = lookup(scope, path);
    if (op === 'raw') html += asText(value);
    else if (op === 'escape') html += escape(asText(value));
    else if (op === 'if') html += render(truth(value) !== arg ? body : otherwise, scope, templates, depth);
    else if (Array.isArray(value)) {
      const length = value.length;
      for (let i = 0; i < length; i++) {
        if (!(i in value)) continue;
        const loop = { index: i + 1, first: i === 0, last: i === length - 1, length };
        html += render(body, { values: { [arg]: value[i], loop }, parent: scope }, templates, depth);
      }
    }
  }
  return html;
}

const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
const MAX_EMITTED_NODES = 1800;
const MAX_ANALYSIS_NESTING = 128;
const INCLUDE_LIMIT = 8;

// Free names include nested includes, but exclude loop-local names. If analysis
// gets too deep, leave the partial unspecialized rather than following cold branches.
function freeNames(nodes, templates, depth, cache, nesting = 0) {
  if (nesting >= MAX_ANALYSIS_NESTING) return null;
  const namesAtDepth = cache[depth];
  const cached = namesAtDepth.get(nodes);
  if (cached) return cached;
  const roots = new Set();
  for (const node of nodes) {
    if (typeof node === 'string') continue;
    const [op, path, arg, body, otherwise] = node;
    if (op === 'include') {
      const included = templates.get(path);
      if (depth < INCLUDE_LIMIT && included) {
        const child = freeNames(included, templates, depth + 1, cache, nesting + 1);
        if (!child) return null;
        for (const name of child) roots.add(name);
      }
      continue;
    }
    roots.add(path[0]);
    if (op !== 'for' && op !== 'if') continue;
    const child = freeNames(body, templates, depth, cache, nesting + 1);
    if (!child) return null;
    for (const name of child) {
      if (op !== 'for' || (name !== arg && name !== 'loop')) roots.add(name);
    }
    if (op === 'if') {
      const other = freeNames(otherwise, templates, depth, cache, nesting + 1);
      if (!other) return null;
      for (const name of other) roots.add(name);
    }
  }
  namesAtDepth.set(nodes, roots);
  return roots;
}

function sharedPartials(templates, shared) {
  const depths = Array.from({ length: INCLUDE_LIMIT + 1 }, () => new Map());
  const renderers = Array.from({ length: INCLUDE_LIMIT + 1 }, () => new Map());
  return (nodes, bindings, depth) => {
    const roots = freeNames(nodes, templates, depth, depths);
    if (!roots) return undefined;
    for (const name of roots) {
      if (bindings.has(name) || !Object.hasOwn(shared, name)) return undefined;
    }
    const cache = renderers[depth];
    if (!cache.has(nodes)) {
      let html;
      cache.set(nodes, () => html ??= render(nodes, { values: shared, parent: null }, templates, depth));
    }
    return cache.get(nodes);
  };
}

const needsEscape = /[&<>"']/;
const escaped = value => {
  const text = asText(value);
  return needsEscape.test(text) ? escape(text) : text;
};

function specialize(root, templates, shared) {
  let serial = 0, visited = 0;
  const code = [], constants = [];
  const pathCode = (path, bindings) => {
    let expr = bindings.get(path[0]) ?? `own(values,${JSON.stringify(path[0])})`;
    for (let i = 1; i < path.length; i++) expr = `own(${expr},${JSON.stringify(path[i])})`;
    return expr;
  };
  const emit = (nodes, bindings, depth) => {
    let literal = '';
    const flush = () => {
      if (literal) code.push(`out+=${JSON.stringify(literal)};`);
      literal = '';
    };
    for (const node of nodes) {
      if (++visited > MAX_EMITTED_NODES) return false;
      if (typeof node === 'string') { literal += node; continue; }
      flush();
      const [op, path, arg, body, otherwise] = node;
      if (op === 'include') {
        const included = templates.get(path);
        if (depth === INCLUDE_LIMIT || !included) continue;
        const fragment = shared?.(included, bindings, depth + 1);
        if (fragment !== undefined) {
          code.push(`out+=constants[${constants.length}]();`);
          constants.push(fragment);
        } else if (!emit(included, bindings, depth + 1)) return false;
        continue;
      }
      const expr = pathCode(path, bindings);
      if (op === 'escape' || op === 'raw') code.push(`out+=${op === 'raw' ? 'asText' : 'escaped'}(${expr});`);
      else if (op === 'if') {
        code.push(`if(${arg ? '!' : ''}truth(${expr})){`);
        if (!emit(body, bindings, depth)) return false;
        code.push('}else{');
        if (!emit(otherwise, bindings, depth)) return false;
        code.push('}');
      } else {
        const id = serial++, items = `xs${id}`, idx = `i${id}`, len = `n${id}`, value = `v${id}`, loop = `l${id}`;
        code.push(`const ${items}=${expr};if(Array.isArray(${items})){const ${len}=${items}.length;for(let ${idx}=0;${idx}<${len};${idx}++){if(!(${idx} in ${items}))continue;const ${value}=${items}[${idx}];const ${loop}={index:${idx}+1,first:${idx}===0,last:${idx}===${len}-1,length:${len}};`);
        if (!emit(body, new Map([...bindings, [arg, value], ['loop', loop]]), depth)) return false;
        code.push('}}');
      }
    }
    flush();
    return true;
  };
  if (!emit(root, new Map(), 0)) return null;
  // Only serialized literals/keys and compiler-assigned variable names enter the generated program.
  const factory = new Function('own', 'asText', 'escaped', 'truth', 'constants',
    `return values=>{let out='';${code.join('')}return out;}`);
  return factory(own, asText, escaped, truth, constants);
}

export function compile(sources, report) {
  const templates = new Map();
  for (const name of Object.keys(sources).sort()) {
    try {
      templates.set(name, parse(sources[name]));
    } catch (error) {
      if (!(error instanceof InvalidTemplate)) throw error;
      report.push(`template "${name}": ${error.message}`);
    }
  }
  return {
    has: name => templates.has(name),
    renderer(shared) {
      const compiled = new Map();
      const partial = sharedPartials(templates, shared);
      return (name, local) => {
        const nodes = templates.get(name);
        if (nodes === undefined) return null;
        // Keep the generic scope semantics if a caller overrides a shared root.
        const values = { ...shared, ...local };
        for (const key in local) {
          if (Object.hasOwn(local, key) && Object.hasOwn(shared, key)) {
            return render(nodes, { values, parent: null }, templates, 0);
          }
        }
        if (!compiled.has(name)) compiled.set(name, specialize(nodes, templates, partial));
        const fn = compiled.get(name);
        return fn ? fn(values) : render(nodes, { values, parent: null }, templates, 0);
      };
    },
  };
}
