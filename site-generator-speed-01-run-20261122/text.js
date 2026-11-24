const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapedCharacter = char => entities[char] ?? char;
const months = 'January February March April May June July August September October November December'.split(' ');

export function escape(text) {
  return text.replace(/[&<>"']/g, escapedCharacter);
}

export function slug(text) {
  const plain = /[^\x00-\x7f]/.test(text) ? text.normalize('NFKD').replace(/\p{M}/gu, '') : text;
  return plain.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-/, '').slice(0, 64).replace(/-$/, '').toLowerCase() || 'untitled';
}

export function claim(taken, base) {
  let suffix = taken.get(base);
  if (suffix === undefined) {
    taken.set(base, 2);
    return base;
  }
  let candidate = `${base}-${suffix}`;
  while (taken.has(candidate)) candidate = `${base}-${++suffix}`;
  taken.set(base, suffix + 1);
  taken.set(candidate, 2);
  return candidate;
}

export function dateLong(date) {
  return date ? `${+date.slice(8)} ${months[+date.slice(5, 7) - 1]} ${date.slice(0, 4)}` : '';
}

export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
