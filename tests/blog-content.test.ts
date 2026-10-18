import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPost } from '../scripts/blog-content';

test('post headings share unique linkable fragments with the table of contents', async () => {
  const result = await renderPost('<div id="hello-world"></div>\n\n## Hello *world*\n\n## Hello world\n\n### A & B\n');
  assert.deepEqual(result.headings.map(({ id }) => id), ['hello-world-2', 'hello-world-3', 'a-b']);
  for (const heading of result.headings) {
    assert.match(result.html, new RegExp(`id="${heading.id}"`));
    assert.match(result.html, new RegExp(`href="#${heading.id}"`));
  }
  assert.match(result.html, /aria-label="Link to A &amp; B"/);
});

test('related posts refer to distinct public articles', async () => {
  const { POSTS } = await import('../content/posts');
  const slugs = new Set(POSTS.map(post => post.slug));
  for (const post of POSTS) {
    assert.equal(new Set(post.related).size, post.related.length);
    for (const slug of post.related) {
      assert.notEqual(slug, post.slug);
      assert.ok(slugs.has(slug as typeof POSTS[number]['slug']));
    }
  }
});

test('blog videos have controls, descriptions and checked-in local media', async () => {
  const [{ POSTS }, { access, readFile }] = await Promise.all([import('../content/posts'), import('node:fs/promises')]);
  for (const post of POSTS) {
    const body = await readFile(`content/posts/${post.file}`, 'utf8');
    for (const [video] of body.matchAll(/<video\b[\s\S]*?<\/video>/g)) {
      assert.match(video, /\bcontrols\b/);
      assert.match(video, /aria-label="[^"]+"/);
      assert.match(video, /poster="\/blog\/[^"]+"/);
      assert.match(video, /<source\b[^>]*src="[^"]+"/);
      assert.match(video, /<a\b[^>]*href="[^"]+"/);
      for (const [, path] of video.matchAll(/(?:src|poster|href)="(\/blog\/[^"]+)"/g)) {
        await access(`public${path}`);
      }
    }
  }
});

test('explicit fragments survive a heading rename and duplicate explicit IDs fail the build', async () => {
  const renamed = await renderPost('## A new title {#original-section}\n');
  assert.equal(renamed.headings[0].id, 'original-section');
  assert.equal(renamed.headings[0].title, 'A new title');
  assert.doesNotMatch(renamed.html, /\{#original-section\}/);
  const reserved = await renderPost('## Overview\n\n## Another section {#overview}\n');
  assert.deepEqual(reserved.headings.map(({ id }) => id), ['overview-2', 'overview']);
  await assert.rejects(renderPost('## First {#same}\n\n## Second {#same}\n'), /Duplicate heading ID/);
  await assert.rejects(renderPost('<div id="same"></div>\n\n## First {#same}\n'), /Duplicate heading ID/);
});

test('release context refers to published versions and real article sections', async () => {
  const [{ RELEASES }, { RELEASE_DETAILS }, { POSTS }, { readFile }, { marked }] = await Promise.all([
    import('../content/releases'), import('../content/release-details'), import('../content/posts'),
    import('node:fs/promises'), import('marked')
  ]);
  const versions = new Set(RELEASES.map(release => release.version));
  const headings = new Map<string, Set<string>>();
  for (const post of POSTS) {
    const result = await renderPost(await readFile(`content/posts/${post.file}`, 'utf8'));
    headings.set(post.slug, new Set(result.headings.map(heading => heading.id)));
  }
  for (const [version, detail] of Object.entries(RELEASE_DETAILS)) {
    assert.ok(versions.has(version), `Unknown release ${version}`);
    assert.ok(detail.summary.trim() && detail.body.trim());
    marked.walkTokens(marked.lexer(detail.body), token => {
      if (token.type !== 'link' || !token.href.startsWith('/')) return;
      const url = new URL(token.href, 'https://tesland.swyx.io');
      if (url.pathname === '/changelog/') {
        assert.ok(versions.has(url.hash.slice(1)), `Unknown release link ${token.href}`);
      } else {
        const match = url.pathname.match(/^\/blog\/([^/]+)\/$/);
        assert.ok(match && headings.has(match[1]), `Unknown post link ${token.href}`);
        if (url.hash) assert.ok(headings.get(match![1])!.has(url.hash.slice(1)), `Unknown post heading ${token.href}`);
      }
    });
  }
});
