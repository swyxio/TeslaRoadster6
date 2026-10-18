# Game design · simple fun first

## Product decisions

Approved: stylized compressed Bay Area; driving/stunts first; real Tesla Supercharger identities with fictional compressed-air refills; shared public rooms with more than16 capacity; desktop AND phone. Defer shooting and death/respawning but reserve a concrete design. The visual baseline is original low-poly geometry, not a requirement that later art must remain low-poly.

## Thirty-second loop

Join → start seated in a Roadster → accelerate → lift above a block → roll → land → find a charger → do it again with a friend. No account, tutorial wall, garage purchase, grind, or mandatory mission. Every participant starts with a usable vehicle and100 air. Nearby parked coupe/truck/Roadster vehicles can be taken once empty. Occupied cars cannot be stolen in v1.

The simulation prioritizes arcade legibility over realism. Ground friction slows an unattended car. Roadster air is a shared boost/lift budget. Space/Lift holds thrust; releasing it allows gravity to land the car. Q/E/touch rolls provide stunts with automatic ground stabilization. A depleted air tank never prevents ordinary driving. Station refills take about3.6seconds from empty, only when grounded and stopped within9m. Pickups provide instant full air or repair with20second respawn. Condition is clamped to5 rather than introducing death before its design exists.

## Current content

480×480m grid with flat streets, collidable buildings/rooftops, Golden Gate-inspired bridge silhouette, water and distant hills; not a geographic reconstruction. SF, East Bay and Peninsula are compressed districts. Decorative bridge currently overlays the northern road, not a separate elevated or cross-water physics surface. Four primary-source station identities; all in-game placements are artistic coordinates. Air refilling is fictional, as is the flight handling. Chargers do not model electricity or real station service hours.

Controls: steering plus forward/reverse; separate brake. Person movement currently uses the same turn-and-move arcade controls. Exit requires grounded speed≤5m/s; entry selects closest empty car within7m. Unstuck recovery repositions the current entity while preserving condition/air and is not death/respawn.

## Visual direction

Warm coastal daylight, desaturated sea/teal city, cream type, amber player/actions, mint charger markers. Car silhouettes and roadway contrast matter more than texture detail. Vehicle airborne state, remaining air, repair state, nearest station distance and visible other players must remain readable. Keep minimal instruments; do not turn the screen into a dashboard of implementation metrics.

Alternatives can change style, HUD organization and models. Preserve the same gameplay entry points, touch equivalents and state transitions. See ASSETS.md for geometry/attachment budgets. Brand name is Bay Drive; Tesla Roadster is an in-game vehicle identity, with no claim of official affiliation or real flight capability.

## Multiplayer scale

Target is a busy small playground, not a single giant universe. Default64 participants per room; configurable up to provisional128. Multiple independent rooms scale horizontally through Durable Objects. A platform connection limit is not a simulation capacity promise. Initial implementation uses full10Hz snapshots and all-pairs collisions. Increase room limits only after CPU, memory, outbound bytes, snapshot gaps, input-to-observed latency and mobile rendering have been measured.

First scaling step, when measurements justify it: spatial grid for collisions and recipient interest neighborhoods. Next: compact delta snapshots and sequence numbers with prediction/reconciliation. Do not introduce these ahead of demonstrated need. A cross-room persistent world would require a new design rather than treating ephemeral state as durable storage.

## Deferred combat and respawning — design only

**First combat mode:** opt-in bumper/paint-tag arena, separate from friendly free-roam. No weapons active in baseline. Add a room ruleset chosen before joining; do not let one client change a live room's consent model. Primary fire gets both mouse/keyboard and a touch button.

**Authority:** extend client protocol with `fire` intent containing a bounded sequence and aim direction, never target ID/damage/hit claims. Server derives muzzle from entity pose, enforces cooldown/ammunition, simulates projectile lifetime, resolves collision against shared geometry, and broadcasts authoritative shot/hit events with stable IDs. Version the protocol. Visual projectiles/muzzle flashes consume events; they cannot deal damage. A basic bounded projectile simulation is simpler than rewind lag compensation for a first arcade mode.

**Damage:** shared entity condition remains the resource. Add explicit active/disabled state and per-mode damage policy. Decide friendly fire in the room ruleset. Spawn/charger safe zones prevent camping; disabled players retain menu/camera access. No paid advantage.

**Respawn:** after a short visible countdown, server chooses an unoccupied safe spawn, resets vehicle resources, grants brief server-timed invulnerability, and emits a respawn event. Clients never teleport/reset resources on their own. Tests must cover duplicate fire, cooldown, forged hits, projectile expiry, disconnect mid-shot, spawn occupancy and invulnerability expiry. Keep existing unstuck recovery separate and prevent it from evading active combat.

**Persistence:** none required for this feature. Add cosmetic/session score first; accounts and permanent progression need a separate product decision.

## Next improvements in order

1. Human playtest on a real iPhone and Android: steering, lift/roll reachability, heat and frame rate.
2. Vehicle feel: tune camera, air time, collisions and refill loop from playtests.
3. Art pass within existing pivots and collision volumes; better Roadster silhouette and distinct districts.
4. Playful destinations: shared stunt rings, short time trials, small ramps using authoritative terrain geometry.
5. Only then opt-in combat/respawning or progression.

Avoid adding quests, inventories, currencies, matchmaking services, chat moderation burdens or a broad asset pipeline before the driving loop is satisfying.
