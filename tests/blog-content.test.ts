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
