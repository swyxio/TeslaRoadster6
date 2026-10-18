/** Newest first. Release versions are distinct from the multiplayer protocol. */
export const RELEASES = [
  {
    version: '0.0.1-alpha',
    label: '0.0.1 Alpha',
    date: '2026-10-18',
    title: 'The first public alpha',
    intro: 'Our first recorded release: an arcade delivery playground around a compressed Bay Area.',
    sections: [
      { title: 'Drive the Bay', items: [
        'Explore San Francisco, Oakland, the Peninsula and San Jose as deliveries unlock the map. Cross the Bay Bridge or take the Golden Gate toward Marin.',
        'Choose a Tesla to start, or step out and take a parked autonomous vehicle. Swap between chase, wide and first-person views.'
      ] },
      { title: 'Deliver, fly and improvise', items: [
        'Earn cash for food deliveries, with bonuses for fast pickups and early arrivals. Rooftop drops, session achievements and a room leaderboard reward exploration.',
        'Find rocket kits for any car, buy upgrades and repairs at fictional SpaceX shops, catch blue sky lanes for speed and air, and ride golden thermals for lift.',
        'Police can chase and ticket drivers who fly near them; longer and higher flights and repeat offenses increase the fine.'
      ] },
      { title: 'Play together', items: [
        'Drive solo or join friends in a room with shared traffic and collisions. Try the Rocket Dome, a car-soccer arena on a fictional Alcatraz.',
        'Play with keyboard, touch or a supported gamepad, with synthesized music and sound effects. Room scores and game progress last for the session.'
      ] }
    ]
  }
] as const;

export const CURRENT_RELEASE = RELEASES[0];
