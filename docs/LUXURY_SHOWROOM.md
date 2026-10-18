# The Vault: a luxury showroom

**Implementation · 2026-10-18.** The Vault is an independent showroom near Stanford with six cars and motorcycles priced as long-term goals. The showroom includes a persistent wallet, purchase and collection flow, and achievements. Game, recovery and performance checks are recorded in [VERIFICATION.md](VERIFICATION.md).

The original low-poly models are integrated through `src/luxury-models.ts` and `src/vehicles.ts`. Motorcycles have separate front and rear wheels and a rider, with visual steering, lean and cockpit positioning. The showroom uses an on-demand model preview. [PERSISTENCE_ISOLATION.md](PERSISTENCE_ISOLATION.md) describes the wallet design.

## The place

**The Vault · Palo Alto** replaces a generated midrise near Stanford and the Stanford Shopping Center charger. `shared/luxury.ts` defines a 24 × 22 × 9 m building centered at `x=-828.56, z=4003.44`, and a forecourt centered at `x=-829, z=4030` with a 10 m radius. `shared/map.ts` uses that footprint for the collision building; `src/bay-world.ts` renders it and its gold ring. The location is a fictional independent venue.

To purchase, the player stops on the marked forecourt and opens the Vault with the shop control. The authoritative flow checks location and wallet before completing a transaction; a remote workshop subscription does not permit purchases elsewhere. The dialog shows model previews, prices and the projected cash and level after payment. After purchase, the owner can request collection at the Vault or at a physical workshop while stopped. An OTA subscription alone does not provide remote collection.

Validate the building and driveway against Caltrain tracks and platforms, workshops, pickups, landmark access and authoritative surface heights. Check that cars and bikes can approach, park and leave without obstructing the street. [MAP.md](MAP.md) owns the map and collision rules.

## The collection

These candidate prices use the proposed economy's $1m starter home as a reference. Performance descriptions are arcade design targets to tune and measure.

| Vehicle / registry ID | Price | Driving character | Visual signature |
| --- | ---: | --- | --- |
| Ducati Panigale V4 · `ducati-panigale-v4` | $1.5m | Light, nimble steering; quick changes of direction | Red sport-bike fairing, compact tail, low screen and a seated rider. |
| Kawasaki Ninja H2 Carbon · `kawasaki-ninja-h2-carbon` | $2m | Strong straight-line acceleration; stable at speed | Dark carbon upper cowl, green trellis-frame accents and a muscular, compact silhouette. |
| Lamborghini Temerario · `lamborghini-temerario` | $3m | Precise cornering and strong braking | Low nose, hexagonal light elements and a wide rear with high central exhaust. |
| Lamborghini Revuelto · `lamborghini-revuelto` | $4.5m | Hard acceleration and planted all-around handling | Sharp wedge, Y-shaped lights, scissor-door seams and exposed rear engine area. |
| Bugatti Chiron · `bugatti-chiron` | $7m | Fast, durable long-distance cruiser | Horseshoe grille, sweeping C-shaped side line, center spine and thin full-width tail light. |
| Bugatti Tourbillon · `bugatti-tourbillon` | $12m | Composed high-speed handling and the flagship presence | Broad horseshoe, smooth teardrop cabin, slim rear lights and a large diffuser. |

All six together cost $30m before achievement awards. They should feel different to drive, but none generates a passive income or receives an automatic fare multiplier. Faster routes can still change a player's earnings, so measure actual delivery times before treating the collection as economically neutral.

The earlier planning model estimated about 119 active hours to earn $30m at a steady $251,250 per hour, using its old $26k delivery assumption and five cabs at 75% utilization. Delivery fares have since been rebalanced. Buying vehicles can lower the driver's level and job tier; traffic, travel, cab uptime and choices also change the result. Add the collection path to a new long-run simulation before treating the prices as balanced.

The six special IDs are outside `VEHICLE_IDS`, the 26-model ambient roster. Do not seed them into parked cars, NPC traffic, highway traffic or free fleet selection. Their acquisition is a Vault purchase; an owned model can then be collected at the Vault or a physical workshop, including after a level drop. The local wallet integration exercises recovery across reconnects and rooms. Home garages and player resale remain future design work.

## Awards and level changes

Show all six model-specific goals in Awards so that a player can pick a favorite. Award cash once per account for a first purchase of each model, plus collection milestones for owning distinct models. Record model IDs and paid achievement IDs so a reconnect or any future resale and repurchase cannot repeat an award.

| Goal | Candidate one-off reward |
| --- | ---: |
| Discover the Vault | $1k |
| First luxury purchase | $25k |
| Panigale V4 / Ninja H2 Carbon / Temerario | $20k / $25k / $40k |
| Revuelto / Chiron / Tourbillon | $60k / $100k / $150k |
| Own 2 / 4 / 6 distinct luxury models | $50k / $100k / $250k |

The transaction design pays a purchase's awards together; achievement presentation may announce them separately. Awards raise current cash and can reopen levels. They count once toward eligible Starship earnings. Event multipliers remain planned. The income integration checks the first Ducati purchase and replay through the global counter. A first-time Temerario buyer with $3m would spend it, receive the $40k model award plus the $25k first-purchase award, and finish with $65k at level 2. The car stays owned after the level drop. This example assumes no other unclaimed award fires.

## Manufacturer references and model scope

The models should be original game geometry, identifiable from the real vehicles' proportions and visual details. Use manufacturer material as reference, not as a downloadable mesh, texture or logo. Record any estimated geometry and keep game handling and damage tuning separate from manufacturer specifications.

| Reference | Length × width × height, meters | Wheelbase, meters | Primary source |
| --- | --- | ---: | --- |
| Revuelto | 4.947 × 2.033 × 1.160 | 2.779 | [Lamborghini 2024 brochure](https://www.lamborghini.com/original/DAM/lamborghini/facelift_2019/model_detail/revuelto/2024/brochure/REVUELTO_DIGITAL_BROCHURE_CN_2024.pdf) |
| Temerario | 4.706 × 1.996 × 1.201 | 2.658 | [Lamborghini 2026 brochure](https://www.lamborghini.com/original/DAM/lamborghini/0_facelift_2025/model_details_new/temerario_2/brochure_2026/Lamborghini%20Temerario_DIGITAL_BROCHURE_2026_EN.pdf) |
| Chiron | 4.544 × 2.038 × 1.212 | 2.711 | [Bugatti specifications, 2019](https://newsroom.bugatti.com/api/en/press-releases/pdf/bugatti-eb110-vs-chiron-super-sports-and-hyper-sports-cars-compared) |
| Tourbillon | 4.671 × 2.051 × 1.189 | 2.740 | [Bugatti launch specifications](https://worldpremiere.bugatti.com/fr); [design discussion](https://newsroom.bugatti.com/press-releases/pushing-the-limits-of-design) |
| Panigale V4, model year 2025 | Overall envelope to be measured or estimated | 1.485 | [Ducati specifications](https://media.ducati.com/dam/MY25_Panigale_V4_EU_UC662332.pdf) |
| Ninja H2 Carbon, model year 2019 | 2.085 × 0.770 × 1.125 | 1.455 | [Kawasaki 2019 specifications](https://global.kawasaki.com/en/corp/newsroom/news/detail/?f=20180810_1441) |

Car widths exclude mirrors. The Tourbillon launch page's specifications were visible in search but its direct page could not be opened during this research; verify them again when implementing. The Ducati sheet supplies wheelbase but not an overall envelope; any game envelope needs an explicit estimate.

The integrated bikes use two wheel groups, a rider and a driver seat. The renderer hides the rider when unoccupied, steers the front wheel and applies visual lean when grounded; driving and collision behavior remain arcade simulation. Preserve the 26 existing vehicle IDs and their parked, traffic, takeover and driving coverage. Local game checks covered driving and collection; see [VERIFICATION.md](VERIFICATION.md) for the specific models and devices tested.

## Remaining verification

Verify the candidate's debit, ownership and one-off awards under repeated requests, lost replies, slow storage, reconnects and room changes; check another player's takeover attempt and collection without owning a home. A slow profile must not block room input, physics or snapshots.

Render and drive all six models in the actual game on desktop and touch. Inspect the showroom approach, model silhouettes, rider placement, steering, lean, landing, collisions and workshop retrieval. Measure upgraded and Rocket speeds, crowded-room input latency and delivery earning rates before treating the tuning or prices as balanced. Record observations in [VERIFICATION.md](VERIFICATION.md).
