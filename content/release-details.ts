/** Optional editorial context for published releases. Markdown is trusted source content. */
export const RELEASE_DETAILS: Record<string, { summary: string; body: string }> = {
  '0.0.26-alpha': {
    summary: 'What does room for 64 mean?',
    body: 'The new setting is an **admission limit**, not a promise that a full room will run smoothly. A 60-second synthetic test kept 64 clients connected; real-world play and device performance still need measurement. The [driving performance story](/blog/making-driving-feel-smooth/#a-room-limit-needs-more-than-a-socket-count) explains why the earlier limit was eight and why a socket count alone cannot establish playable capacity.'
  },
  '0.0.25-alpha': {
    summary: 'Why put the next goal on screen?',
    body: 'The mission card brings the current pickup or dropoff and the next award together, so a driver has a reason to keep moving without opening several menus. The mobile map, mission and stats can each be minimized. The [economy story](/blog/planning-the-economy/#give-drivers-reasons-to-keep-going) explores the longer journey behind those milestones.'
  },
  '0.0.24-alpha': {
    summary: 'The 28 ms timing surprise',
    body: 'In a preview, a room observed an earnings lease whose issue time was **28 ms ahead of its clock**. The room can now briefly wait for a confirmed lease instead of discarding it while gameplay continues; it still does not invent a rate when the service is unavailable. The [verification notes](https://github.com/swyxio/TeslaRoadster6/blob/aeb5704/docs/VERIFICATION.md) document the observation; the timestamp gap did not establish its underlying cause.'
  },
  '0.0.23-alpha': {
    summary: 'How do repeatable awards work?',
    body: 'Activities can pay at five ranks: **1, 10, 100, 1,000 and 10,000**. Existing saved progress can establish a starting rank without paying the same milestones again. The [economy story](/blog/planning-the-economy/#give-drivers-reasons-to-keep-going) discusses why small milestones matter on a long trip.'
  },
  '0.0.22-alpha': {
    summary: 'Why does an old tab show an old version?',
    body: 'The label describes the code loaded in **that tab**, rather than the newest release on the server. Reload to pick up a newer build. Podcast stations also changed from the broader shuffle introduced in [0.0.10](/changelog/#0.0.10-alpha) to a recent-episode selection.'
  },
  '0.0.21-alpha': {
    summary: 'Why can buying a finish change my level?',
    body: 'Tesland uses your **current cash balance** as your level. Spending can make a region unavailable until you earn the balance back, while purchases and achievements remain yours. The [economy story](/blog/planning-the-economy/#your-wallet-is-your-level) explains the tradeoff; its longer simulations use their stated historical assumptions.'
  },
  '0.0.19-alpha': {
    summary: 'The idea behind a Cybercab fleet',
    body: 'A cab is a choice between money spent now and earnings while you play. The [fleet model](/blog/planning-the-economy/#from-one-cab-to-a-fleet) explores that tradeoff using explicit utilization and price assumptions; it is not a guarantee of actual earnings. The [release record](https://github.com/swyxio/TeslaRoadster6/pull/57) distinguishes local checks from the production cab-earnings flow that remained unverified.'
  },
  '0.0.18-alpha': {
    summary: 'What does self-driving do for a delivery?',
    body: 'The route follows the current pickup or dropoff, while steering or driving input lets you take control again. It is a way to enjoy the Bay between jobs, not a promise that every route or traffic encounter will resolve itself.'
  },
  '0.0.16-alpha': {
    summary: 'A collection that stays with your driver',
    body: 'The Vault introduced six special cars and motorcycles alongside a saved driver. Cash, delivery progress, achievements and owned vehicle configuration can outlast a room session. See [the Vault and its prices](/blog/planning-the-economy/#from-one-cab-to-a-fleet) for the collection; treat the surrounding simulations as models, not playtime promises.'
  },
  '0.0.15-alpha': {
    summary: 'Why a faster frame was not enough',
    body: 'The browser could draw a frame more often while still waiting for a fresh position from the multiplayer room. Local prediction and reconciliation help the driver see a response sooner; the room still decides shared outcomes. The [before-and-after story](/blog/making-driving-feel-smooth/#two-ways-to-see-the-drive) shows real captures and a separately labeled synthetic comparison.'
  },
  '0.0.14-alpha': {
    summary: 'A recognizable Bay, compressed for play',
    body: 'The Caltrain-inspired stops and local landmarks make the Peninsula a place to explore, not a geographically exact reconstruction. The [Bay map in the economy story](/blog/planning-the-economy/#a-bay-worth-exploring) shows the wider route and the limits of the game map.'
  },
  '0.0.8-alpha': {
    summary: 'Why aim for Mars?',
    body: 'This release introduced a **room-funded** Mars mission. Later work changed the long-term economy, so this entry describes what shipped at the time rather than current funding rules. The [economy story](/blog/planning-the-economy/#the-long-road-to-mars) separates its modeled journey from later implementation.'
  },
  '0.0.1-alpha': {
    summary: 'How did a Roadster become a delivery game?',
    body: 'A flying-car idea grew into a shared Bay Area playground of deliveries, shortcuts and upgrades. [Read the origin story](/blog/building-poly-av/#from-the-roadster-to-a-food-run) for the decisions behind the first alpha.'
  }
};
