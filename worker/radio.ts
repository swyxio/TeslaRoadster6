import { isRecentRadioEpisode, RADIO_CATALOG_VERSION, type RadioEpisode } from '../shared/radio';

/** Public podcast feeds. Audio remains on the publisher's streaming hosts. */
const STATIONS = {
  'latent-space': { feed: 'https://api.substack.com/feed/podcast/1084089.rss', audioHost: 'api.substack.com', pageHost: 'www.latent.space' },
  'thursdai': { feed: 'https://api.substack.com/feed/podcast/1801228.rss', audioHost: 'prfx.byspotify.com', pageHost: 'sub.thursdai.news' },
} as const;

const MAX_FEED_BYTES = 32 * 1024 * 1024;
const cacheHeaders = { 'Cache-Control': 'public, max-age=3600', 'Content-Type': 'application/json; charset=utf-8' };
const responseHeaders = { ...cacheHeaders, 'Cache-Control':'no-store' };
type Episode = RadioEpisode;

function validUrl(value: string, hostname: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === hostname && !url.username && !url.password && !url.port ? url.href : '';
  } catch { return ''; }
}

/** Parse a fixed RSS feed using the Worker's streaming HTML parser. Only text and URLs are returned. */
export async function radioFeed(request: Request, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET') return new Response('GET required', { status: 405, headers: { Allow: 'GET' } });
  const station = new URL(request.url).pathname.slice('/api/radio/'.length);
  if (!(station in STATIONS) || !Object.hasOwn(STATIONS, station)) return new Response('Unknown station', { status: 404 });
  const config = STATIONS[station as keyof typeof STATIONS];
  const cache = caches.default;
  const cacheKey = new Request(new URL(`/api/radio/${station}?format=${RADIO_CATALOG_VERSION}`, request.url).href);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const { episodes } = await cached.json<{ episodes:Episode[] }>();
    const now = Date.now();
    return Response.json({ episodes:episodes.filter(e => isRecentRadioEpisode(e.publishedAt, now)), serverNow:now }, { headers:responseHeaders });
  }
  try {
    const source = await fetch(config.feed, { signal: AbortSignal.timeout(15000) });
    if (!source.ok || !source.body) throw new Error('Feed unavailable');
    const length = Number(source.headers.get('Content-Length'));
    if (length > MAX_FEED_BYTES) throw new Error('Feed too large');
    let bytes = 0;
    const bounded = source.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > MAX_FEED_BYTES) throw new Error('Feed too large'); controller.enqueue(chunk); },
    }));
    const episodes: Episode[] = [];
    const now = Date.now();
    let current: Episode | null = null;
    let inTitle = false;
    let title = '';
    let linkText = '';
    let readingLink = false;
    let publicationDate = '';
    const rewriter = new HTMLRewriter()
      .on('item', { element(element) {
        current = { title: '', audio: '', link: '', publishedAt: NaN };
        element.onEndTag(() => { if (current?.title && current.audio && isRecentRadioEpisode(current.publishedAt, now)) episodes.push(current); current = null; readingLink = false; });
      }, text(text) { if (readingLink) { linkText += text.text; if (text.lastInTextNode) { if (current) current.link = validUrl(linkText.trim(), config.pageHost); readingLink = false; } } } })
      .on('item > title', { element(element) { inTitle = true; title = ''; element.onEndTag(() => { if (current) current.title = title.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim().slice(0, 240); inTitle = false; }); }, text(text) { if (inTitle) title += text.text; } })
      .on('item > enclosure', { element(element) { if (current) current.audio = validUrl(element.getAttribute('url') || '', config.audioHost); } })
      .on('item > pubdate', { element(element) { publicationDate = ''; element.onEndTag(() => { if (current) current.publishedAt = Date.parse(publicationDate.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()); }); }, text(text) { publicationDate += text.text; } })
      .on('item > link', { element() { readingLink = true; linkText = ''; } });
    // Descriptions make up nearly the entire feed. Strip them in a native streaming pass
    // before listening for the text following each RSS <link> element.
    const compact = new HTMLRewriter().on('description', { element(element) { element.remove(); } }).transform(new Response(bounded));
    const output = rewriter.transform(compact);
    if (!output.body) throw new Error('Feed unavailable');
    const reader = output.body.getReader();
    while (!(await reader.read()).done) { /* Consume the parser without retaining the original feed. */ }
    const response = Response.json({ episodes }, { headers: cacheHeaders });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return Response.json({ episodes, serverNow:now }, { headers:responseHeaders });
  } catch {
    return Response.json({ error: 'This station is temporarily unavailable. Please try again.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
