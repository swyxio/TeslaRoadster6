import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { marked } from 'marked';
import { POSTS } from '../content/posts';
import { CURRENT_RELEASE, RELEASES } from '../content/releases';

const root = process.cwd();
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string };
if (pkg.version !== CURRENT_RELEASE.version) throw new Error('package.json and the latest release version must match');
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const date = (value: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const h = escapeHtml;
function page(title: string, description: string, path: string, section: 'blog' | 'changelog' | 'lore', body: string, script = ''): string {
  const canonical = `https://tesland.swyx.io${path}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)} · Tesland</title><meta name="description" content="${h(description)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="${section === 'blog' && path !== '/blog/' ? 'article' : 'website'}"><meta property="og:title" content="${h(title)} · Tesland"><meta property="og:description" content="${h(description)}"><meta property="og:url" content="${canonical}"><link rel="stylesheet" href="/publication.css">${script}</head>
<body><header class="site-header"><div class="header-inner"><a class="brand" href="/" aria-label="Tesland home"><span class="brand-mark" aria-hidden="true">↗</span><span>TES<span class="brand-light">LAND</span></span></a><nav class="nav" aria-label="Main navigation"><a href="/blog/"${section === 'blog' ? ' aria-current="page"' : ''}>Dev blog</a><a href="/changelog/"${section === 'changelog' ? ' aria-current="page"' : ''}>Changelog</a><a href="/lore/"${section === 'lore' ? ' aria-current="page"' : ''}>The story</a><a class="play-link" href="/">Play the game ↗</a></nav></div></header><main class="page">${body}</main><footer class="footer"><div class="footer-inner"><span>Tesland · An independent Bay Area driving game</span><a href="https://github.com/swyxio/TeslaRoadster6">Open-source project ↗</a></div></footer></body></html>`;
}
async function output(path: string, html: string) {
  const dir = join(root, 'dist', path);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), html);
}
for (const post of POSTS) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || !/^[a-z0-9-]+\.md$/.test(post.file)) throw new Error('Invalid post slug or file');
  const markdown = await readFile(join(root, 'content/posts', post.file), 'utf8');
  const content = await marked.parse(markdown);
  const path = `/blog/${post.slug}/`;
  const body = `<article><header class="hero"><div class="eyebrow">Development notes</div><h1>${h(post.title)}</h1><p class="deck">${h(post.description)}</p><p class="meta"><time datetime="${post.date}">${date(post.date)}</time> · ${h(post.release)}</p></header><div class="article">${content}<div class="article-footer">Tesland is an independent, open-source project. <a href="/changelog/">See the release notes</a> or <a href="/">take a drive</a>.</div><a class="back-link" href="/blog/">← All development notes</a></div></article>`;
  await output(`blog/${post.slug}`, page(post.title, post.description, path, 'blog', body));
}
const postRows = POSTS.map(post => `<a class="post-row" href="/blog/${post.slug}/"><span class="meta"><time datetime="${post.date}">${date(post.date)}</time> · Development notes</span><h2>${h(post.title)}</h2><p>${h(post.description)}</p><span class="read-more">Read the story →</span></a>`).join('');
await output('blog', page('Dev blog', 'Notes on building Tesland, an open-source Bay Area driving game.', '/blog/', 'blog', `<header class="hero"><div class="eyebrow">Stories from the driver's seat</div><h1>The Tesland dev blog.</h1><p class="deck">Notes on building a Bay Area playground for cars, deliveries and improbable shortcuts.</p></header><section class="listing" aria-label="Development posts">${postRows}</section>`));
const lore = await marked.parse(await readFile(join(root, 'content/lore.md'), 'utf8'));
await output('lore', page('The story', 'Welcome to the fictional Bay Area of 2050.', '/lore/', 'lore', `<article><header class="hero"><div class="eyebrow">A future you can drive</div><h1>Welcome to Tesland.</h1><p class="deck">The year is 2050. The Roadsters are finally here.</p></header><div class="article">${lore}</div></article>`));
const releaseRows = RELEASES.map(release => `<article class="release" id="${h(release.version)}" data-version="${h(release.version)}" data-label="${h(release.label)}"><div class="release-meta meta"><time datetime="${release.date}">${date(release.date)}</time> · ${h(release.label)}</div><h2>${h(release.title)}</h2><p class="release-intro">${h(release.intro)}</p>${release.sections.map(section => `<section><h3>${h(section.title)}</h3><ul>${section.items.map(item => `<li>${h(item)}</li>`).join('')}</ul></section>`).join('')}</article>`).join('');
await output('changelog', page('Changelog', 'Release notes for Tesland, starting with 0.0.1 Alpha.', '/changelog/', 'changelog', `<header class="hero"><div class="eyebrow">The road so far</div><h1>Changelog.</h1><p class="deck">What changed, when it changed, and where this little playground began.</p></header><p id="release-context" class="release-context" role="status" hidden></p>${releaseRows}<p class="article">Curious about the choices behind the game? <a href="/blog/">Visit the dev blog →</a></p>`, '<script src="/changelog.js" defer></script>'));
console.log(`Generated ${POSTS.length} post(s), the blog index and ${RELEASES.length} release note(s).`);
