# Food runs and police

A small optional arcade loop: pick up from a real restaurant identity, drive or fly to a fictional customer, and stop at the gold ring. The room leaderboard ranks the drivers currently connected by their spendable cash. This game is independent and does not represent Uber, any restaurant, its menu, or its real delivery service. There is no ordering, payment, or affiliation. All money and flying are fictional.

## How to play

The next restaurant and fare appear at the top left; the gold ring on the minimap and a world beacon mark the pickup. Stop within 9 game meters, on the ground, under 4 m/s to collect automatically. Reaching the restaurant before its pickup estimate earns an immediate bonus, up to 40% of the delivery base fare; the bonus decreases with active time and expires at the estimate. The marker changes to a customer address and the estimate starts. Stop at the destination to collect the fare and get the next order. You can ignore an order and free-roam. Normal cars can deliver; any rocket-equipped vehicle can fly shortcuts. After Oakland opens, some orders go to a flat rooftop when the vehicle has rockets and a Level 3 or higher air tank: fly to the marked height, land, and stop near the center. Exploration orders to newly opened areas take priority over rooftop jobs. The marker sits on the physical roof. If you enter a less capable vehicle, the active rooftop order is rerouted to a ground customer; an already collected order stays collected.

A delivery pays its base fare at the estimate, up to 75% extra for earlier delivery, and progressively less for late delivery, down to half the quoted base fare, rounded up. Distance and prices are arcade values, not real fares. The HUD shows what delivery would pay at the current time. Your wallet can become negative when a police ticket exceeds your earnings.

Every third completed delivery also pays a repeatable $350 checkpoint. The mission card shows progress toward the next checkpoint and identifies the bonus when it is paid. It is separate from one-off achievements. The completed order, bonus and wallet are saved together for a saved driver.

## Unlocking the Bay

Each driver starts with $2,500 and level 0. Current cash determines level, so buying upgrades, paying fines, or buying a vehicle can lower it. Achievements and owned vehicles stay with the saved driver. If a purchase or fine locks an active delivery destination, the job is rerouted to an open area; a driver already in a higher-level area can still leave it.

| Level | Cash | Areas opened |
| --- | ---: | --- |
| 0 | $0 | San Francisco |
| 1 | $10,000 | Oakland and Berkeley |
| 2 | $50,000 | Peninsula and East Bay, including SFO, Stanford and Fremont |
| 3 | $250,000 | San Jose |
| 4–8 | $500,000 / $1m / $2m / $4m / $8m | Higher fare tiers |

The next threshold appears on the mission card. Boundaries apply to flying and driving; Marin, Rocket Dome, North Bay Playground and the SF parking playground remain accessible from the start. The driver's saved wallet retains cash, completed deliveries, current order, achievements and owned luxury vehicles across rooms and reconnects. The active-time leaderboard remains room-local.

Each new job starts with a level-based base fare of $1,200, $1,600, $2,500, $4,000, $5,500, $7,000, $9,000, $12,000 or $16,000 for levels 0–8. The route's distance scales that base between 0.5× and 2× before pickup and delivery timing adjustments. One-off delivery, region and research awards can add cash as the driver progresses.

Orders only select locations already available to that driver. As the world opens, some runs go to the newly unlocked landmark destinations while other jobs stay local or use rooftops. These destinations are fictional deliveries to artistic, compressed versions of real places.

For a rough sense of scale, the complete loop is about 19.9 game km: at a steady 60 km/h it would take about 20 minutes, or about 10 minutes at 120 km/h, before traffic, turns and stops. The 48-minute day cycles at 30 game-clock minutes per real minute; driving physics and order timers remain in simulation seconds. These are design estimates, not measured travel times or real Bay geography.

The active clock counts input and three seconds after input, or a moving player AV. Both pickup and delivery clocks use the same rule. Standing idle eventually pauses both. An AV driving without input still counts; a parked AV does not. A browser or network stall can suspend simulation or disconnect the room; the clocks are not a competitive anti-cheat guarantee.

Police patrol the city in marked vehicles. Flying 3–80 m above street level within 85 m of police starts a chase (a stationary car on a roof is not flying). Escape beyond 110 m for 10 seconds to shake a pursuer. Police within 12 m slow a grounded driver; within 7 m at under 4 m/s they stop the vehicle and issue a citation. The 80 m ceiling limits initial detection; once tracked, higher flight still adds to the fine. Supported roofs, ramps and the stunt loop are not flight. The fine is $60 plus $8 per full two seconds of airborne flight (up to $120), $10 per full 10 m of peak altitude (up to $80), and $35 per previous citation. A prominent citation explains the fine and requires acknowledgement; the room simulation continues while the dialog is open. There is a 20-second grace period after a ticket. These are simple arcade rules, not real policing or legal advice. Police use approximate routing around the compressed city and cannot be taken by players.

Open **L · Scores** to see the room's current drivers, ranked by cash, alongside active time and cash per active minute. Leaving removes a driver's row from the room leaderboard. Cash is saved with the driver's wallet; active time is room-local. The room decides fares and delivery results.

Press **C** or choose **Actions → Camera** for cockpit view; press again for a wide chase view. Inside a vehicle, the view rolls and pitches with it. The small dashboard shows the current pickup or dropoff, its direction and time estimate; a private floating sign appears when the destination is in view. The minimap and police warnings remain available. The leaderboard also shows first-person active time and deliveries whose entire active pickup-and-dropoff run was in cockpit. Camera choice is reported by the client and can be spoofed; it is recognition for this session, not a verified competitive ranking or extra cash. Backgrounding, switching views or stale input during active play can make the current run ineligible. A paused interval does not.

## Achievements

Open **T · Awards** to see progress. **Bay Hopper** rewards flying from San Francisco to Oakland or back without landing on the bridge or Yerba Buena Island; flying over the bridge is fine. **Roof Rider** is for landing on a building, **Sky Delivery** for completing a rooftop order, and **Neighborhood Regular** for three deliveries. Land on Coit Tower or Salesforce Tower for their awards, or stop at Mission San José and San José City Hall to discover them. Each pays a one-off cash award. Shared simulation decides unlocks, and a saved driver retains earned achievements. The delivery ladder pays one-off awards at 1, 10, 25, 50 and 100 deliveries, with smaller check-ins between and after those milestones. Reaching each geographic unlock also pays a one-off award. The Vault adds discovery, purchase and collection awards; see [the showroom](LUXURY_SHOWROOM.md).

## Content and attribution

Restaurant names and street addresses are real business identities verified against the businesses' own sites, while all pickup coordinates in the game are artistic placements on the compressed map. Customers and their addresses are fictional. Do not imply an endorsement or ingest live business data.

| Place | Reference |
| --- | --- |
| Tartine Bakery, 600 Guerrero St, San Francisco | [Tartine Bakery](https://tartinebakery.com/san-francisco/bakery) |
| Tony’s Pizza Napoletana, 1570 Stockton St, San Francisco | [Tony’s](https://tonyspizzanapoletana.com/location/) |
| Burma Superstar, 309 Clement St, San Francisco | [Burma Superstar](https://www.burmasuperstar.com/) |
| House of Nanking, 919 Kearny St, San Francisco | [House of Nanking](https://houseofnanking.net/) |
| Homeroom To Go, 4007 Webster St, Oakland | [Homeroom](https://www.homeroom510.com/locations) |
| Comal Next Door, 550 Grand Ave, Oakland | [Comal](https://www.comalnextdoor.com/location/comal-next-door-oakland/) |

`shared/delivery.ts` is the content source. Ground locations must be on supported ground and clear of shared building collision; rooftop targets use the height and center of a shared flat-roof building and are offered only after a vehicle with rockets and a Level 3 air tank completes an order. `tests/delivery.test.ts` verifies ground clearance and the core payment, timing, and police rules. Designers can change UI and marker art without changing simulation state or trust boundaries. See [CONTRACTS.md](CONTRACTS.md) before changing shared state.

## Verification

Pickup bonuses and payout celebrations use the shared authoritative simulation; the client presents each new reward once. The minimap marks the player with a larger outlined heading arrow.


On 2026-10-17 the isolated release checkout passed `pnpm run ci` and the two-client local Wrangler room integration. Chrome desktop and emulated 390×844 portrait / 844×390 landscape displayed the objective, leaderboard and touch controls; this is not a physical-device or large-room load test. Delivery and police behavior are covered by shared-simulation tests, including active-time pause and pursuit around a corner.
