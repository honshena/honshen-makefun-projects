const field = /^([a-z_]+):(?: (.*))?$/;
const trailing = /[ \t]+$/;
const blank = /^[ \t]*$/;
const validators = {
  title: stringValue,
  summary: stringValue,
  date: dateValue,
  tags: tagValue,
  draft: raw => raw === 'true' ? true : raw === 'false' ? false : invalid('true or false'),
  layout: raw => /^[a-z0-9-]+$/.test(raw) ? raw : invalid('not a template name'),
  slug: raw => raw.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : invalid('not a slug'),
};
const invalid = error => ({ error });

function stringValue(raw) {
  if (raw[0] === '[') return invalid('a bare string opens on [');
  if (raw[0] !== '"') return raw;
  if (raw.length === 1 || raw.at(-1) !== '"') return invalid('a quoted string is not closed');
  const inside = raw.slice(1, -1);
  const quoted = /(["\\])/g;
  let start = 0;
  let text = '';
  for (let m; (m = quoted.exec(inside));) {
    const at = m.index;
    if (m[1] === '"') return invalid('a quoted string holds a stray quote');
    const next = inside[at + 1];
    if (next !== '"' && next !== '\\') return invalid('a quoted string holds an escape other than \\" or \\\\');
    text += inside.slice(start, at) + next;
    start = quoted.lastIndex = at + 2;
  }
  return text + inside.slice(start);
}

function dateValue(raw) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (date) {
    const year = +date[1], month = +date[2], day = +date[3];
    // With the admitted range, the only century is the leap year 2000.
    const days = month === 2 ? 28 + Number(year % 4 === 0) : [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (year >= 1970 && year <= 2099 && day >= 1 && day <= days) return raw;
  }
  return invalid('not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)');
}

function tagValue(raw) {
  if (raw[0] !== '[' || raw.at(-1) !== ']') return invalid('not a list [a, b]');
  const inside = raw.slice(1, -1).trim();
  if (!inside) return [];
  const tags = inside.split(',').map(tag => tag.trim());
  return tags.some(tag => !tag || /["[\]]/.test(tag)) ? invalid('an empty tag, or one holding " [ or ]') : tags;
}

export function front(content) {
  const text = content.includes('\r') ? content.replace(/\r\n?/g, '\n') : content;
  if (text === '---') return invalid('the front matter is not closed');
  if (!text.startsWith('---\n')) return invalid('no front matter');
  let end = text.indexOf('\n---', 3);
  while (end >= 0 && end + 4 < text.length && text[end + 4] !== '\n') end = text.indexOf('\n---', end + 4);
  if (end < 0) return invalid('the front matter is not closed');
  const header = text.slice(4, end).split('\n');
  const data = Object.create(null);
  for (let i = 0; i < header.length; i++) {
    const line = header[i];
    if (line[0] === '#' || blank.test(line)) continue;
    const match = field.exec(line);
    if (!match) return invalid(`line ${i + 2} is not "key: value"`);
    const key = match[1];
    if (!Object.hasOwn(validators, key)) return invalid(`unknown key "${key}"`);
    if (key in data) return invalid(`key "${key}" is given twice`);
    const raw = match[2]?.replace(trailing, '');
    if (!raw) return invalid(`key "${key}" has no value`);
    const value = validators[key](raw);
    if (value.error !== undefined) return invalid(`key "${key}": ${value.error}`);
    data[key] = value;
  }
  return 'title' in data ? { data, body: text.slice(end + 5) } : invalid('no title');
}
