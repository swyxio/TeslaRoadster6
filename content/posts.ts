/** Public posts, newest first. Article bodies are trusted Markdown in content/posts/. */
export const POSTS = [
  {
    slug: 'recording-webgl-playtests',
    title: 'How we record repeatable WebGL playtests',
    date: '2026-10-18',
    release: '0.0.27 Alpha',
    description: 'A browser can drive Tesland, record the actual game, and prepare its own video for the dev blog. Here is what that recording can and cannot prove.',
    file: '2026-10-18-recording-webgl-playtests.md',
    related: ['making-driving-feel-smooth']
  },
  {
    slug: 'making-driving-feel-smooth',
    title: 'Why our browser driving game felt jerky',
    date: '2026-10-18',
    release: '0.0.15 Alpha',
    description: 'The work behind a smoother drive: frame pacing, multiplayer prediction, distant detail and the limits we still need to measure.',
    file: '2026-10-18-making-driving-feel-smooth.md',
    related: ['building-poly-av', 'recording-webgl-playtests']
  },
  {
    slug: 'planning-the-economy',
    title: 'The Tesland economy: from deliveries to a Mars launch',
    date: '2026-10-18',
    release: '0.0.14 Alpha',
    description: 'An interactive look at deliveries, Cybercabs, property and the long road to a shared Starship launch.',
    file: '2026-10-18-planning-the-economy.md',
    related: ['building-poly-av']
  },
  {
    slug: 'building-poly-av',
    title: 'I wanted a flying Roadster game. I made a Bay Area delivery sandbox.',
    date: '2026-10-18',
    release: '0.0.1 Alpha',
    description: 'How a flying-car idea became an open-source Bay Area game about food deliveries, shortcuts, upgrades and friends.',
    file: '2026-10-18-building-poly-av.md',
    related: ['planning-the-economy', 'making-driving-feel-smooth']
  }
] as const;
