import { Marked } from 'marked';

type Heading = { id: string; title: string; depth: number };

/** Markdown headings get deterministic fragment URLs shared by the TOC and links. */
export async function renderPost(markdown: string): Promise<{ html: string; headings: Heading[]; text: string; minutes: number }> {
  const headings: Heading[] = [];
  const used = new Set(['related-heading', ...[...markdown.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1])]);
  const marked = new Marked();
  // Reserve authored fragments first, so generated slugs cannot steal them.
  const tokens = marked.lexer(markdown);
  marked.walkTokens(tokens, token => {
    if (token.type !== 'heading') return;
    const explicit = token.text.match(/\s*\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}$/);
    if (!explicit) return;
    if (used.has(explicit[1])) throw new Error(`Duplicate heading ID: ${explicit[1]}`);
    used.add(explicit[1]);
  });
  marked.use({ renderer: {
    heading({ tokens, depth }) {
      const rendered = this.parser.parseInline(tokens);
      const explicit = rendered.match(/\s*\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}$/);
      const inline = explicit ? rendered.slice(0, explicit.index) : rendered;
      const title = inline.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      const base = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/[\s-]+/g, '-') || 'section';
      let id = explicit?.[1] ?? base;
      if (!explicit) for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      headings.push({ id, title, depth });
      return `<h${depth} id="${id}">${inline}<a class="heading-link" href="#${encodeURIComponent(id)}" aria-label="Link to ${escapeHtml(title)}">#</a></h${depth}>\n`;
    }
  }});
  const html = await marked.parse(markdown);
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&(?:[a-z]+|#\d+);/gi, ' ').replace(/\s+/g, ' ').trim();
  return { html, headings, text, minutes: Math.max(1, Math.ceil(text.split(/\s+/).length / 220)) };
}

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
