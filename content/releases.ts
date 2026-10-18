/** Newest first. Release versions are distinct from the multiplayer protocol. */
export const RELEASES = [
  {
    version: '0.0.5-alpha',
    label: '0.0.5 Alpha',
    date: '2026-10-18',
    title: 'A little more lift',
    intro: 'Take two new launch ramps for a spin on Rocket Island.',
    sections: [
      { title: 'Drive together', items: [
        'Find two eastbound launch ramps inside the island playground and try them in any car.',
        'Driving in a shared room responds sooner to your controls while the room keeps the game in sync.'
      ] }
    ]
  },
  {
    version: '0.0.4-alpha',
    label: '0.0.4 Alpha',
    date: '2026-10-18',
    title: 'Take the scenic route',
    intro: 'Pick a destination, settle in and enjoy the drive with friends.',
    sections: [
      { title: 'Settle in', items: [
        'Open the map, zoom in and pick an accessible destination for your car to drive toward. Take over any time with the driving controls.',
        'Choose your driver name in Driver identity, and chat from a phone-inspired panel while the car cruises.'
      ] },
      { title: 'Play together', items: [
        'Choose Rocket Dome, parking games or a race from the mini-games picker and jump straight into a round.',
        'Scores and awards now explain your session progress and what resets when you leave.',
        'Choose Drive solo for a local session on your own, or join the shared Bay and named rooms.'
      ] }
    ]
  },
  {
    version: '0.0.3-alpha',
    label: '0.0.3 Alpha',
    date: '2026-10-18',
    title: 'One shared Bay',
    intro: 'The game now starts in a shared room automatically.',
    sections: [
      { title: 'Play together', items: [
        'Arrive in the public Bay room immediately, or follow an invite link into a named room.',
        'If a room is full, retry or name another room. Connection errors do not start an offline game.'
      ] }
    ]
  },
  {
    version: '0.0.2-alpha',
    label: '0.0.2 Alpha',
    date: '2026-10-18',
    title: 'Rocket Island playground',
    intro: 'Take a ferry to a fictional island made for flying, racing and parking games.',
    sections: [
      { title: 'Ride and explore', items: [
        'Board the shared ferry on foot or in a car, then explore Rocket Island’s cliff, banked oval and race courses. The island is open from the start of a session.',
        'Collect Rocket kits on the island and at selected Supercharger playgrounds to add flight to any vehicle for the session.'
      ] },
      { title: 'Play a round', items: [
        'Join short or oval races on the island, or try Park It and Cut the queue at the parking playgrounds.',
        'Supercharger site names refer to real locations, but their game placement and air refill service are fictional.'
      ] }
    ]
  },
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
        'Drive solo or join friends in a room with shared traffic and collisions. Try the Rocket Dome, a car-soccer stadium on the China Basin waterfront.',
        'Play with keyboard, touch or a supported gamepad, with synthesized music and sound effects. Room scores and game progress last for the session.'
      ] }
    ]
  }
] as const;

export const CURRENT_RELEASE = RELEASES[0];
