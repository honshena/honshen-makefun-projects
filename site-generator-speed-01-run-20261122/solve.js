import { front } from './front.js';
import { markdown } from './markdown.js';
import { compile } from './template.js';
import { claim, compare, dateLong, slug } from './text.js';

const reserved = ['posts', 'tags', 'page'];
const scheme = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const directory = path => path.slice(0, Math.max(0, path.lastIndexOf('/')));

function readPages(files, templates, base, report) {
  const directories = new Map([['', new Map(reserved.map(name => [name, 2]))]]);
  const statics = new Map(), pages = [], staticFiles = [];
  for (const { path, content } of files.slice().sort((a, b) => compare(a.path, b.path))) {
    if (!path.endsWith('.md')) {
      statics.set(path, `${base}/${path}`);
      staticFiles.push({ path, content });
      continue;
    }
    const { error, data, body } = front(content);
    const post = path.startsWith('posts/');
    const own = path.startsWith('tags/') ? 'tags' : path.startsWith('page/') ? 'page' : '';
    const layout = data?.layout ?? (post ? 'post' : 'page');
    const refusal = error ?? (own ? `${own}/ is the generator's own` : post && !data.date ? 'a post needs a date' :
      !templates.has(layout) ? `layout "${layout}" is no template that parses` : null);
    if (refusal) { report.push(`refused ${path}: ${refusal}`); continue; }
    if (data.draft) { report.push(`draft ${path}`); continue; }
    const dir = directory(path), destination = post ? 'posts' : dir;
    let taken = directories.get(destination);
    if (!taken) directories.set(destination, taken = new Map());
    const key = claim(taken, data.slug ?? slug(data.title));
    const route = (destination ? `${destination}/` : '') + key;
    pages.push({ path, dir, route, url: `${base}/${route}/`, post, layout, slug: key, data, body });
  }
  return { pages, statics, staticFiles };
}

function resolve(dir, path) {
  const parts = dir ? dir.split('/') : [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}

function linksFor(page, locations, broken) {
  const found = new Map();
  return target => {
    if (target[0] === '/' || target[0] === '#' || scheme.test(target)) return target;
    const previous = found.get(target);
    if (previous !== undefined) return previous;
    const hash = target.indexOf('#');
    const path = hash < 0 ? target : target.slice(0, hash);
    const location = locations.get(resolve(page.dir, path));
    const href = location === undefined ? target : hash < 0 ? location : location + target.slice(hash);
    if (location === undefined) broken.add(`broken-link ${page.path} -> ${target}`);
    found.set(target, href);
    return href;
  };
}

function tagRefs(names, slugCache, visit) {
  const refs = [], seen = new Set();
  for (const name of names ?? []) {
    let key = slugCache.get(name);
    if (key === undefined) slugCache.set(name, key = slug(name));
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(visit(name, key));
  }
  return refs;
}

function tagGroups(posts, base, slugCache) {
  const groups = new Map();
  for (const post of posts) {
    tagRefs(post.data.tags, slugCache, (name, key) => {
      let group = groups.get(key);
      if (!group) {
        group = { link: { name, slug: key, url: `${base}/tags/${key}/` }, posts: [] };
        groups.set(key, group);
      }
      group.posts.push(post);
    });
  }
  return groups;
}

function readingMinutes(body) {
  // Each complete group adds a minute only if at least one word follows it.
  const groups = /\s*\S+(?:\s+\S+){199}\s+(?=\S)/y;
  let minutes = 1;
  while (groups.test(body)) minutes++;
  return minutes;
}

function card(page, excerpt, groups, slugCache) {
  const { title, date = '', summary = '' } = page.data;
  const tags = tagRefs(page.data.tags, slugCache, (name, key) => groups.get(key)?.link ?? { name, slug: key, url: '' });
  return { title, url: page.url, date, date_long: dateLong(date), summary, excerpt, reading_minutes: readingMinutes(page.body), tags };
}

function neighbor(card) {
  if (!card) return null;
  const { title, url, date, date_long } = card;
  return { title, url, date, date_long };
}

function writeIndexes(output, templates, shared, base, cards, per) {
  if (!templates.has('index')) return;
  const total = Math.max(1, Math.ceil(cards.length / per));
  const url = k => k === 1 ? `${base}/` : `${base}/page/${k}/`;
  for (let k = 1; k <= total; k++) {
    const pager = { number: k, total, url: url(k), newer_url: k > 1 ? url(k - 1) : '', older_url: k < total ? url(k + 1) : '' };
    const posts = cards.slice((k - 1) * per, k * per);
    output[k === 1 ? 'index.html' : `page/${k}/index.html`] = templates.render('index', { ...shared, posts, pager });
  }
}

function writePages(output, templates, shared, pages, posts, rendered, cards) {
  const neighbors = posts.map(post => neighbor(cards.get(post)));
  const rank = new Map(posts.map((post, index) => [post, index]));
  for (const page of pages) {
    const place = rank.get(page);
    const { content, toc } = rendered.get(page);
    const view = { ...cards.get(page), slug: page.slug, content, toc,
      newer: place === undefined ? null : neighbors[place - 1] ?? null,
      older: place === undefined ? null : neighbors[place + 1] ?? null, is_post: page.post };
    output[`${page.route}/index.html`] = templates.render(page.layout, { ...shared, page: view });
  }
}

export function run(input) {
  const report = [], broken = new Set(), output = {};
  const base = input.site.base_url.replace(/\/+$/, '');
  const templates = compile(input.templates, report);
  const { pages, statics, staticFiles } = readPages(input.files, templates, base, report);
  const locations = new Map(statics);
  for (const page of pages) locations.set(page.path, page.url);
  const posts = pages.filter(page => page.post).sort((a, b) => compare(b.data.date, a.data.date) || compare(a.slug, b.slug));
  const slugCache = new Map(), groups = tagGroups(posts, base, slugCache);
  const ordered = Array.from(groups.values()).sort((a, b) => b.posts.length - a.posts.length || compare(a.link.slug, b.link.slug));
  const rendered = new Map(), cards = new Map();
  for (const page of pages) {
    const result = markdown(page.body, linksFor(page, locations, broken));
    rendered.set(page, result);
    cards.set(page, card(page, result.excerpt, groups, slugCache));
  }
  const postCards = posts.map(post => cards.get(post));
  const tags = ordered.map(({ link, posts }) => ({ ...link, count: posts.length }));
  const shared = { site: { title: input.site.title, base_url: base }, tags, recent: postCards.slice(0, input.site.recent) };
  writePages(output, templates, shared, pages, posts, rendered, cards);
  writeIndexes(output, templates, shared, base, postCards, input.site.per_page);
  if (templates.has('tag')) {
    ordered.forEach((group, i) => {
      const tag = { ...tags[i], posts: group.posts.map(post => cards.get(post)) };
      output[`tags/${tag.slug}/index.html`] = templates.render('tag', { ...shared, tag });
    });
  }
  if (templates.has('tags')) output['tags/index.html'] = templates.render('tags', shared);
  for (const { path, content } of staticFiles) {
    if (Object.hasOwn(output, path)) report.push(`shadowed ${path}: a built page has its path`);
    else output[path] = content;
  }
  const issues = report.concat(Array.from(broken)).sort();
  issues.push(`built ${pages.length - posts.length} pages, ${posts.length} posts, ${tags.length} tags and ${staticFiles.length} static files`);
  output['build-report.txt'] = issues.join('\n') + '\n';
  return output;
}
