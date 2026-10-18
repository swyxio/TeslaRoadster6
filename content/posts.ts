/** Public posts, newest first. Article bodies are trusted Markdown in content/posts/. */
export const POSTS = [
  {
    slug: 'planning-the-economy',
    title: 'What a five-minute simulation taught us about the Tesland economy',
    date: '2026-10-18',
    release: '0.0.5 Alpha',
    description: 'Deliveries, Rocket Dome and Cybercabs should all lead somewhere. A small simulation showed where our first plan fell short.',
    file: '2026-10-18-planning-the-economy.md'
  },
  {
    slug: 'building-poly-av',
    title: 'I wanted a flying Roadster game. I made a Bay Area delivery sandbox.',
    date: '2026-10-18',
    release: '0.0.1 Alpha',
    description: 'How a flying-car idea became an open-source Bay Area game about food deliveries, shortcuts, upgrades and friends.',
    file: '2026-10-18-building-poly-av.md'
  }
] as const;
