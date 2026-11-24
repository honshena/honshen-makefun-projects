import { claim, escape, escapedCharacter, slug } from './text.js';

const special = /[\\`*[&<>"']/g;
const closers = {
  strong: /\\[\\`*_\[\]()#+.!>\-]|\*\*/g,
  emphasis: /\\[\\`*_\[\]()#+.!>\-]|\*\*|\*/g,
  label: /\\[\\`*_\[\]()#+.!>\-]|\]/g,
};
const escapedChar = /^[\\`*_\[\]()#+.!>\-]$/;

function closing(text, at, search, marker) {
  search.lastIndex = at;
  for (let token; (token = search.exec(text));) if (token[0] === marker) return token.index;
  return -1;
}

function inline(text, link) {
  let html = '', at = 0;
  while (at < text.length) {
    special.lastIndex = at;
    const token = special.exec(text);
    if (!token) break;
    const start = token.index, char = token[0];
    if (start > at) html += text.slice(at, start);
    at = start + 1;
    if (char === '\\' && escapedChar.test(text[at] ?? '')) {
      html += escapedCharacter(text[at++]);
    } else if (char === '`') {
      const end = text.indexOf('`', at);
      if (end > at) {
        html += `<code>${escape(text.slice(at, end))}</code>`;
        at = end + 1;
      } else html += char;
    } else if (char === '*') {
      const strong = text[at] === '*';
      const marker = strong ? '**' : '*';
      if (strong) at++;
      const end = closing(text, at, strong ? closers.strong : closers.emphasis, marker);
      if (end > at) {
        const tag = strong ? 'strong' : 'em';
        html += `<${tag}>${inline(text.slice(at, end), link)}</${tag}>`;
        at = end + marker.length;
      } else html += marker;
    } else if (char === '[') {
      const labelEnd = closing(text, at, closers.label, ']');
      const close = labelEnd >= 0 && text[labelEnd + 1] === '(' ? text.indexOf(')', labelEnd + 2) : -1;
      const href = close < 0 ? '' : text.slice(labelEnd + 2, close);
      if (href && !/\s/.test(href)) {
        html += `<a href="${escape(link(href))}">${inline(text.slice(at, labelEnd), link)}</a>`;
        at = close + 1;
      } else html += char;
    } else html += escapedCharacter(char);
  }
  return at === 0 ? text : html + text.slice(at);
}

const fence = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const fenceEnd = /^```[ \t]*$/;
const heading = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const rule = /^(?:---|\*\*\*)[ \t]*$/;
const blank = /^[ \t]*$/;
const bullet = /^[-*] (.*)$/;
const ordered = /^(\d{1,9})\. (.*)$/;
const continuation = /^ {2,}\S/;
function trim(line) {
  let start = 0, end = line.length;
  while (line[start] === ' ' || line[start] === '\t') start++;
  while (end > start && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
  return start === 0 && end === line.length ? line : line.slice(start, end);
}

// Only these block types can interrupt a paragraph. Return their parsed payload once.
function boundary(line) {
  switch (line[0]) {
    case undefined: return 1;
    case ' ': case '\t': return blank.test(line) ? 1 : null;
    case '`': return fence.exec(line);
    case '#': {
      const h = heading.exec(line);
      return h?.[2] ? h : null;
    }
    case '-': case '*': return rule.test(line) ? 2 : null;
    default: return null;
  }
}

function code(lines, start, lang) {
  let end = start;
  while (end < lines.length && !fenceEnd.test(lines[end])) end++;
  const body = end === start ? '' : escape(lines.slice(start, end).join('\n')) + '\n';
  return { end: end + 1, html: `<pre><code${lang ? ` class="language-${lang}"` : ''}>${body}</code></pre>\n` };
}

function quote(lines, end, link) {
  let body = '';
  do {
    const line = trim(lines[end++].slice(1));
    if (line) body += (body ? '\n' : '') + line;
  } while (lines[end]?.[0] === '>');
  return { end, html: `<blockquote>\n${body ? `<p>${inline(body, link)}</p>\n` : ''}</blockquote>\n` };
}

function list(lines, end, item, link) {
  const numbered = item.length === 3;
  const tag = numbered ? 'ol' : 'ul';
  const marker = numbered ? ordered : bullet;
  const num = numbered ? +item[1] : 1;
  let html = num === 1 ? `<${tag}>\n` : `<ol start="${num}">\n`;
  do {
    let body = trim(item[item.length - 1]);
    end++;
    while (end < lines.length && continuation.test(lines[end])) body += '\n' + trim(lines[end++]);
    html += `<li>${inline(body, link)}</li>\n`;
    item = end < lines.length ? marker.exec(lines[end]) : null;
  } while (item);
  return { end, html: html + `</${tag}>\n` };
}

export function markdown(source, link) {
  const lines = source.split('\n');
  const toc = [], ids = new Map();
  let cursor = 0, content = '', excerpt;
  let pending = null;
  while (cursor < lines.length) {
    const line = lines[cursor];
    const kind = pending ?? boundary(line);
    pending = null;
    if (kind === 1) { cursor++; continue; }
    if (kind === 2) { content += '<hr>\n'; cursor++; continue; }
    if (kind?.length === 3) {
      const level = kind[1].length, id = claim(ids, slug(kind[2]));
      const html = inline(kind[2], link);
      if (level === 2 || level === 3) toc.push({ level, id, html });
      content += `<h${level} id="${id}">${html}</h${level}>\n`;
      cursor++;
      continue;
    }
    const char = line.charCodeAt(0);
    const item = char === 45 || char === 42 ? bullet.exec(line) : char >= 48 && char <= 57 ? ordered.exec(line) : null;
    const block = kind ? code(lines, cursor + 1, kind[1]) : char === 62 ? quote(lines, cursor, link) : item ? list(lines, cursor, item, link) : null;
    if (block) { cursor = block.end; content += block.html; continue; }
    let body = trim(lines[cursor++]);
    while (cursor < lines.length && !(pending = boundary(lines[cursor]))) body += '\n' + trim(lines[cursor++]);
    const html = inline(body, link);
    excerpt ??= html;
    content += `<p>${html}</p>\n`;
  }
  return { content, toc, excerpt: excerpt ?? '' };
}
