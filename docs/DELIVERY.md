# Food runs and police

A small optional arcade loop: pick up from a real restaurant identity, drive or fly to a fictional customer, and stop at the gold ring. Scores are per player and per current session. This game is independent and does not represent Uber, any restaurant, its menu, or its real delivery service. There is no ordering, payment, or affiliation. All money and flying are fictional.

## How to play

The next restaurant and fare appear at the top left; the gold ring on the minimap and a world beacon mark the pickup. Stop within 9 game meters, on the ground, under 4 m/s to collect automatically. Reaching the restaurant before its pickup estimate earns an immediate bonus, up to 40% of the delivery base fare; the bonus decreases with active time and expires at the estimate. The marker changes to a customer address and the estimate starts. Stop at the destination to collect the fare and get the next order. You can ignore an order and free-roam. Normal cars can deliver; any rocket-equipped vehicle can fly shortcuts. After Oakland opens, some orders for rocket-equipped vehicles go to a flat rooftop: fly to the marked height, land, and stop near the center. Exploration orders to newly opened areas take priority over rooftop jobs. The marker sits on the physical roof. Use a rocket pickup, visit a shop, or select the Roadster in Fleet if you changed to a non-flying car before finishing a rooftop order.

A delivery pays its base fare at the estimate, up to 75% extra for earlier delivery, and progressively less for late delivery, down to zero. Distance and prices are arcade values, not real fares. The HUD shows what delivery would pay at the current time. Your wallet can become negative when a police ticket exceeds your earnings.

## Unlocking the Bay

Every driver starts at level 0 in San Francisco. Complete deliveries and earn rewards to unlock level 1 (Oakland and Berkeley), level 2 (the Peninsula and East Bay, including SFO, Stanford and Fremont), and level 3 (San Jose). The mission card shows the next delivery and lifetime-earnings targets. Lifetime earned includes pickup bonuses and delivery pay before purchases or tickets, so spending cash never closes a region. An attempted crossing reports the requirements. Boundaries apply to flying and driving alike; Marin, the separate Rocket Dome, Rocket Island and the SF parking playground remain available from the start. Milestones are per player and per game session, including in multiplayer. Restoring a chat identity does not restore game progress.

| Level | Area | Completed deliveries | Total earned |
| --- | --- | ---: | ---: |
| 0 | San Francisco | 0 | $0 |
| 1 | Oakland and Berkeley | 2 | $50 |
| 2 | Peninsula and East Bay | 5 | $140 |
| 3 | San Jose | 8 | $350 |

For a ground-car starter sequence, the first five base fares are roughly $43, $36, $65, $42 and $29. On-time drops with partial pickup bonuses would earn about $95 after two and $258 after five; slow or missed bonuses can require additional runs. Long-distance orders pay more. These are examples, not a guaranteed reward.

Orders only select locations already available to that driver. As the world opens, some runs go to the newly unlocked landmark destinations while other jobs stay local or use rooftops. These destinations are fictional deliveries to artistic, compressed versions of real places.

For a rough sense of scale, the complete loop is about 19.9 game km: at a steady 60 km/h it would take about 20 minutes, or about 10 minutes at 120 km/h, before traffic, turns and stops. The 48-minute day cycles at 30 game-clock minutes per real minute; driving physics and order timers remain in simulation seconds. These are design estimates, not measured travel times or real Bay geography.

The active clock counts input and three seconds after input, or a moving player AV. Both pickup and delivery clocks use the same rule. Standing idle eventually pauses both. An AV driving without input still counts; a parked AV does not. A browser or network stall can suspend simulation or disconnect the room; the clocks are not a competitive anti-cheat guarantee.

Police patrol the city in marked vehicles. Flying 3–80 m above street level within 85 m of police starts a chase (a stationary car on a roof is not flying). Escape beyond 110 m for 10 seconds to shake a pursuer. Police within 12 m slow a grounded driver; within 7 m at under 4 m/s they stop the vehicle and issue a citation. The 80 m ceiling limits initial detection; once tracked, higher flight still adds to the fine. Supported roofs, ramps and the stunt loop are not flight. The fine is $60 plus $8 per full two seconds of airborne flight (up to $120), $10 per full 10 m of peak altitude (up to $80), and $35 per previous citation in the session. A prominent citation explains the fine and requires acknowledgement; the room simulation continues while the dialog is open. There is a 20-second grace period after a ticket. These are simple arcade rules, not real policing or legal advice. Police use approximate routing around the compressed city and cannot be taken by players.

Open **L · Scores** to see the room's current drivers, ranked by cash, alongside active time and cash per active minute. It is not a persistent leaderboard: leaving removes your score, and a room resets when empty or restarted. Solo scores last until the solo session is reset. Cash and time are simulation-owned in multiplayer; no client sends a fare or delivery result.

Press **C** or choose **Actions → Camera** for cockpit view; press again for a wide chase view. Inside a vehicle, the view rolls and pitches with it. The small dashboard shows the current pickup or dropoff, its direction and time estimate; a private floating sign appears when the destination is in view. The minimap and police warnings remain available. The leaderboard also shows first-person active time and deliveries whose entire active pickup-and-dropoff run was in cockpit. Camera choice is reported by the client and can be spoofed; it is recognition for this session, not a verified competitive ranking or extra cash. Backgrounding, switching views or stale input during active play can make the current run ineligible. A paused interval does not.

## Session achievements

Open **T · Awards** to see progress. **Bay Hopper** rewards flying from San Francisco to Oakland or back without landing on the bridge or Yerba Buena Island; flying over the bridge is fine. **Roof Rider** is for landing on a building, **Sky Delivery** for completing a rooftop order, and **Neighborhood Regular** for three deliveries. These are session-only and shared simulation decides unlocks.

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

`shared/delivery.ts` is the content source. Ground locations must be on supported ground and clear of shared building collision; rooftop targets use the height and center of a shared flat-roof building and are offered only after a flight-capable vehicle completes an order. `tests/delivery.test.ts` verifies ground clearance and the core payment, timing, and police rules. Designers can change UI and marker art without changing simulation state or trust boundaries. See [CONTRACTS.md](CONTRACTS.md) before changing shared state.

## Verification

Pickup bonuses and payout celebrations use the shared authoritative simulation; the client presents each new reward once. The minimap marks the player with a larger outlined heading arrow.


On 2026-10-17 the isolated release checkout passed `pnpm run ci` and the two-client local Wrangler room integration. Chrome desktop and emulated 390×844 portrait / 844×390 landscape displayed the objective, leaderboard and touch controls; this is not a physical-device or large-room load test. Delivery and police behavior are covered by shared-simulation tests, including active-time pause and pursuit around a corner.
