# The Vault: a luxury showroom

**Design and vehicle research · 2026-10-18.** A driver discovers a small independent showroom near Stanford, walks or drives into its forecourt, and finds cars and motorcycles priced like property. These are personal goals: the player chooses whether to put money into a Cybercab, build a home, or buy something extraordinary to drive.

The showroom, purchases and achievements are planned. House-priced ownership depends on the persistent, responsive wallet in [PERSISTENCE_ISOLATION.md](PERSISTENCE_ISOLATION.md); the current room resets individual money and vehicles and pays session-scale fares. The location and models below need game-world validation before release.

The [six model prototypes](../experiments/luxury-models.ts) are original low-poly scene graphs with source-based proportions and distinguishing details. They are outside the game and have not been visually checked. Motorcycles have separate wheel and rider groups; integration still needs steering, lean, collision and camera work.

## The place

Call the shop **The Vault · Palo Alto**. A screened candidate is the generated midrise centered at `x=-828.56, z=4003.44`, near Stanford and the Stanford Shopping Center charger. Replace that building with a low, glass-fronted showroom; put its proposed purchase ring at `x=-829, z=4030`. This is a fictional independent venue, not a real dealership.

The candidate ring has supported ground at height zero, and an initial geometry check found no current building, road, parking lot or nearby landmark arrival in its 24-by-24-meter bounding box. Before committing to the site, check the entire building and driveway against Caltrain tracks and platforms, existing workshops and pickups, landmark access, vehicles, traffic and authoritative surface heights. Confirm that cars and bikes can approach, park and leave without obstructing the street. [MAP.md](MAP.md) owns the map and collision rules.

An achievement can hint at the Vault before discovery. To make the purchase, the player must physically reach the showroom and stop in its marked forecourt; the server validates their location, balance and vehicle selection. A remote workshop subscription does not bypass that visit. The showroom lists each vehicle, its price, handling character and the wallet/level that would remain after purchase.

## The collection

These candidate prices use the proposed economy's $1m starter home as a reference. They are in-game prices, not real-market quotations. Performance descriptions are arcade design targets to tune and measure.

| Vehicle | Price | Driving character | Visual signature to model |
| --- | ---: | --- | --- |
| Ducati Panigale V4 | $1.5m | Light, nimble steering; quick changes of direction | Red sport-bike fairing, compact tail, low screen and a seated rider. |
| Kawasaki Ninja H2 Carbon | $2m | Strong straight-line acceleration; stable at speed | Dark carbon upper cowl, green trellis-frame accents and a muscular, compact silhouette. |
| Lamborghini Temerario | $3m | Precise cornering and strong braking | Low nose, hexagonal light elements and a wide rear with high central exhaust. |
| Lamborghini Revuelto | $4.5m | Hard acceleration and planted all-around handling | Sharp wedge, Y-shaped lights, scissor-door seams and exposed rear engine area. |
| Bugatti Chiron | $7m | Fast, durable long-distance cruiser | Horseshoe grille, sweeping C-shaped side line, center spine and thin full-width tail light. |
| Bugatti Tourbillon | $12m | Composed high-speed handling and the flagship presence | Broad horseshoe, smooth teardrop cabin, slim rear lights and a large diffuser. |

All six together cost $30m before achievement awards. They should feel different to drive, but none generates a passive income or receives an automatic fare multiplier. Faster routes can still change a player's earnings, so measure actual delivery times before treating the collection as economically neutral.

As a rough upper-rate comparison, a $26k delivery every eight minutes plus five cabs running at 75% utilization would gross about $251,250 per active hour before awards, events or operating costs. At that steady rate, $30m is about 119 active hours. Buying vehicles can lower the driver's level and job tier, and actual traffic, travel, cab uptime and choices change the result. Add this purchase path to the existing five-minute simulations before treating the prices as balanced.

The showroom's models are exclusive to an in-person purchase. Do not seed these IDs into parked cars, NPC traffic, highway traffic or free fleet selection; do not allow an unowned showroom display to be taken. Once bought, a car or bike remains owned through reconnects and level drops. The showroom keeps a recoverable account record and offers collection there even before the player owns a home; a home garage can also hold its configuration after purchase. Avoid introducing player resale for these models until transfer rules preserve the shop-exclusive acquisition decision.

## Awards and level changes

Show all six model-specific goals in Awards so that a player can pick a favorite. Award cash once per account for a first purchase of each model, plus collection milestones for owning distinct models. Record model IDs and paid achievement IDs so a reconnect or any future resale and repurchase cannot repeat an award.

| Goal | Candidate one-off reward |
| --- | ---: |
| Discover the Vault | $5k |
| First luxury purchase | $25k |
| Panigale V4 / Ninja H2 Carbon / Temerario | $20k / $25k / $40k |
| Revuelto / Chiron / Tourbillon | $60k / $100k / $150k |
| Own 2 / 4 / 6 distinct luxury models | $50k / $100k / $250k |

Awards from a single purchase pay together and appear as one notification. They raise the current wallet and can reopen levels, but do not receive event multipliers. They do count as eligible Starship earnings once. A first-time Temerario buyer with $3m would spend it, receive the $40k model award plus the $25k first-purchase award, and finish with $65k at level 2. The car stays owned after the level drop. This example assumes no other unclaimed award fires.

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

Motorcycles need a real two-wheel presentation, a visible rider, a suitable seat and steering/lean behavior. The current four-wheel renderer and ground-physics roll handling do not provide these automatically. Preserve the 26 existing vehicle IDs and their parked, traffic, takeover and driving coverage when extending the catalog.

## Implementation and verification

1. Finish the persistent player wallet and ownership transaction path first. One authoritative, idempotent purchase must debit the wallet, grant the model and issue its one-off awards together; lost replies, concurrent requests, disconnects and room changes must not lose or duplicate the purchase. Do not block room input, physics or snapshots while the buyer's profile is slow.
2. Register luxury models separately from the existing ambient fleet. Apply the ownership check to selection, interaction, vehicle restoration and any showroom display, including forged client requests. Update shared gameplay and network contracts with the actual implementation.
3. Add the validated showroom location and a desktop-and-touch interface, then render and drive all six models in the actual game. Check their silhouettes from front, side and rear; inspect bike steering, rider placement, landing, collisions and garage retrieval.
4. Start within the existing fastest base-car speed envelope. A single fast entity can increase physics substeps for the whole room, so benchmark upgraded/rocket speeds and crowded-room input latency before increasing it. Compare delivery earning rates, model costs and the effect of wallet-level drops in the simulations.
5. Check insufficient funds, first-time and repeated purchase, purchase during a level drop, duplicate purchase requests, failed save and replay, reconnect, another player's takeover attempt, and an owner without a home. Record the observed results in [VERIFICATION.md](VERIFICATION.md).
