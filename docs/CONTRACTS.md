# Implementation contracts · v14

These contracts are the handoff for other coding agents. The lead integrator owns changes to shared schemas, physics, transport and deployment. A visual/UI task must not silently modify them. They describe the current implementation, not speculative infrastructure.

## Ownership and dependency direction

| Lane | Owns | May depend on | Must not change incidentally |
|---|---|---|---|
| Gameplay | `shared/game.ts`, `delivery.ts`, `police.ts`, `achievements.ts`, `physics.ts`, `traffic.ts`, `ferry.ts`, `rocket.ts`, `island-stunts.ts`, `dome*.ts`, `soccer.ts`, `parking*.ts`, `race*.ts`, simulation tests | Shared map and registry | Renderer, DOM, transport |
| Network | `worker/*`, integration tests, Wrangler | Shared schemas | Client-supplied authority or physics |
| UI/input | `src/main.ts`, `style.css`, `controls.ts` | Session and read-only shared state | State fields or network shapes |
| Visuals/assets | `src/scene.ts`, `bay-world.ts`, `vehicles.ts`, future `public/assets/` | Shared world and asset contract | Hitboxes, station positions, simulation |
| Data/map | `shared/map.ts`, `stations.ts`, `vehicles.ts` | Documented primary sources | Live fetching at render time |

Dependency flow: UI/input → session → authoritative simulation; snapshots → presentation. Presentation never writes the authoritative world. Solo and server use exactly the same simulation; solo is an explicit menu choice, never a silent network-failure fallback.

## Coordinates and time

- Right-handed world, meters and seconds. X east/right, Y up, Z south; forward is **−Z**.
- Entity `x,y,z` is its support-center pivot, not mesh center. `y` is absolute world altitude; do not infer grounded state from altitude. `supportId` identifies ground, overpass, stunt ramp, stunt loop, island bank, island cliff, dome, ferry, roof or null while airborne. Loop and cliff support require `loopAngle`, and dome support requires `domeS`, because x/z alone cannot identify their heights; the ferry is a moving support.
- `yaw`, `pitch` and `roll` are radians; pitch is rotation around local X and roll around local Z. Positive yaw turns left: forward vector `(-sin(yaw),0,-cos(yaw))`. Positive steer means left.
- `speed` is signed forward meters/second; UI converts to km/h by multiplying 3.6. `vx`, `vy` and `vz` are world velocities; pitchRate, yawRate and rollRate are angular rates. Air/health are bounded 0–100.
- Shared simulation uses fixed 0.05-second outer steps, subdivided when needed for fast motion. `World.time` is simulation seconds, not epoch time. Never use render delta directly for physics. `dayMinute(World.time)` derives a fictional 48-minute day; do not accelerate physics, following gaps or signals with it.
- `shared/map.ts` owns bounds, land polygons, roads, bridge decks, surface heights/normals, Oakland stunt and dome geometry and `BUILDINGS`; `shared/island-stunts.ts` owns the bank and cliff geometry and contact functions. See [MAP.md](MAP.md). `isSurface()` identifies ground coverage; shared support data distinguishes stacked surfaces. Water is rendered at Y=−4; unsupported water landings return a car to a checked free spawn. Avoid visual obstacles in roads without shared collision. Charger posts, trees, bridge furniture and distant hills are decorative.

## World schema

Source of truth is exported TypeScript in `shared/game.ts`:

- `Entity`: id, kind (`VehicleId | person`, 26 vehicle families in `shared/vehicles.ts`), x/y/z, yaw/pitch/roll, vx/vy/vz, angular rates, speed, health/air, `rocketUntil`, per-vehicle `upgrades`, stunt count, arc attachment, `inDome`, `domeReturn`, `domeS`, support identity and authoritative thruster-effect bitmask, driver (player ID or null), owner, pushX/pushZ (lateral velocity), steering, npc/autopilot, routeId/waypoint/pauseUntil; police cars additionally have `police` pursuit state.
- `Player`: id, display name, entityId, `delivery` (session cash, active time, order, completed runs and ticket state), `achievements` (unlocked session awards and server-owned flight tracking), and `cockpit` (self-reported camera selection and accumulated run statistics). Each player controls exactly one entity; each vehicle has at most one driver.
- `Pickup`: id, x/z, kind (`repair|air|rocket`), active, optional readyAt (simulation seconds).
- `World`: entities, players, pickups, ferry, parking rounds, race rounds, time and authoritative `soccer` (ball position/velocity, scores and goal/win phase). Station/building, parking-lot, course and island surface definitions are static versioned data, not repeated in snapshots.
- `Input`: throttle/steer/roll are finite numbers in [−1,1]; boost/hover/brake/cockpit are booleans. `cockpit` is a client claim, never an authoritative proof of view. Jump and flip are bounded integer press counters; the simulation consumes changed counters once, including when a tap is shorter than an input frame. Complete input frames replace previous intent.

Use the functions `createWorld`, `addPlayer`, `removePlayer`, `step`, `interact`, `resetPlayer`, `chooseVehicle`, `toggleAutopilot`, `travelDome`, `buyUpgrade`. Gameplay must not trust UI validation. Keep identity/ownership changes inside simulation functions. Iteration is deterministic for the same initial world, step sequence and inputs; UUID generation belongs to the server, not physics.

## Wire protocol v14

Connect same-origin WebSocket `GET /api/room/{slug}`. Slug starts with a lowercase alphanumeric, followed by up to31 lowercase alphanumerics/hyphens. Health: `GET /api/health` returns `{ok:true,version:14,capacity:number}`.

Client messages:

```json
{"type":"input","input":{"throttle":1,"steer":0,"roll":0,"boost":false,"hover":false,"brake":false,"jump":1,"flip":0,"cockpit":true}}
{"type":"interact"}
{"type":"reset"}
{"type":"autopilot"}
{"type":"dome"}
{"type":"selectVehicle","kind":"model-3"}
{"type":"upgrade","upgrade":"rocket","requestId":1}
{"type":"name","name":"Driver"}
{"type":"parking","action":"park"}
{"type":"parking","action":"queue"}
{"type":"parking","action":"start"}
{"type":"parking","action":"leave"}
{"type":"race","action":"join","courseId":"short"}
{"type":"race","action":"start","courseId":"oval"}
{"type":"race","action":"leave","courseId":"short"}
```

Server messages:

```text
{type:"welcome", id:string, version:14, capacity:number}
{type:"state", world:World}
{type:"upgradeResult", requestId:number, upgrade:UpgradeId, ok:boolean}
```

Welcome precedes the initial snapshot. Physics runs at20Hz, snapshots at10Hz. Each snapshot retains all players, occupied vehicles and ferry-supported entities plus ambient entities within 1,400 m of the recipient; distant ambient entities may appear/disappear as the recipient moves. Ferry, parking and race state are authoritative. Static map and simulation are shared. Input sends at20Hz. Client interpolates rendering only; no prediction/reconciliation yet. Client closes/reports incompatible protocol versions. Wire changes require coordinated client/server updates, version bump when incompatible, and integration tests. Do not add compatibility shims for this prototype.

Limits: text-only messages ≤1024 characters, ≤90 messages/client/second, action cooldown400ms, names trimmed/control characters stripped/24-character max. Invalid input closes1008; oversized/binary closes1009; inactive30seconds closes1001. Movement intent expires300ms after last input. Missing/malformed room route404, missing upgrade426, cross-origin browser upgrade403, room full503. Missing Origin is permitted for public nonbrowser clients; Origin checks are not authentication.

Upgrade requests carry a positive safe-integer request ID, echoed only to the requester with the server's success or rejection, including cooldown rejection. The UI must wait for the matching result and show timeouts without claiming success. Solo mode returns the same result from the shared simulation.

Capacity: `MAX_PLAYERS`, default64, clamped2–128. One named Durable Object per room. Shared room state is memory-only. Start timer with first connection; stop and reset when empty. No persistent promise of garages/accounts. Do not replace with a global room object or client-authoritative coordinates.

## Client adapters

`Session` owns `world`, `id`, `status` (`solo|connecting|online|disconnected`), `capacity`, `error`; commands `solo(kind?)`, `join(room,name,kind?)`, `tick(dt,input)`, `action('interact'|'reset'|'autopilot'|'dome')`, `selectVehicle(kind)`, `buyUpgrade(upgrade)`, `parkingAction`, `raceAction`, `disconnect()`. UI can replace presentation but must preserve explicit connection/error/rejoin/solo paths. Never display stale multiplayer as live. Server stalls exceeding6seconds close the connection; initial connection times out after10seconds.

`Controls.read()` returns a complete input. On blur/hidden/menu, clear keys and pointers. Multitouch uses pointer IDs and capture; release on pointerup/cancel/lost capture. Avoid stuck acceleration. Every keyboard action needs a touch equivalent. UI dialogs must neutralize controls while preserving connection heartbeats.

`GameScene.render(world,playerId,dt,menu)` reads snapshots. `start(callback)` runs render frames. `cycleCamera()` cycles chase, cockpit and wide views. Cockpit follows the interpolated vehicle orientation (including pitch and roll); the player's exterior mesh is hidden locally. On foot the selected cockpit mode renders as chase and is not counted as cockpit. The projected destination sign and dashboard are local to the player; the physical objective ring and authoritative target remain shared. Camera, smoothing, labels and effects are local presentation; never modify physical coordinates to make visuals easier.

The client sets `Input.cockpit` only when cockpit is selected in a vehicle, gameplay is showing, and the tab is visible and focused; informational dialogs keep the selected view. The simulation ignores the claim on foot, tracks `Player.cockpit.active` and adds only delivery-active seconds to `activeSeconds`. A completed delivery increments `deliveries` only when all its active pickup and delivery time was reported in cockpit and at least one active cockpit step occurred for that order. Island, ferry and dome time pauses the order and does not affect its cockpit eligibility or order seconds, while global cockpit active time still accrues when the player is active in cockpit. `orderEligible` and `orderSeconds` are per-order simulation bookkeeping; a new order resets them. Stale inputs become neutral, so missing input during an active interval can disqualify the run. The room validates the flag's type, not the camera: these are self-reported session stats, not anti-cheat proof or a cash multiplier. Other UI/asset agents must preserve the claim, these distinctions, and visible labels.

## Audio presentation

`GameAudio` and `SoundEventTracker` in `src/audio*.ts` consume read-only world snapshots and user preferences. Cue names, mix buses, gesture-based startup, background suspension and event-inference limitations are documented in [AUDIO.md](AUDIO.md). Audio is client-side presentation: it must not mutate simulation, add client authority, duplicate cues on a repeated snapshot, or require any sound to understand gameplay. A replacement sound or UI layer retains separate master, music and effects controls and desktop/touch access.

## UI continuity and acceptance

Keep brand/menu access in menu, game, joining and error states. Fullscreen/pointer lock must have a visible exit if introduced. Room invite links retain room slug and require explicit join. Names must enter DOM through `textContent`, never HTML interpolation. Support 390×844 portrait and 844×390 landscape plus desktop; gameplay and toolbar actions must remain visible without scrolling. Menu may scroll. Touch targets ≥44px where practical; no hover-only actions. Canvas needs accessible labeling; all interactive controls must have names, focus indication, and keyboard operation.

## Required handoff from every contributor

1. State owned files and intended contract changes before editing shared files.
2. Keep a playable end-to-end baseline; do not leave the default route on a mock or asset gallery.
3. Run `pnpm test` and `pnpm build`; network changes also run live two-client integration.
4. Visual/input changes: inspect desktop and portrait/landscape phone layouts, drive/jump/land, and switch cars. Record actual browser/device used; emulation is not physical-device evidence.
5. List assets, provenance/licenses, budgets and known gaps. No unlicensed GTA assets or unexplained remote dependencies.
6. Provide a small concrete diff and verification result. Do not change deployment names, domains, accounts or shared contracts as part of an art/UI task.

## Fleet and autonomy contract

`shared/vehicles.ts` defines all model identities, dimensions, wheelbase, mass, steering, acceleration, braking, stock capabilities and provenance. Renderer consumes the same IDs and dimensions. Numbers marked estimates remain estimates; never silently promote them to manufacturer specifications. All handling is arcade tuning. The `roadster` has permanent fictional Rocket capability; a Rocket pad grants the current driven vehicle those capabilities for 90 simulation seconds and fills its tank, with a 20-second pad cooldown. `rocketUntil` belongs to the entity and never mutates the registry or transfers to another vehicle. A purchased shop kit is permanent for that vehicle during the room session. Air jumps, free-air thruster hover, adhesion and tank performance are game fiction. Suction operates only on supported stunt surfaces.

Collision bodies are oriented rectangles using registry length/width; mass-weighted impulse response includes lateral velocity. Bicycle steering uses wheelbase and bounded steering angle; Cybertruck/Zoox have enhanced low-speed steering and visually countersteering rear wheels. A grounded player car moving forward can initiate an arcade drift by steering with brake or reverse; lateral momentum decays after release. This is not suspension/tire simulation. Terrain roof support remains shared.

Every model has one parked entity and one NPC traffic entity. `npc` is identity; `autopilot` is current control mode. NPCs have null `driver`, so on-foot players may take them; taking one disables autonomy and stops it. Human-occupied vehicles cannot be taken. Exiting/disconnecting releases an NPC back to street autonomy after a pause when it can attach to a route. Other empty vehicles remain parked unless explicitly enabled.

Autonomy uses deterministic right-lane loops, including both directions around the Bay, speed-dependent following gaps and a timed eastbound Bay Bridge approach signal. Traffic demand follows the accelerated day, while the signal and driving behavior use real simulation seconds. Engage only on ground within 9 m of a supported street route. A player's throttle/steer/brake/jump/flip/boost/hover/roll input immediately cancels AV mode. The server owns route state and motion; renderers never advance traffic. No real AV/vehicle API is used. Mode is available for every model as game fiction, including historical prototypes.

Ambient demand targets up to 34 unattended autonomous highway cars alongside the 26 catalog NPCs and four police. Taken cars, off-route abandoned cars and cars reattached to city routes do not count toward that target; the optional ambient pool is capped at 68 in total, so replenishment can be delayed when its reserve is full. At most one ambient car is added or removed every five simulation seconds. Removal is beyond 1,600 m from every player and preserves occupied and stopped autonomous cars; hidden off-route abandoned cars and free-flowing city-route cars may be reclaimed when the pool blocks replenishment. Available hidden spawn sites and safe removal conditions also limit how quickly traffic follows demand.

Fleet selection accepts only Tesla IDs and requires supported speed≤1 m/s and is unavailable on the ferry or while attached to an arc. It releases the old vehicle, creates the requested player-owned model at a checked free spawn, and removes abandoned personal duplicates. IDs are strict allowlisted own registry properties (not `in` checks susceptible to prototype names). No client-supplied mass, coordinates or damage. Names bypass the action cooldown but remain rate-limited so startup selection isn't lost behind a name message. Protocol version constant is `PROTOCOL_VERSION` in shared/game.ts; incompatible clients explicitly reload.

Geometry/materials in the renderer are shared static caches. Removing an entity must NOT dispose shared geometry. Wheel assemblies are named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`; yaw articulation uses shared steering state. `jets` contains independent rear, corner and side cold-gas vapor groups, instantiated for other models when upgraded. The simulation publishes a thruster bitmask so remote effects follow actual boost, jump, hover and roll events; firing patterns are arcade interpretations, not prototype control logic. Future models must pass catalog coverage, body collision, takeover, traffic-stability and multiplayer-selection tests.

## Island, ferry and activities

`shared/ferry.ts` owns the moving deck, phase, velocity, countdown and passenger offsets. Boarding is limited to a stationary docked ferry; departure requires each passenger to be fully on deck and stopped, with at most six vehicles. During a crossing attached passengers retain their deck-local positions and movement/exit controls are disabled. On arrival they can disembark, then remaining passengers are placed at a collision-checked local apron; a blocked apron holds the ferry. Reset uses a checked shore spawn. Do not present an animated or teleported object as the ferry's authoritative support.

Dock signs show the current status, countdown and vehicle occupancy from snapshots. The deck has painted walking lanes and gates that open visually at the corresponding dock; these markings and gates do not provide collision geometry. A nearby player hears a synthesized horn cue on a departure or arrival phase change. These are presentation cues; the simulation owns boarding, departure and passenger safety.

`shared/island-stunts.ts` defines a bank with tapered ground transitions and a separate parametric inverted cliff. Meshes and physics use the same vertices. Cliff attachment retains a local angle; Rocket-capable cars can adhere beyond vertical and ordinary cars detach or bounce. Airborne crossings use swept contacts and detachments preserve world velocity. Island and ferry support clear police pursuits and prevent detection; the current order timer pauses there while active-play time retains its normal rules. Previous tickets remain charged.

`shared/parking-lots.ts` defines two playgrounds and four Supercharger lots; `parking.ts` owns their bounded rounds. `shared/stations.ts` defines the four marked stalls at each charger; stopped ground vehicles refill fictional air within those bays. Park It checks the driven car's actual footprint, heading and speed in its assigned stall for two seconds. Cut the queue orders entrants, awards at most one claimant per stall, and tracks overtakes. `shared/race-courses.ts` and `race.ts` define the short course and oval, bounded lobbies, ordered directional swept gates and authoritative timing. Players remain physical and can collide. Actions are requests; clients cannot award a result or declare a checkpoint. All activity state is ephemeral, and simulation seconds govern timers.

## Shops and upgrades contract

`shared/upgrades.ts` owns fictional shop positions, range, upgrade IDs, prices and eligibility. Stop in a ground-level purple bay before sending `upgrade` with one of `rocket|economy|motor|armor|service`. `buyUpgrade` independently validates driver, location, motion, cash, prerequisites and duplicates, and deducts the player’s session cash. The rocket kit grants any vehicle the flight controls and a full tank; economy reduces flight air use by 25%, motor changes acceleration and road speed, armor halves impact damage, and service repairs/refills. Shop state belongs to each vehicle, not the player; an old personal car is removed on fleet selection and abandoned ambient traffic may be reclaimed. A room reset loses all upgrades and money. Purple rocket pickups grant temporary flight for 90 simulation seconds and respawn in 20 seconds. Shared simulation and room snapshots own all state; the UI and renderer must not apply purchases themselves. See [UPGRADES.md](UPGRADES.md).

## Delivery and police contract

`shared/delivery.ts` owns restaurant and fictional customer identities, artistic coordinates, order selection, active time and payment. Each player has an independent `delivery` state in snapshots. A grounded player within 9 m moving no faster than 4 m/s automatically picks up or delivers; no client message claims a payment. Pickup has its own active-time estimate based on distance from where the order began; reaching the restaurant early pays up to 40% of base fare immediately. The delivery estimate begins at pickup and counts active play. Active time includes control input plus a 3-second grace period, and a moving player AV. When idle, the pickup and delivery estimates and leaderboard clock pause. `lastReward` contains the most recent positive pickup or delivery award with a monotonically increasing per-player ID; a renderer may celebrate each new ID once, but cannot create payouts. Base fare depends on straight-line distance; completing early adds up to 75% of base, and lateness reduces fare to a floor of zero. See [DELIVERY.md](DELIVERY.md) for details and provenance.

Four police NPCs patrol the shared world. A cop seeing a car between 3 m and 80 m above ground within 85 m starts pursuing the player; a parked car on a roof is not flying. Pursuit ends after 10 simulated seconds outside 110 m, when the player is ticketed, or when the player enters the protected island/ferry area or dome. When grounded and within 12 m, the car is slowed; within 7 m and below 4 m/s it receives a severity- and repeat-offense-based citation, followed by 20 seconds without re-detection. Police are not stealable. All detection, movement and cash changes are authoritative in the shared fixed-step simulation. Police pathfinding uses the compressed street grid; it is deliberately approximate.

`L` / Scores shows the current room's active players ranked by cash with active time and cash per active minute. Scores disappear on disconnect/reset; there is no persistent identity or global leaderboard. Local solo uses the same state. Neither clock nor leaderboard is a verified anti-cheat measure: room inputs are authoritative but anonymous clients can automate them.

## Rocket Dome soccer

`shared/dome.ts` defines the fictional Alcatraz arena connected by land to Rocket Island; `shared/map.ts` supplies its capsule surface and support basis. `travelDome` moves one player and current vehicle or person between the arena and a checked Bay or island spawn based on the player’s origin, preserving health and air. A vehicle arriving from the Alcatraz land or air joins in place once its upright body fits inside the capsule; the exterior shell is passable on entry, while the interior contains cars. Above-roof overflights remain outside. The arena is enclosed, has no police detection or citations, and pauses the current delivery order clock while leaving the active-play clock intact.

`shared/soccer.ts` owns the one room-wide ball and colored scores. Any car can hit either goal; there are no player teams. Crossing a colored goal awards that color a point, freezes the ball for three simulation seconds, then returns it to center. The first side to five wins; after a six-second winner display, both scores and the ball reset. Physics, scoring and timing are authoritative in solo and online rooms; clients render snapshots and never send ball positions, goals or score claims. A new or empty room starts a new match.


## Citations, rooftops and achievements

`shared/police.ts` measures airborne duration and peak height in the authoritative simulation. When a pursuit ends in a citation, `delivery.lastTicket` records the amount, offense number, flight duration, height and the duration, height and repeat components. The total is deducted immediately, once, with a grace period. Presentation must make a citation conspicuous and require an accessible acknowledgement; clearing controls does not stop server heartbeats. A room continues running while a dialog is open. Session-local UI may not create tickets or alter their amount.

Rooftop customers in `shared/delivery.ts` select actual flat `BUILDINGS` from `shared/map.ts`; the objective marker uses their shared height. A rooftop dropoff requires the car to land and stop within 6 m of the roof center. The next order is eligible for a rooftop after every third completed run starting with the first, only when the current vehicle has stock flight capability. Other vehicles receive ground orders, including temporarily upgraded vehicles. The player may change cars later, so the interface must identify rooftop orders and the fleet remains available.

`shared/achievements.ts` owns unlocked award IDs and flight tracking per player in snapshots. Bay Hopper requires leaving one mainland shore, crossing water, and arriving on the other without landing; a bridge, island, roof or stunt-loop contact ends the attempt, and recovery or vehicle switches cancel it. Flying above a bridge is allowed. Roof Rider requires a car on a building roof; Sky Delivery requires a completed rooftop delivery; Neighborhood Regular requires three deliveries. Awards are ephemeral and do not affect cash. Clients can render progress and sequence notifications but cannot assert unlocks.
