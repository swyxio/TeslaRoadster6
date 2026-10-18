# Food runs and police

A small optional arcade loop: pick up from a real restaurant identity, drive or fly to a fictional customer, and stop at the gold ring. Scores are per player and per current session. This game is independent and does not represent Uber, any restaurant, its menu, or its real delivery service. There is no ordering, payment, or affiliation. All money and flying are fictional.

## How to play

The next restaurant and fare appear at the top left; the gold ring on the minimap and a world beacon mark the pickup. Stop within 9 game meters, on the ground, under 4 m/s to collect automatically. Reaching the restaurant before its pickup estimate earns an immediate bonus, up to 40% of the delivery base fare; the bonus decreases with active time and expires at the estimate. The marker changes to a customer address and the estimate starts. Stop at the destination to collect the fare and get the next order. You can ignore an order and free-roam. Normal cars can deliver; the Roadster can fly shortcuts.

A delivery pays its base fare at the estimate, up to 75% extra for earlier delivery, and progressively less for late delivery, down to zero. Distance and prices are arcade values, not real fares. The HUD shows what delivery would pay at the current time. Your wallet can become negative when a police ticket exceeds your earnings.

The active clock counts input and three seconds after input, or a moving player AV. Both pickup and delivery clocks use the same rule. Standing idle eventually pauses both. An AV driving without input still counts; a parked AV does not. A browser or network stall can suspend simulation or disconnect the room; the clocks are not a competitive anti-cheat guarantee.

Police patrol the city in marked vehicles. Flying 3–80 m above street level within 85 m of police starts a chase (a stationary car on a roof is not flying). Escape beyond 110 m for 10 seconds to shake a pursuer. Police within 12 m can slow a grounded driver; within 7 m at under 4 m/s they issue a $25 ticket. There is a 20-second grace period after a ticket. These are simple arcade rules, not real policing or legal advice. Police use approximate routing around the compressed city and cannot be taken by players.

Open **L · Scores** to see the room's current drivers, ranked by cash, alongside active time and cash per active minute. It is not a persistent leaderboard: leaving removes your score, and a room resets when empty or restarted. Solo scores last until the solo session is reset. Cash and time are simulation-owned in multiplayer; no client sends a fare or delivery result.

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

`shared/delivery.ts` is the content source. Locations must be on supported ground, clear of shared building collision, and reachable without flight. `tests/delivery.test.ts` verifies ground clearance and the core payment, timing, and police rules. Designers can change UI and marker art without changing simulation state or trust boundaries. See [CONTRACTS.md](CONTRACTS.md) before changing shared state.

## Verification

Pickup bonuses and payout celebrations use the shared authoritative simulation; the client presents each new reward once. The minimap marks the player with a larger outlined heading arrow.


On 2026-10-17 the isolated release checkout passed `pnpm run ci` and the two-client local Wrangler room integration. Chrome desktop and emulated 390×844 portrait / 844×390 landscape displayed the objective, leaderboard and touch controls; this is not a physical-device or large-room load test. Delivery and police behavior are covered by shared-simulation tests, including active-time pause and pursuit around a corner.
