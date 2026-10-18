import { CURRENT_RELEASE } from './version';
export { CURRENT_RELEASE } from './version';

/** Newest first. Release versions are distinct from the multiplayer protocol. */
export const RELEASES = [
  {
    ...CURRENT_RELEASE,
    date: '2026-10-18',
    title: 'Take the scenic ride',
    intro: 'Settle in for smoother self-driving and keep your little victories.',
    sections: [
      { title: 'Cruise to your delivery', items: [
        'Double-tap Shift or tap Self-drive to delivery to head toward the next pickup or drop-off. Use the controls any time to take over.',
        'Cars steer more smoothly through turns and leave more room in traffic. Rooftops and some destinations still need you to drive or fly the last stretch.'
      ] },
      { title: 'Keep your victories', items: [
        'Scores show delivery progress and current or recent mini-game results for this drive.',
        'Earn new parking and racing awards. Confirmed awards stay with your saved driver across drives and devices.'
      ] }
    ]
  },
  {
    version: '0.0.14-alpha',
    label: '0.0.14 Alpha',
    date: '2026-10-18',
    title: 'The Peninsula local',
    intro: 'Explore Caltrain-inspired stops, local roads and Silicon Valley landmarks.',
    sections: [
      { title: 'Along the line', items: [
        'Visit stops from San Francisco to San José, with local roads and parking games at the larger stations.',
        'Find short northbound and southbound sky lanes above the stations. They refill air and are optional to enter.',
        'Explore stylized Stripe, Meta, Google, NVIDIA and Apple campuses, plus NASA Ames, Chabot, Oakland Zoo and Levi’s Stadium.',
        'Visit Redwood City’s clock-tower station, redwoods and downtown landmarks.'
      ] }
    ]
  },
  {
    version: '0.0.13-alpha',
    label: '0.0.13 Alpha',
    date: '2026-10-18',
    title: 'A smoother shared Bay',
    intro: 'Less work per simulation tick and more consistent input in shared rooms.',
    sections: [
      { title: 'Drive together', items: [
        'At this release, the game always joined a shared room. If a room was full or unavailable, players could retry or choose another room.',
        'Driving controls are sent more consistently, and traffic, police and pickup checks do less repeated work.',
        'The changelog stays on its own page instead of downloading with the game.'
      ] }
    ]
  },
  {
    version: '0.0.12-alpha',
    label: '0.0.12 Alpha',
    date: '2026-10-18',
    title: 'The scenic way around',
    intro: 'A greener North Bay, more ways down the Peninsula and friendlier skies.',
    sections: [
      { title: 'Explore the Bay', items: [
        'Explore the wooded Marin headlands and North Bay Playground; its races, ramps and ferry remain open.',
        'At level 2, take US 101, I-280 or El Camino Real down the Peninsula. Drive the split yourself or place a map pin on the road you want to visit.',
        'Skyline Express is much higher, its current is gentler, and fewer thermals fill the sky. Wind stops pushing you into locked areas so you can escape.'
      ] }
    ]
  },
  {
    version: '0.0.11-alpha',
    label: '0.0.11 Alpha',
    date: '2026-10-18',
    title: 'A name that moves with you',
    intro: 'Change your driver name whenever you like and keep the same chat identity.',
    sections: [
      { title: 'Make it yours', items: [
        'Edit your name right in the phone chat or from Driver identity. Your ID stays the same.',
        'Your browser remembers your driver by default. Copy the private recovery code to use the same driver on another device.'
      ] }
    ]
  },
  {
    version: '0.0.10-alpha',
    label: '0.0.10 Alpha',
    date: '2026-10-18',
    title: 'Radio for the ride',
    intro: 'Take a podcast along as you explore the Bay.',
    sections: [
      { title: 'Choose your station', items: [
        'Switch between the original 8-bit soundtrack and random public episodes of Latent Space or ThursdAI in the sound panel.',
        'Play, pause and skip episodes; sound effects keep their own volume, and podcast audio streams directly from its publisher.'
      ] }
    ]
  },
  {
    version: '0.0.9-alpha',
    label: '0.0.9 Alpha',
    date: '2026-10-18',
    title: 'Drive together',
    intro: 'Smoother shared driving and longer-lasting Rocket pickups.',
    sections: [
      { title: 'Drive together', items: [
        'Driving in a shared room responds sooner to your controls while the room keeps the game in sync.',
        'Desktop rendering uses fewer pixels on high-density displays to reduce graphics work while keeping the HUD sharp.',
        'A Rocket pickup now equips its car for the rest of the session.',
        'Choose an explicit solo drive from the menu when you want a private local session.'
      ] }
    ]
  },
  {
    version: '0.0.8-alpha',
    label: '0.0.8 Alpha',
    date: '2026-10-18',
    title: 'The road to Mars',
    intro: 'A new Fremont spaceport gives every room a wildly ambitious shared destination.',
    sections: [
      { title: 'Build the mission together', items: [
        'Visit the fictional Tesla × SpaceX gigafactory and Starship/Super Heavy launch complex in Fremont, unlocked with the South Bay at level 2.',
        'Contribute earned session cash to your room’s permanent $1 billion Mars fund. Other drivers in the same room can contribute too; every dollar counts once.',
        'Once fully funded, stop in the gold boarding ring at the spaceport to launch, win and earn the To Mars achievement. You can return to the Bay afterwards.',
        'Current delivery payouts are small; the million-dollar earnings needed for the long-term goal will come in future levels. At this release, room funds persisted while personal cash, cars and achievements were session-only.',
        'Play always joins a shared room; if the Bay is full, retry or name another room.'
      ] }
    ]
  },
  {
    version: '0.0.7-alpha',
    label: '0.0.7 Alpha',
    date: '2026-10-18',
    title: 'Room for every control',
    intro: 'The map and game controls fit more comfortably on short screens.',
    sections: [
      { title: 'Play and explore', items: [
        'The minimap stays clear of mini-game and driving controls in compact portrait and landscape layouts.',
        'Air-refill cues stay visible when they are active.'
      ] }
    ]
  },
  {
    version: '0.0.6-alpha',
    label: '0.0.6 Alpha',
    date: '2026-10-18',
    title: 'Island playground',
    intro: 'Ride the autonomous ferry to a police-free island of ramps, banked turns and races.',
    sections: [
      { title: 'Play your way', items: [
        'Try the two new launch ramps, speed oval, inverted cliff and island parking games.',
        'Play Park It or Cut the Queue at any registered parking lot. Rocket pickups give any car 90 seconds of flight.',
        'The Rocket Dome moves to the China Basin ballpark area, with car soccer to five goals and wall charging.',
        'Join the shared Bay automatically or choose a solo drive from the menu.'
      ] },
      { title: 'Play and explore', items: [
        'Start or leave a mini-game immediately after joining, with confirmation while the room responds.',
        'Self-driving can recover from some opposite-facing street positions, and the map explains where your car will stop.'
      ] }
    ]
  },
  {
    version: '0.0.5-alpha',
    label: '0.0.5 Alpha',
    date: '2026-10-18',
    title: 'Welcome to Tesland',
    intro: 'Poly AV becomes Tesland: a fictional Bay Area in 2050, where the Roadsters have finally arrived.',
    sections: [
      { title: 'A new future', items: [
        'Explore the 2050 backstory and find the Elon Colossus and First Delivery Monument in the Marin headlands near the Golden Gate.',
        'The monuments have solid, landable bases and appear on the local map. The sculptures themselves are decorative.',
        'The game now lives at tesland.swyx.io. Browser-local preferences and saved identity shortcuts do not transfer automatically between addresses; recovery codes still work.',
        'The game joins a shared room automatically; if it is full, retry or choose another room.'
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
        'Collect Rocket pickups on the island and at selected Supercharger playgrounds to add 90 seconds of flight to any vehicle.'
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
