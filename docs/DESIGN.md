# Poly AV game design · simple fun first

## Product decisions

Approved: stylized compressed Bay Area; driving/stunts first; real Tesla Supercharger identities with fictional compressed-air refills; shared public rooms with more than16 capacity; desktop AND phone. Defer shooting and death/respawning but reserve a concrete design. The visual baseline is original low-poly geometry, not a requirement that later art must remain low-poly.

## Thirty-second loop

Join → start seated in a Roadster → accelerate → jump above a block → flip → land → find a charger → do it again with a friend. No account, tutorial wall, garage purchase, grind, or mandatory mission. Every participant starts with a usable vehicle and100 air. Every researched family has parked and autonomous traffic examples. NPCs can be taken while nearby; human-occupied cars cannot be stolen. Fleet selection also offers every model directly when stopped.

The simulation prioritizes arcade legibility over realism. Ground friction slows an unattended car. The Rocket shares one air tank between boost, jumps and rolls. A jump costs 24%, a one-tap flip costs 9%, and boost consumes 14% per second. Holding Hover in free air enables fictional thruster hover at 18% per second; hover can maintain an inverted orientation. Gravity and flight assist return the car to the ground; manual roll remains available. Air jumps and free-air hover are arcade fiction. Underbody fans adhere the Rocket to the purpose-built loop without consuming compressed air and cannot hold it in free air. A depleted tank never prevents ordinary driving or falling. Station refills take about3.6seconds from empty, only when grounded and stopped within9m. Pickups provide instant full air or repair with20second respawn. Condition is clamped to5 rather than introducing death before its design exists.

## Delivery loop

Follow the gold marker to a notable restaurant, stop to collect an order, then deliver it to a fictional address. A fast pickup pays an immediate bonus. A separate estimate starts after pickup; beating it adds a delivery bonus and arriving late reduces the fare. The HUD shows current cash and active play time, and Scores compares the current room. Unattended time pauses after a short grace period. Driving and stunts remain available without completing orders.

Roadster flight can shorten a run but nearby police may spot it, pursue and slow the car before issuing a severity- and repeat-offense-based citation. Roadster orders sometimes target a physical rooftop, and four session achievements reward crossing the Bay without landing, rooftop play and deliveries. Escaping their range or accepting a ticket ends a chase. All cash, timing and police behavior run in the shared simulation. Restaurants have no game affiliation, the geography and customers are fictionalized, and cash is not real money. See [DELIVERY.md](DELIVERY.md).

## Current content

A compressed Bay circuit connects San Francisco, the Peninsula, San Jose, Fremont, Oakland and the Bay Bridge; the Golden Gate remains a Marin branch. Highway traces start from OpenStreetMap and are transformed and joined with fictional roads; streets, shorelines, landmarks and districts are authored approximations, not navigation data. The circuit measures about 19.9 game km. The Oakland launch ramp and stunt loop are shared physical surfaces; water is below the roads and unsupported water landings recover the car to a safe street. See [MAP.md](MAP.md). Four primary-source station identities use artistic coordinates; air refilling and flight are fictional.

Controls: steering plus forward/reverse; separate brake. While a player car is moving forward, braking or reversing into a turn starts an arcade slide; release to regain grip. Person movement currently uses the same turn-and-move arcade controls. Exit requires grounded speed≤5m/s; entry selects closest empty car within7m. Unstuck recovery repositions the current entity while preserving condition/air and is not death/respawn.

## Visual direction

Warm coastal daylight, desaturated sea/teal city, cream type, amber player/actions, mint charger markers. Car silhouettes and roadway contrast matter more than texture detail. Vehicle airborne state, remaining air, repair state, nearest station distance and visible other players must remain readable. Keep minimal instruments; do not turn the screen into a dashboard of implementation metrics.

Alternatives can change style, HUD organization and models. Preserve the same gameplay entry points, touch equivalents and state transitions. See ASSETS.md for geometry/attachment budgets. Brand name is Poly AV (formerly Bay Drive); Poly Ave is an in-world street. Tesla Roadster is an in-game vehicle identity, with no claim of official affiliation or real flight capability.

## Multiplayer scale

Target is a busy small playground, not a single giant universe. Default64 participants per room; configurable up to provisional128. Multiple independent rooms scale horizontally through Durable Objects. A platform connection limit is not a simulation capacity promise. The implementation sends recipient-filtered 10 Hz snapshots and uses a spatial index for entity collisions. Increase room limits only after CPU, memory, outbound bytes, snapshot gaps, input-to-observed latency and mobile rendering have been measured.

Snapshots always retain players and occupied cars, plus nearby ambient entities; the room remains authoritative for the entire world. Building and entity collisions use spatial indexes. Further possible steps are compact delta snapshots and sequence numbers with prediction/reconciliation. Do not introduce these ahead of demonstrated need. A cross-room persistent world would require a new design rather than treating ephemeral state as durable storage.

## Deferred combat and respawning — design only

**First combat mode:** opt-in bumper/paint-tag arena, separate from friendly free-roam. No weapons active in baseline. Add a room ruleset chosen before joining; do not let one client change a live room's consent model. Primary fire gets both mouse/keyboard and a touch button.

**Authority:** extend client protocol with `fire` intent containing a bounded sequence and aim direction, never target ID/damage/hit claims. Server derives muzzle from entity pose, enforces cooldown/ammunition, simulates projectile lifetime, resolves collision against shared geometry, and broadcasts authoritative shot/hit events with stable IDs. Version the protocol. Visual projectiles/muzzle flashes consume events; they cannot deal damage. A basic bounded projectile simulation is simpler than rewind lag compensation for a first arcade mode.

**Damage:** shared entity condition remains the resource. Add explicit active/disabled state and per-mode damage policy. Decide friendly fire in the room ruleset. Spawn/charger safe zones prevent camping; disabled players retain menu/camera access. No paid advantage.

**Respawn:** after a short visible countdown, server chooses an unoccupied safe spawn, resets vehicle resources, grants brief server-timed invulnerability, and emits a respawn event. Clients never teleport/reset resources on their own. Tests must cover duplicate fire, cooldown, forged hits, projectile expiry, disconnect mid-shot, spawn occupancy and invulnerability expiry. Keep existing unstuck recovery separate and prevent it from evading active combat.

**Persistence:** none required for this feature. Add cosmetic/session score first; accounts and permanent progression need a separate product decision.

## Next improvements in order

1. Human playtest on a real iPhone and Android: steering, jump/flip/hover reachability, heat and frame rate.
2. Vehicle feel: tune camera, air time, collisions and refill loop from playtests.
3. Improve district art while preserving registry model pivots and collision volumes.
4. Playful destinations: shared stunt rings, short time trials, small ramps using authoritative terrain geometry.
5. Only then opt-in combat/respawning or progression.

Avoid adding inventories, persistent currencies, matchmaking services, chat moderation burdens or a broad asset pipeline before the delivery and driving loops are satisfying.

## Poly AV fleet layer

26 researched vehicle/platform families: 11 Tesla, 9 Waymo, 4 Cruise, 2 Zoox. Catalog scope includes historical and announced designs; trims and unnamed internal chassis are not extra models. See FLEET_RESEARCH.md for every source and uncertainty.

The new loop is drive → see an interesting AV → exit → take it → feel its weight/turning radius → enable AV and watch it cruise → manually take over. Fleet selection removes the need to hunt for a specific car when testing. All model families can drive themselves in the game regardless of real-world autonomy capability. Wheel-less robotaxis receive fictional manual controls.

Traffic follows deterministic city and Bay loops with speed-dependent following gaps. A bridge-approach meter produces a red-light queue and releases it on green; a periodic unattended highway car can slow to a stop with flashing hazards and clear its queue afterward. A 48-minute day changes lighting and gradually changes the bounded ambient traffic population; physics and signal timing remain in real simulation seconds. Traffic has no perception ML, pedestrian rules, lane changing, route destination planner or complex blockage recovery; persistently obstructed NPCs wait. Player AV engagement off supported streets is rejected. Ordinary manual input cancels AV immediately. Only the fictional next-generation Roadster retains air thrusters; other vehicles carry no flight capability.

The affectionate SF wordplay is “See other vehicles,” “Many rides. Zero commitment,” and “Open relationships. Open roads.” Keep jokes about car choice and low polygon counts rather than mocking people's relationships.
