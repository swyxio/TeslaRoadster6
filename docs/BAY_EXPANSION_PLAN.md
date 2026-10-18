# Bay-wide driving and accelerated traffic — proposal

2026-10-17 Pacific. This records the original proposal and its assumptions, not current implementation status. See MAP.md, CONTRACTS.md and VERIFICATION.md for the implemented slice and observations. Numbers below are design assumptions or arithmetic estimates unless explicitly marked observed. This is an arcade world, not a transportation forecast.

## Recommendation

Build a recognizable, selectively compressed Bay with a continuous SF–Peninsula–San Jose–Fremont–Oakland–Bay Bridge circuit. Start near 1:8 corridor distance compression, preserve full-size cars and useful lane widths, and use a 48-minute day. Start with one convincing highway/urban slice before generating the whole region. Improve road geometry, hills, silhouettes, signage and traffic behavior before adding photoreal textures.

Keep driving physics in real seconds. Accelerate the sun and daily demand, not braking, signal cycles, collision integration or human reaction time. The game should offer both busy commutes and long stretches where players can open the throttle.

## Observed baseline

Inspected `shared/map.ts`, `shared/traffic.ts`, `shared/game.ts`, `worker/index.ts` and current contracts:

- Bounds: 1,060 × 900 m, a 0.954 km² bounding rectangle, including water. No Peninsula or San Jose.
- Flat land/decks; no highway lanes, elevated junctions or terrain following. Buildings already have a spatial collision index.
- 26 moving NPCs plus 26 parked catalog cars; street cruising targets 8 m/s (28.8 km/h), corners 4.5 m/s. Obstacle yielding scans all entities. No signals, demand model or lane changing.
- 20 Hz shared physics, 10 Hz full-world snapshots, all-pairs entity collisions. Default room capacity 64 is provisional.
- Local serialization probe: create world, add 64 drivers, advance 100 × 0.05 s with neutral input. 116 entities; state message 34,370 UTF-8 bytes. This is a single fixture, not a maximum or network/load benchmark.

## Reusable sources

| Source | Use | Boundary |
|---|---|---|
| [SF Kart](https://github.com/freecode-sh/sf-kart) | Study/adapt offline map baking, road profiles and recognizable SF scenery | MIT code; [baked data has its own licenses](https://github.com/freecode-sh/sf-kart/blob/main/DATA_LICENSE.md). Its race-course collision/physics is not our multiplayer road contract. |
| [Map3D](https://github.com/cartesiancs/map3d) | Building/road extrusion reference; small export experiment | Inspect exact export and license before importing; a visual GLB does not supply lane topology or safe collision. |
| [USGS 3DEP](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services) | Terrain elevation | USGS describes products as free without use restrictions. Verify local dataset resolution and coverage at download time. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Highway graph, roads, bridge/tunnel/layer tags, footprints | Keep attribution and a separately documented derived map dataset, with its applicable ODbL obligations. Missing lane/elevation tags need authored corrections. |
| [Anyscape Bay model](https://anyscape.io/3d-city-models/san-francisco-bay-area/) | Optional visual reference/sample comparison | Vendor coverage is not verified game readiness; review browser redistribution/source-repository rights before buying or bundling. |
| [Bmap](https://www.bmap.io/) | Optional district art prototype | Advertises GLB, $29 single export and $49/month Creator with maps up to 5 km; pricing/claims checked today, actual license and export not evaluated. |

Recommendation: reusable open-data bake plus authored landmark/interchange passes. Do not start by purchasing a giant mesh. Pin source revisions, bounding boxes and retrieval dates; record license and generator for every shipped file. Keep source data separate from first-party code. No paid services or asset purchases are needed for the first slice.

## Geography and fidelity

Core circuit: SF → US-101 Peninsula → San Jose → I-880 via Fremont → Oakland → I-80/Bay Bridge → SF. Add I-280 as a scenic Peninsula alternate, then San Mateo and Dumbarton bridges as shortcuts. Golden Gate/Marin remains a branch; add Richmond–San Rafael and the north/east connections later to make an outer loop. This is coverage of the Bay's principal driving corridors, not every street in all nine counties.

Keep SF hills/waterfront, Peninsula airport/office corridors, San Jose downtown, Fremont industrial/suburban areas and Oakland port/downtown visually distinct. The compressed Bay should still read correctly from the air.

Uniformly scaling a GIS scene by 1/8 would make lanes and buildings too small. Instead retain road connectivity and recognizable relative geography while shortening uneventful stretches. Use roughly 3.5 m lanes as an initial art/gameplay assumption, full-size fleet dimensions, and selected larger district pockets. Bake both visuals and collision from the same transformed data. Preserve minimum junction separation, curve radii and ramp run lengths even when that breaks the nominal compression ratio. Recheck the resulting loop length after authoring.

Terrain and stacked roads need a new shared surface contract: height, normal and connected road/surface ID. A single heightfield cannot represent a bridge over a road. The simulation must retain the car's connected surface, handle ramps and airborne landing, and reject the wrong deck. Render/minimap/AI consume the same graph; GLB triangles are presentation, not the source of truth. This will require coordinated protocol and contract changes when implemented.

## Distance envelope

Assume a representative 200 km real-world circuit and an 80 km SF–SJ corridor, pending measurement of the chosen OSM routes. These are rounded planning inputs, not sourced route lengths. Formula: real minutes = source km / compression / average km/h × 60.

| Distance compression | Circuit game length | Circuit at 100 km/h average | Circuit at 160 km/h average |
|---|---:|---:|---:|
| 1:1 | 200 km | 120 min | 75 min |
| 1:5 | 40 km | 24 min | 15 min |
| **1:8** | **25 km** | **15 min** | **9.4 min** |
| 1:10 | 20 km | 12 min | 7.5 min |

At 1:8, SF–SJ becomes approximately 10 game km: 6 minutes at 100 km/h, 3.75 at 160, or 2.73 at 220. The 25 km circuit at 220 averages 6.82 minutes. These are uninterrupted travel estimates; acceleration, junctions, congestion and stops add time. 160–220 km/h averages require an appropriate clear route and vehicle, not ordinary traffic.

Rough region envelope assumption: 100 × 80 source km → 12.5 × 10 game km = 125 km² including water. That is 131 times the current bounding area. Do not multiply current building density across all of it. Concentrate detail around traversable corridors and destinations.

## Two clocks

Physics and gameplay timers remain in `World.time` seconds. Proposed authoritative day metadata: start minute and clock rate, with day minute = (start minute + World.time × rate / 60) modulo 1,440. Rejoining reads the same room time. No dependence on the browser's local timezone or frame rate.

| Day duration | Clock rate | One game hour | A 3-hour rush window |
|---|---:|---:|---:|
| 24 real min | 60× | 1 real min | 3 real min |
| **48 real min** | **30×** | **2 real min** | **6 real min** |
| 72 real min | 20× | 3 real min | 9 real min |

Use 48 minutes initially, start new rooms near 06:00, ramp demand gradually into 07:00–10:00 and 16:00–19:00. A 15-minute circuit spans 7.5 game hours: this is intentionally stylized, not a realistic commuter diary. Day and night must both preserve road visibility on phones.

Signals run on 45–90 **real-second** cycles, with suitable real-time clearance phases. At 30×, an unseparated 60-second cycle would become two seconds: unusable. Following gaps, braking, merge decisions, charger refill, pickup respawn and incident duration also stay in physics seconds. Only lighting, day labels and demand schedules use the day clock. Existing `World.time` semantics must not change.

Demand is expressed in vehicles per real simulation second, selected by game time. Never multiply vehicle arrival rates by 30 just because the day advances 30×. Blend profile changes across 30–60 real seconds and preserve queues across schedule changes.

## Typical traffic situations

These are authored plausible patterns, not measured Bay commute flows. Use seeded choices and server authority. Start with lane following and stop lines, then merge behavior; a lane graph is needed before these are credible.

| Situation | Behavior | Play/acceptance goal |
|---|---|---|
| Overnight freeway | Sparse independent vehicles, varied desired speeds | Sustained high-speed run without artificial walls of traffic |
| Morning commute | Directional inflows toward selected employment hubs, busy ramps | Recognizable rush hour while alternate routes remain useful |
| Evening commute | Reverse selected demand pairs, staggered peaks | Different trouble spots on the return drive |
| Ramp merge | Gap acceptance, yielding and speed matching; turn indication | No random lateral jumps or forced unavoidable pileups |
| Bridge bottleneck | Queue forms at a reduced-capacity approach | Queue tail visible early; exits allow a detour |
| City junction | Signals/stop lines, turning paths, queue spillback | Cars stop before crosswalks and don't enter blocked intersections |
| Pickup/drop-off | A vehicle dwells at a curb; others pass when safe | Short local disruption without permanent deadlock |
| Incident | Temporarily blocked lane, merge upstream, timed clearing | A noticeable evolving situation; never despawn an occupied car |
| Player obstruction | Following traffic brakes and queues, then reroutes if possible | Deterministic recovery; no teleporting visible traffic |

Use a simple established car-following model with minimum gap, desired time headway, bounded acceleration/braking and desired speed; consult [SUMO's model/step guidance](https://sumo.dlr.de/docs/Simulation/Basic_Definition.html). SUMO separates demand, network and simulation inputs; use that distinction, not an embedded SUMO service in the game. Offline SUMO comparison is optional once our lane model exists. Initial behavior targets might be 1.5–2 s headways and 90–110 km/h freeway cruise, with seeded variation. All are arcade tuning, not AV claims. Pedestrian crossings require actual pedestrian state; defer them beyond the first vehicle-only slice.

## Queue and density arithmetic

At 100 km/h, speed = 27.78 m/s. For a 5 m car, 2 m standstill gap and 1.5 s following gap, pitch ≈ 5 + 2 + 27.78 × 1.5 = 48.67 m. That gives approximately 20.5 cars/lane/km and 2,055 vehicles/hour/lane under idealized steady flow. Real junctions, braking and trucks lower throughput.

- One 1 km highway section with three lanes each way: 6 lane-km × 20.5 ≈ 123 NPCs at that density.
- A 25 km circuit with six lanes throughout: 150 lane-km × 20.5 ≈ 3,082 vehicles. This is a deliberately rough upper-envelope topology, not a plan to simulate them all microscopically.
- Queue example: inflow 1,800 vehicles/hour, discharge 1,200 → +600/hour = 10 vehicles/minute. Over a six-real-minute rush, 60 vehicles accumulate. At 7 m stationary pitch, the queue is 420 m in one lane. If arrival then drops to 900/hour while discharge stays 1,200, clearing takes 12 real minutes. Queues must not vanish at the clock boundary.
- First incident vignette: +600/hour excess for 90 real seconds → 15 queued cars, roughly 105 m; use this before room-wide rush hour.

Densities are targets, subject to a hard room budget. Begin at 64 moving NPCs, test 128, then test 256 only after profiling. Preserve the 26 catalog NPC identities and parked examples. Full geographic coverage does not mean every remote lane needs persistent individual cars.

## Simulation and network envelope

Current 116-entity local fixture: 34,370 bytes × 10 snapshots/s × 64 recipients ≈ **22 MB/s** application payload per full room, about 79 GB/hour if sustained. Per recipient ≈ 344 kB/s or 2.75 Mbit/s. This excludes WebSocket/TLS overhead and assumes no compression; it is arithmetic, not measured production traffic or billing.

All-pairs collision candidates at 20 Hz:

| Total entities | Pair checks/second |
|---:|---:|
| 116 | 133,400 |
| 300 | 897,000 |
| 600 | 3,594,000 |

NPC obstacle scans add work beyond this table. Use spatial neighborhoods for collision and lane-ordered leader lookup before adding hundreds of cars. Advance active vehicles at the existing 20 Hz; profile deterministic decision updates at 5–10 Hz. Remote unobserved corridors can use aggregate queue/flow counts, then instantiate traffic only at safe unseen entry points. Overlapping player neighborhoods must share one authoritative vehicle, not duplicate it. Occupied cars and vehicles still relevant to a nearby observer cannot be demoted. If 64 dispersed players exceed budget, reduce ambient density explicitly rather than promising uniform dense traffic everywhere.

Recipient interest sets and compact updates become justified at this scale. Illustrative target: 100 relevant moving entities × 48 bytes × 10 Hz = 48 kB/s/client, or 3.07 MB/s for 64. The 48-byte record is an unimplemented encoding budget; add names, identities, full keyframes, removals, acknowledgments if used, overhead and bursts. Measure before adopting a wire format. Join must receive static map/version identity and a complete relevant snapshot; membership changes need explicit creation/removal and interpolation handling. Protocol changes and integration tests ship together.

At 220 km/h, a car moves 3.06 m per 50 ms physics step and 6.11 m between 10 Hz snapshots. Swept collision or bounded substeps are needed for thin barriers; interpolation alone cannot fix missed collisions. For a nominal 0.2 s reaction and 8 m/s² deceleration, stopping distance v×0.2 + v²/(2×8) ≈ 246 m. These are game parameters; make sightlines and spawn lookahead generous enough for the speed fantasy.

## Streaming and art budget

Start with roughly 500 m game-space chunks and directional prefetch. At 220 km/h, 500 m is crossed in 8.2 seconds. A 1 km lookahead provides 16.4 seconds. At an assumed 10 Mbit/s effective download, a 1 MB compressed chunk takes 0.8 s before latency/decode; multiple neighbors and bursts consume that margin. If data is unavailable, use an explicit loading boundary before unsupported terrain, never let the client invent road support.

Keep existing first-play <3 MB compressed and optional art <8 MB targets for the initial slice. A complete Bay will need staged optional downloads and a measured revised whole-world budget, not a claim it fits 8 MB. As an illustration, 25 km × 0.5 km corridor = 12.5 km², about 50 equivalent 500 m square chunks; 0.25–1 MB/chunk is 12.5–50 MB, excluding district expansion and shared assets. A full 125 km² rectangle is about 500 such chunks. Curves, branches, chunk borders and bridges change the real count.

Load server collision/route data independently of visual chunks. Keep far skyline/coast/hills cheap and visible in flight; detailed collision must already exist before the player arrives. Near geometry uses instancing, shared materials and LOD. Avoid full-resolution aerial imagery as the default art direction. Performance gates remain 60 fps desktop/30 fps mobile targets, not verified outcomes; capture frame-time, memory and thermal behavior on named physical devices.

## Delivery sequence and gates

1. **One measured slice:** 1–2 game km of highway plus a recognizable SF hill/urban approach, a ramp and a stop-controlled or signaled junction. Bake graph/surfaces/visuals together. Compare scenic quality with the current game from chase camera and flight. Keep all 26 catalog IDs usable. Estimate: 2–4 focused engineer-days, subject to terrain importer discovery.
2. **Shared elevation and speed correctness:** bridge-over-road, ramps, airborne landing, swept collision, graph/minimap consistency and safe recovery. Test solo and multiplayer at 100/160/220 km/h with relevant vehicles. Estimate: 3–6 days; overlaps slice work, do not blindly add estimates.
3. **Continuous circuit:** Peninsula, SJ, Fremont and Oakland road backbone; landmarks at selected destinations, streaming/prefetch and provenance manifest. Measure actual route lengths. Estimate: 4–8 days after the slice proves the pipeline.
4. **Living traffic:** day metadata, following, signals, ramp merging and one bounded queue vignette, then daily demand profiles. Start 64 NPCs, add spatial lookup/interest management as benchmarks require. Estimate: 4–8 days.
5. **Capacity and device pass:** 1/16/32/64-player runs, both clustered and dispersed; 30-minute sustained sessions, snapshot gaps/bytes, step CPU, real mobile driving and failed-chunk recovery. Estimate: 2–4 days plus device/access time.

Overall planning allowance: roughly 3–6 engineer-weeks for a convincing Bay circuit and useful traffic, with considerable uncertainty; not a commitment or an estimate for production-quality city replication. Stop after the first slice if visual quality, hill handling or mobile cost fails. Defer full nine-county streets, transit schedules, live traffic APIs, persistent agents and accounts.

Every implementation increment must remain playable, pass `pnpm test` and `pnpm build`, and record dated verification. Changes to networking require live `room.integration.ts`; map/terrain changes need both bridge levels and fast landings tested; visuals require desktop, portrait and landscape. Compare queue growth/clearance against the simple deterministic examples above, replay seeds, and exercise jam recovery and clock wrap. Update CONTRACTS/MAP/DESIGN with the actual chosen behavior when implemented. Contributors open PRs; maintainers integrate and deploy within authorization.

## Next concrete decision

Proceed with the highway + SF hill slice at nominal 1:8 compression, a 48-minute day and 64 moving NPCs as the first target. Evaluate it before approving Bay-wide asset generation. This historical recommendation is not evidence that every capability has shipped; consult the current contracts and verification log.
