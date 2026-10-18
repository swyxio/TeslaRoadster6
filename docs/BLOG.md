# Dev blog publishing

The public catalog lives in `content/posts.ts`; post bodies are Markdown in `content/posts/`. Add curated `related` slugs that already exist in the catalog. Related lists cannot contain the post itself or duplicate slugs. Put contextual links in prose where they help explain a connection.

Give each section a stable fragment, for example `## A new heading {#original-section}`. Keep the ID when editing the heading: readers may have saved or shared its URL. Headings without explicit IDs receive generated slugs; duplicate explicit IDs fail the build. The article TOC and heading links use the same IDs.

Each post needs a 1200×630 PNG at `public/blog/social/<slug>.png`; the index uses `index.png`. The game, changelog and story pages also have cards in that directory. The page generator checks these files exist. `scripts/create-blog-social-cards.py` recreates the current cards from checked-in screenshots using Pillow and macOS Arial fonts. Keep social images faithful to the article and check the rendered card and Open Graph metadata when publishing. Social platforms may cache earlier previews.

The archive searches the generated article text in the browser. Search uses `?q=`, `/` focuses it, and Escape clears or blurs it. The article index rail and on-page section list adapt to the viewport; the rail width and minimized state are saved locally when storage is available.
