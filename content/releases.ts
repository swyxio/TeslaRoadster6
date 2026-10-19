import { CURRENT_RELEASE } from './version';
export { CURRENT_RELEASE } from './version';

/** Newest first. Release versions are distinct from the multiplayer protocol. */
export const RELEASES = [
  {
    ...CURRENT_RELEASE,
    date: '2026-10-19',
    title: 'A livelier Bay',
    intro: 'Discover more detail and activity around the Bay.',
    sections: [
      { title: 'On the road', items: [
        'Slow highway queues make the case for flying; watch for the occasional cow crossing.',
        'Find directional skyways and highway patrols as you explore the Bay.',
        'Look for framed windows, detailed redwoods, vehicles and landmark facades.',
        'Buy Hyperloop Pilot in a workshop for longer self-driving trips.'
      ] }
    ]
  },
  {
    version: '0.0.42-alpha',
    label: '0.0.42 Alpha',
    date: '2026-10-18',
    title: 'A wider Bay',
    intro: 'Look out toward the hills as you drive and fly around the Bay.',
    sections: [
      { title: 'On the horizon', items: [
        'Distant Bay-inspired ridgelines surround the map and shift as you travel from San Francisco to Fremont and beyond.',
        'The landscape is original, fictional backdrop art, made for Tesland’s compressed geography.'
      ] }
    ]
  },
  {
    version: '0.0.41-alpha',
    label: '0.0.41 Alpha',
    date: '2026-10-18',
    title: 'Starbase takes shape',
    intro: 'Visit a growing Starship and launch complex in Fremont.',
    sections: [
      { title: 'The mission to Mars', items: [
        'A reflective Starship rises as drivers earn together, alongside a dollar-marked progress tower.',
        'Explore the landscaped site, construction yard and flame channel. The painted perimeter is a playful site marker.'
      ] }
    ]
  },
  {
    version: '0.0.40-alpha',
    label: '0.0.40 Alpha',
    date: '2026-10-18',
    title: 'A clearer way to deliver',
    intro: 'Delivery guidance follows the road, with more time to stop at pickups.',
    sections: [
      { title: 'On the road', items: [
        'Delivery arrows guide you along roads when a road route is available.',
        'Pickup bonuses taper more gently near the estimate, with up to 15 seconds afterward to stop.'
      ] }
    ]
  },
  {
    version: '0.0.39-alpha',
    label: '0.0.39 Alpha',
    date: '2026-10-18',
    title: 'Rocket Dome rewards',
    intro: 'Play Rocket Dome to earn cash and unlock new abilities.',
    sections: [
      { title: 'Get in the game', items: [
        'Touch the ball and stay through a match to earn $250, plus $500 if you win. Existing earnings bonuses apply.',
        'Your first qualifying match unlocks Pulse Shot; your first credited win unlocks Champion Charge for rocket-equipped cars.'
      ] }
    ]
  },
  {
    version: '0.0.38-alpha',
    label: '0.0.38 Alpha',
    date: '2026-10-18',
    title: 'Rocket pad tune-up',
    intro: 'Rocket pads keep the same pickup behavior with lighter background processing.',
    sections: [
      { title: 'On the road', items: [
        'Rocket pad pickup checks do less work when cars are far away.'
      ] }
    ]
  },
  {
    version: '0.0.37-alpha',
    label: '0.0.37 Alpha',
    date: '2026-10-18',
    title: 'A steadier delivery career',
    intro: 'Delivery earnings grow more steadily as you explore the Bay.',
    sections: [
      { title: 'On the road', items: [
        'Fast pickups and early deliveries still earn bonuses, with smaller peaks on the quickest trips.',
        'The first, third and fifth delivery achievements pay less; the three-delivery checkpoint and existing saved balances stay the same.'
      ] }
    ]
  },
  {
    version: '0.0.36-alpha',
    label: '0.0.36 Alpha',
    date: '2026-10-18',
    title: 'Hit what you can see',
    intro: 'Buildings, roofs and curved structures have a more faithful physical shape.',
    sections: [
      { title: 'Clear gaps, solid walls', items: [
        'Drive between open tower posts and beneath raised beams. Bridge legs and stadium masonry now stop cars where the visible structures stand.',
        'Land on pitched and curved roofs, including the Stanford dish and NASA Ames tube. Contact checks include the car’s edges, so a clear center no longer lets the body sink into a roof or underside.',
        'The Oakland ramp blocks approaches through its sides, and the Rocket Dome catches the airborne car’s body before it crosses the ceiling.',
        'This remains arcade physics: small decorative details are not obstacles, and slight corner grazes and Dome attachment transitions still need polish.'
      ] }
    ]
  },
  {
    version: '0.0.35-alpha',
    label: '0.0.35 Alpha',
    date: '2026-10-18',
    title: 'Watch Starship rise',
    intro: 'See the mission grow as drivers earn across Tesland.',
    sections: [
      { title: 'A tower that tracks the mission', items: [
        'The Fremont tower now shows dollar milestones and a rising bar for confirmed game-wide earnings.',
        'Open the Starship launch view to see the exact total and watch the construction take shape.'
      ] }
    ]
  },
  {
    version: '0.0.34-alpha',
    label: '0.0.34 Alpha',
    date: '2026-10-18',
    title: 'More of the Bay',
    intro: 'Find 100 more Bay-inspired places across the map.',
    sections: [
      { title: 'New landmarks', items: [
        'Explore miniature landmarks from Marin and San Francisco to Berkeley, the Peninsula and San Jose.',
        'The Bay is playfully compressed: landmarks are original interpretations, and some have been moved to fit the world.'
      ] }
    ]
  },
  {
    version: '0.0.33-alpha',
    label: '0.0.33 Alpha',
    date: '2026-10-18',
    title: 'Find your Bay',
    intro: 'Keep driving when the Bay fills up.',
    sections: [
      { title: 'Room for another drive', items: [
        'When the public Bay is full, the game finds another open Bay room automatically.',
        'Invite links take friends to your exact room. If it is full, you can retry or choose another room.'
      ] }
    ]
  },
  {
    version: '0.0.32-alpha',
    label: '0.0.32 Alpha',
    date: '2026-10-18',
    title: 'A little more lift',
    intro: 'Boosts and landings bring more of the drive to life.',
    sections: [
      { title: 'Feel the ride', items: [
        'Boosting brings a responsive chase view, fresh rocket vapor and a new sound. Look for lift-off and touchdown cues as you jump and land.',
        'The Bay warms at sunrise and sunset. Reduced-motion settings keep the trail still and the camera steady.'
      ] }
    ]
  },
  {
    version: '0.0.31-alpha',
    label: '0.0.31 Alpha',
    date: '2026-10-18',
    title: 'A playground for every car',
    intro: 'Try the fleet freely, or collect driving and takeover awards in your regular game.',
    sections: [
      { title: 'Try it out', items: [
        'Join the sandbox for unlimited cash, vehicle upgrades and map teleporting. Start a fresh practice room to try the early game. Progress in both modes is temporary.'
      ] },
      { title: 'Collect your favorites', items: [
        'In a regular room, drive Tesla and Vault models and take over different street vehicles to earn new collection awards.',
        'Saved drivers keep their completed collections; earlier drives and takeovers do not count retroactively.'
      ] }
    ]
  },
  {
    version: '0.0.30-alpha',
    label: '0.0.30 Alpha',
    date: '2026-10-18',
    title: 'The Bay opens up',
    intro: 'Explore more neighborhoods and take deliveries across the Bay.',
    sections: [
      { title: 'More places to drive', items: [
        'Unlock service areas with your current cash balance and find new fictional customers in 17 Bay towns.',
        'Oakland traffic and navigation work around the stunt ramp and loop. Look for the new Hegenberger station signs.'
      ] },
      { title: 'Deliveries that keep moving', items: [
        'Job searches run in small batches. If spending locks a destination, a replacement keeps your pickup progress.',
        'Rooftop jobs require rockets and a Level 3 air tank. Leaving your car on foot keeps an accessible rooftop job.'
      ] }
    ]
  },
  {
    version: '0.0.29-alpha',
    label: '0.0.29 Alpha',
    date: '2026-10-18',
    title: 'A little more gravity',
    intro: 'Flight takes more planning, especially in heavier vehicles.',
    sections: [
      { title: 'Earn your wings', items: [
        'Early air tanks run out sooner in flight; tank upgrades and efficient nozzles open longer trips.',
        'Sky currents give a smaller assist, while heavier vehicles jump lower and fall faster. Ground boost lasts as long as before.',
        'Rooftop delivery jobs require rockets and a Level 3 air tank. An existing rooftop job reroutes to the ground if you switch to a less capable car.'
      ] }
    ]
  },
  {
    version: '0.0.28-alpha',
    label: '0.0.28 Alpha',
    date: '2026-10-18',
    title: 'A better workshop',
    intro: 'Give your ride some attention in a new garage.',
    sections: [
      { title: 'Make it yours', items: [
        'See your car and balance while you browse upgrades, paint, decals and the remote shop.',
        'Find flight, driving and self-driving upgrades in their own groups. The shop explains when an item needs cash or another upgrade.'
      ] }
    ]
  },
  {
    version: '0.0.27-alpha',
    label: '0.0.27 Alpha',
    date: '2026-10-18',
    title: 'Build Starship together',
    intro: 'Watch the Fremont launch site grow as Tesland earns.',
    sections: [
      { title: 'A mission in the making', items: [
        'The Starship rises with confirmed game-wide earnings, while workers, vehicles and rocket parts bring the construction yard to life.',
        'Find the Fremont mission sign or open the nearby mission shortcut to learn how to board for Mars.'
      ] }
    ]
  },
  {
    version: '0.0.26-alpha',
    label: '0.0.26 Alpha',
    date: '2026-10-18',
    title: 'More room to drive',
    intro: 'Bring more drivers together in the Bay.',
    sections: [
      { title: 'Room for more', items: [
        'Rooms can now admit up to 64 drivers. This limit is still being tested, and busy rooms may slow down.',
        'If a room is full, retry or choose another named room. Automatic overflow is planned.'
      ] }
    ]
  },
  {
    version: '0.0.25-alpha',
    label: '0.0.25 Alpha',
    date: '2026-10-18',
    title: 'A little direction',
    intro: 'Find your next delivery and see the victories you are working toward.',
    sections: [
      { title: 'Your next move', items: [
        'The mission card offers a route to your pickup or dropoff and a steady next award to work toward.',
        'Look for a floating food bag at your pickup and a distinct marker at ground and rooftop dropoffs.',
        'On mobile, expand or minimize the mission, map and driving stats independently. Your choices stay on this device.'
      ] },
      { title: 'Your awards', items: [
        'Explore grouped awards for delivery, flight, exploration, games and collection.',
        'Open repeatable awards to see all five ranks, progress, bonuses and save status.'
      ] },
      { title: 'Fairer fares', items: [
        'Completed deliveries pay at least half the quoted base fare, even if they take longer than expected.',
        'The shop warns you when a purchase will lower your cash-based level.'
      ] }
    ]
  },
  {
    version: '0.0.24-alpha',
    label: '0.0.24 Alpha',
    date: '2026-10-18',
    title: 'Steadier earnings status',
    intro: 'Small timing differences between game services no longer discard a valid earnings-bonus update.',
    sections: [
      { title: 'Keep driving', items: [
        'Earnings updates can wait briefly for their confirmed start time while the room keeps running.',
        'Expired or unavailable bonus data still waits for confirmation; rewards never assume a missing rate.'
      ] }
    ]
  },
  {
    version: '0.0.23-alpha',
    label: '0.0.23 Alpha',
    date: '2026-10-18',
    title: 'Keep the victories coming',
    intro: 'Find more milestones as you keep exploring and playing.',
    sections: [
      { title: 'More to earn', items: [
        'Repeatable activities progress at 1, 10, 100, 1,000 and 10,000 completions, with extra cash at qualifying milestones alongside existing awards.',
        'Saved drivers begin with the progress supported by their existing records; earlier milestones do not pay out again.'
      ] },
      { title: 'Celebrate your rewards', items: [
        'Consecutive reward celebrations now appear one after another, even when they arrive between game updates.'
      ] }
    ]
  },
  {
    version: '0.0.22-alpha',
    label: '0.0.22 Alpha',
    date: '2026-10-18',
    title: 'Fresh radio, visible versions',
    intro: 'Hear recent conversations and know which Tesland build you are driving.',
    sections: [
      { title: 'On the radio', items: [
        'Latent Space and ThursdAI now choose episodes published in the last two months. Older, undated and future episodes stay out of the shuffle.',
        'If a station has no recent episodes, the radio explains it instead of playing the archive. The original 8-bit soundtrack remains available.'
      ] },
      { title: 'Know your build', items: [
        'The browser title and a small label beneath the Tesland logo show the version actually loaded in your tab.',
        'Select the version label to open its changelog entry. An old open tab keeps its old version label until you reload.'
      ] }
    ]
  },
  {
    version: '0.0.21-alpha',
    label: '0.0.21 Alpha',
    date: '2026-10-18',
    title: 'Make your mark',
    intro: 'Choose your next upgrade and make your ride your own.',
    sections: [
      { title: 'Your workshop', items: [
        'Explore new paints and decals, with more finishes to unlock as your cash level rises.',
        'Remote shop access costs $100 per game hour. Existing subscribers keep paid time and can re-enroll at the new rate.'
      ] },
      { title: 'The road ahead', items: [
        'Delivery rewards, achievements, upgrades and marketplace paint prices have been rebalanced.'
      ] }
    ]
  },
  {
    version: '0.0.20-alpha',
    label: '0.0.20 Alpha',
    date: '2026-10-18',
    title: 'More ways to self-drive',
    intro: 'Get back on the road, or give your car a little more ambition.',
    sections: [
      { title: 'Make your way', items: [
        'Street Pilot can try to rejoin a road from off-road and recover when traffic blocks the way.',
        'Buy Ludicrous Leap at the SpaceX shop to hop stopped traffic, then Maximum Plaid to try flight and helpful air currents. Both need rockets.',
        'Choose a mode for your next map or delivery trip. Manual controls take over whenever you like.'
      ] }
    ]
  },
  {
    version: '0.0.19-alpha',
    label: '0.0.19 Alpha',
    date: '2026-10-18',
    title: 'Build a Cybercab fleet',
    intro: 'Put Cybercabs on the road and trade things you own.',
    sections: [
      { title: 'Your fleet', items: [
        'Buy Cybercabs with a saved driver, find them on the map and follow their rides.',
        'Active, self-driving Cybercabs earn income while they are on the road.'
      ] },
      { title: 'The exchange', items: [
        'Collect paints and souvenirs, or buy a starter home to visit with friends.',
        'List owned items at a fixed price. The seller receives 95% of a completed sale.'
      ] }
    ]
  },
  {
    version: '0.0.18-alpha',
    label: '0.0.18 Alpha',
    date: '2026-10-18',
    title: 'Take the scenic ride',
    intro: 'Settle in for smoother self-driving and keep your little victories.',
    sections: [
      { title: 'Cruise to your delivery', items: [
        'Double-tap Shift or tap Self-drive to delivery to route toward your current pickup or drop-off.',
        'Self-driving eases through turns and follows traffic with more room. Use the controls to take over.'
      ] },
      { title: 'Keep your victories', items: [
        'Scores show delivery milestones, room standings and current or recent mini-game results.',
        'Earn new parking and racing awards, and keep confirmed awards with your saved driver.'
      ] }
    ]
  },
  {
    version: '0.0.17-alpha',
    label: '0.0.17 Alpha',
    date: '2026-10-18',
    title: 'Keep the deliveries coming',
    intro: 'A little extra for every three completed deliveries.',
    sections: [
      { title: 'Delivery checkpoints', items: [
        'Earn a $750 bonus for every third delivery, even when a late fare has fallen to zero.',
        'The mission card tracks progress to your next bonus. Your saved driver keeps it alongside delivery progress.'
      ] }
    ]
  },
  {
    version: '0.0.16-alpha',
    label: '0.0.16 Alpha',
    date: '2026-10-18',
    title: 'The Vault opens',
    intro: 'Save your driver, build a collection and explore the Bay.',
    sections: [
      { title: 'Your collection', items: [
        'Find the Vault to buy six luxury cars and motorcycles. Collect owned vehicles at a workshop.',
        'Your saved driver keeps cash, delivery progress, achievements, vehicle upgrades, paint and decals.',
        'Visit UCSF, UC Berkeley, Stanford and SFO for research awards and selected workshop discounts.',
        'Explore the economy story for delivery and fleet simulations and a Bay landmark map.'
      ] }
    ]
  },
  {
    version: '0.0.15-alpha',
    label: '0.0.15 Alpha',
    date: '2026-10-18',
    title: 'Keep the wheels moving',
    intro: 'A performance pass for fast turns, flying deliveries and shared drives.',
    sections: [
      { title: 'More consistent motion', items: [
        'Your car keeps moving between network updates, with more immediate steering and flight controls.',
        'The chase camera stays with you through ordinary takeoffs and landings.',
        'Nearby cars share the driving timeline so bumping and close passes remain part of the game.'
      ] },
      { title: 'Less work around you', items: [
        'Fewer ambient cars share the roads. Police remain, and different vehicle models appear across rooms.',
        'Your car keeps its detail; distant cars use simpler models, and rocket hardware takes fewer drawing calls.',
        'The Bay keeps its geography and landmarks, with more efficient scenery rendering. The 3D view uses a lower resolution on high-density displays while the interface stays sharp.',
        'Rooms now default to eight players. If one is full, retry or create another named room.'
      ] },
      { title: 'Still in alpha', items: [
        'Long network interruptions can still cause a visible position correction when the connection recovers.',
        'The smaller room limit is a precaution while testing continues; it is not a performance guarantee for every device or connection.'
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
        'The game always joins a shared room. If a room is full or unavailable, retry or choose another room.',
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
        'Current delivery payouts are small; the million-dollar earnings needed for the long-term goal will come in future levels. Room funds persist, while personal cash, cars and achievements remain session-only.',
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
