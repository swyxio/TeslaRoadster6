/** Public posts, newest first. Article bodies are trusted Markdown in content/posts/. */
export const POSTS = [
  {
    slug: 'planning-the-economy',
    title: 'The Tesland economy: from deliveries to a Mars launch',
    date: '2026-10-18',
    release: '0.0.14 Alpha',
    description: 'An interactive look at deliveries, Cybercabs, property and the long road to a shared Starship launch.',
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
