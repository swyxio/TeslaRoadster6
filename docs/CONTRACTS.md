# Implementation contracts · v16

These contracts are the handoff for other coding agents. The lead integrator owns changes to shared schemas, physics, transport and deployment. A visual/UI task must not silently modify them. They describe the current implementation, not speculative infrastructure.

## Ownership and dependency direction

| Lane | Owns | May depend on | Must not change incidentally |
|---|---|---|---|
| Gameplay | `shared/game.ts`, `delivery.ts`, `police.ts`, `achievements.ts`, `physics.ts`, `traffic.ts`, simulation tests | `shared/stations.ts` | Renderer, DOM, transport |
| Network | `worker/*`, integration tests, Wrangler | Shared schemas | Client-supplied authority or physics |
| UI/input | `src/main.ts`, `style.css`, `controls.ts` | Session and read-only shared state | State fields or network shapes |
| Visuals/assets | `src/scene.ts`, `bay-world.ts`, `vehicles.ts`, future `public/assets/` | Shared world and asset contract | Hitboxes, station positions, simulation |
| Data/map | `shared/map.ts`, `stations.ts`, `vehicles.ts` | Documented primary sources | Live fetching at render time |

Dependency flow: UI/input → session → authoritative simulation; snapshots → presentation. Presentation never writes the authoritative world. Solo and server use exactly the same simulation; solo is an explicit menu choice, never a silent network-failure fallback.

## Coordinates and time

- Right-handed world, meters and seconds. X east/right, Y up, Z south; forward is **−Z**.
- Entity `x,y,z` is its support-center pivot, not mesh center. `y` is absolute world altitude; do not infer grounded state from altitude. `supportId` identifies ground, overpass, stunt ramp, stunt loop, dome, roof or null while airborne. Loop support requires `loopAngle`; dome support requires `domeS`, because x/z alone cannot identify their height.
- `yaw`, `pitch` and `roll` are radians; pitch is rotation around local X and roll around local Z. Positive yaw turns left: forward vector `(-sin(yaw),0,-cos(yaw))`. Positive steer means left.
- `speed` is signed forward meters/second; UI converts to km/h by multiplying 3.6. `vx`, `vy` and `vz` are world velocities; pitchRate, yawRate and rollRate are angular rates. Air/health are bounded 0–100.
- Shared simulation uses fixed 0.05-second outer steps, subdivided when needed for fast motion. `World.time` is simulation seconds, not epoch time. Never use render delta directly for physics. `dayMinute(World.time)` derives a fictional 48-minute day; do not accelerate physics, following gaps or signals with it.
- `shared/map.ts` owns bounds, land polygons, roads, bridge decks, surface heights/normals, Oakland stunt geometry and `BUILDINGS`; see [MAP.md](MAP.md). `isSurface()` identifies ground coverage; shared support data distinguishes stacked surfaces. Water is rendered at Y=−4; unsupported water landings return a car to a free spawn. Avoid visual obstacles in roads without shared collision. Charger posts, trees, bridge furniture and distant hills are decorative.

## World schema

Source of truth is exported TypeScript in `shared/game.ts`:

- `Entity`: id, kind (`VehicleId | person`, 26 vehicle families in `shared/vehicles.ts`), x/y/z, yaw/pitch/roll, vx/vy/vz, angular rates, speed, health/air (percentage), tankLevel (1–5), stunt count, loop attachment, support identity, dome membership and surface position, authoritative thruster-effect bitmask and per-vehicle `upgrades` (`rocket`, `economy`, `motor`, `armor` booleans), driver (player ID or null), owner, pushX/pushZ (lateral velocity), steering, npc/autopilot, routeId/waypoint/pauseUntil; police cars additionally have `police` pursuit state.
- `Player`: id, display name, entityId, `delivery` (session cash, lifetime session delivery earnings, level, last blocked access attempt, active time, order, completed runs, ticket state and OTA subscription), `achievements` (unlocked session awards and server-owned flight tracking), and `cockpit` (self-reported camera selection and accumulated run statistics). Each player controls exactly one entity; each vehicle has at most one driver.
- `Pickup`: id, x/z, kind (`repair|air|rocket`), active, optional readyAt (simulation seconds).
- `World`: entities, players, pickups, time and authoritative `soccer` (ball position/velocity, both scores and goal/win phase). Station/building definitions are static versioned data, not repeated in snapshots.
- `Input`: throttle/steer/roll are finite numbers in [−1,1]; boost/hover/brake/cockpit are booleans. `cockpit` is a client claim, never an authoritative proof of view. Jump and flip are bounded integer press counters; the simulation consumes changed counters once, including when a tap is shorter than an input frame. Complete input frames replace previous intent.

Use the functions `createWorld`, `addPlayer`, `removePlayer`, `step`, `interact`, `resetPlayer`, `chooseVehicle`, `toggleAutopilot`, `buyUpgrade`, `subscribeOta`. Gameplay must not trust UI validation. Keep identity/ownership changes inside simulation functions. Iteration is deterministic for the same initial world, step sequence and inputs; UUID generation belongs to the server, not physics.

## Wire protocol v16

Connect same-origin WebSocket `GET /api/room/{slug}`. Slug starts with a lowercase alphanumeric, followed by up to31 lowercase alphanumerics/hyphens. Health: `GET /api/health` returns `{ok:true,version:16,capacity:number}`.

Client messages:

```json
{"type":"input","input":{"throttle":1,"steer":0,"roll":0,"boost":false,"hover":false,"brake":false,"jump":1,"flip":0,"cockpit":true}}
{"type":"interact"}
{"type":"reset"}
{"type":"autopilot"}
{"type":"dome"}
{"type":"selectVehicle","kind":"model-3"}
{"type":"upgrade","upgrade":"rocket","requestId":1}
{"type":"ota","enabled":true,"requestId":2}
{"type":"name","name":"Driver"}
```

Server messages:

```text
{type:"welcome", id:string, version:16, capacity:number}
{type:"state", world:World}
{type:"upgradeResult", requestId:number, upgrade:UpgradeId, ok:boolean}
{type:"otaResult", requestId:number, enabled:boolean, ok:boolean}
```

Welcome precedes the initial snapshot. Physics runs at20Hz, snapshots at10Hz. Each snapshot retains all players and occupied vehicles plus ambient entities within 1,400 m of the recipient; distant ambient entities may appear/disappear as the recipient moves. Static map and simulation are shared and the room remains authoritative. Input sends at20Hz. Client interpolates rendering only; no prediction/reconciliation yet. Client closes/reports incompatible protocol versions. Wire changes require coordinated client/server updates, version bump when incompatible, and integration tests. Do not add compatibility shims for this prototype.

Limits: text-only messages ≤1024 characters, ≤90 messages/client/second, action cooldown400ms. Names follow the normalization and active-name collision policy described below. Invalid input closes1008; oversized/binary closes1009; inactive30seconds closes1001. Movement intent expires300ms after last input. Missing/malformed room route404, missing upgrade426, cross-origin browser upgrade403, room full503. Missing Origin is permitted for public nonbrowser clients; Origin checks are not authentication.

Upgrade and OTA requests carry a positive safe-integer request ID, echoed only to the requester with the server's success or rejection, including cooldown rejection. The UI must wait for the matching result and show timeouts without claiming success. Solo mode returns the same result from the shared simulation. OTA subscription state and billing use authoritative game time and delivery cash; remote purchases require an active subscription and a driven vehicle, while physical shops remain available without it.

Capacity: `MAX_PLAYERS`, default64, clamped2–128. One named Durable Object per room. Shared room state is memory-only. Start timer with first connection; stop and reset when empty. No persistent promise of garages or game progress. Do not replace with a global room object or client-authoritative coordinates.

## Global chat and saved identities

Same-origin WebSocket `GET /api/chat` connects to a single global chat Durable Object, independent of game rooms and available in solo. The chat client sends `{type:"hello",name:string,code?:string}` first, then `{type:"message",text:string}`, `{type:"save"}`, or a `{type:"ping"}` heartbeat. The server answers `{type:"ready",playerId,name,messages}`, broadcasts `{type:"message",message:{id,playerId,name,text,time}}`, and privately returns `{type:"recovery",code}` for a successful save or `{type:"error",message}` when a request fails. An active saved identity is reported with `code:"identity_active"`; the client retries briefly before requiring action. Heartbeats receive no reply. It derives author IDs and names from the connection, not from message fields.

Names are NFKC-normalized, stripped of control and invisible direction/format characters, whitespace-collapsed and capped at 20 Unicode code points; an empty name becomes `Driver`. Active names are compared case-insensitively. A conflict adds the first available ` #2`, ` #3`, and so on, trimming the base if needed. Names are not reserved when disconnected. Game rooms use the same rule independently, so a room display name can differ from the global chat name. Room labels are self-asserted: they are not proof of a saved chat identity. The full server-issued UUID identifies a chat sender; a short on-screen prefix is for convenience and is not guaranteed unique.

An unsaved identity lasts for the connection. Saving generates a random 256-bit bearer secret; the code contains the public player UUID and secret. Only the SHA-256 verifier and saved name are stored in the chat object's durable storage. Saving again returns the same code, including after a successful recovery. A valid code restores the chat ID and saved name, subject to the active-name collision rule; a second simultaneous connection using the same identity is rejected. Anyone with a code can use that identity, so it is shown only to its owner and must never appear in URLs, broadcasts, history or logs. Losing the code loses access to the saved identity. This restores neither the room session nor cars, cash, achievements or game progress.

Chat messages are normalized and limited to 240 Unicode code points. The server accepts at most five messages per connection per 10 seconds and limits all chat requests. The in-memory hub permits at most 512 sockets, 24 simultaneous sockets and 60 connections per IP per minute, and 30 new saved identities per IP and 240 globally per hour; missing IPs share an unknown bucket. Connections inactive for three minutes are closed; the client sends a heartbeat every 25 seconds. These limits reset on object restart and are modest abuse brakes, not a capacity measurement or comprehensive moderation. At most 50 recent messages are kept in memory and supplied on join; a runtime restart clears them. Chat sockets currently keep the object awake while connected. Reconnect and failure states must remain visible; chat failure must not silently change solo or room play. Render names and messages as text, never interpolated HTML.

## Client adapters

`Session` owns `world`, `id`, `status` (`solo|connecting|online|disconnected`), `capacity`, `error`; commands `solo(kind?)`, `join(room,name,kind?)`, `tick(dt,input)`, `action('interact'|'reset'|'autopilot'|'dome')`, `selectVehicle(kind)`, `buyUpgrade(upgrade)`, `setOta(enabled)`, `disconnect()`. UI can replace presentation but must preserve explicit connection/error/rejoin/solo paths. Never display stale multiplayer as live. Server stalls exceeding6seconds close the connection; initial connection times out after10seconds.

`Controls.read()` returns a complete input. On blur/hidden/menu, clear keys and pointers. Multitouch uses pointer IDs and capture; release on pointerup/cancel/lost capture. Avoid stuck acceleration. Every keyboard action needs a touch equivalent. UI dialogs must neutralize controls while preserving connection heartbeats.

`GameScene.render(world,playerId,dt,menu)` reads snapshots. `start(callback)` runs render frames. `cycleCamera()` cycles chase, cockpit and wide views. Cockpit follows the interpolated vehicle orientation (including pitch and roll); the player's exterior mesh is hidden locally. On foot the selected cockpit mode renders as chase and is not counted as cockpit. The projected destination sign and dashboard are local to the player; the physical objective ring and authoritative target remain shared. Camera, smoothing, labels and effects are local presentation; never modify physical coordinates to make visuals easier.

The client sets `Input.cockpit` only when cockpit is selected in a vehicle, gameplay is showing, and the tab is visible and focused; informational dialogs keep the selected view. The simulation ignores the claim on foot, tracks `Player.cockpit.active` and adds only delivery-active seconds to `activeSeconds`. A completed delivery increments `deliveries` only when all its active pickup and delivery time was reported in cockpit and at least one active cockpit step occurred. `orderEligible` and `orderSeconds` are per-order simulation bookkeeping; a new order resets them. Stale inputs become neutral, so missing input during an active interval can disqualify the run. The room validates the flag's type, not the camera: these are self-reported session stats, not anti-cheat proof or a cash multiplier. Other UI/asset agents must preserve the claim, these distinctions, and visible labels.

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

`shared/vehicles.ts` defines all model identities, dimensions, wheelbase, mass, steering, acceleration, braking, capabilities and provenance. Renderer consumes the same IDs and dimensions. Numbers marked estimates remain estimates; never silently promote them to manufacturer specifications. All handling is arcade tuning. The `roadster` Rocket has native arcade thrust. Every vehicle can gain flight from a rocket pickup or shop kit; rocket-equipped vehicles can also use the stunt loop’s fictional suction. Air jumps, free-air thruster hover and tank performance are game fiction. Suction operates at the physical loop and dome surfaces.

Collision bodies are oriented rectangles using registry length/width; mass-weighted impulse response includes lateral velocity. Bicycle steering uses wheelbase and bounded steering angle; Cybertruck/Zoox have enhanced low-speed steering and visually countersteering rear wheels. A grounded player car moving forward can initiate an arcade drift by steering with brake or reverse; lateral momentum decays after release. This is not suspension/tire simulation. Terrain roof support remains shared.

Every model has one parked entity and one NPC traffic entity. `npc` is identity; `autopilot` is current control mode. NPCs have null `driver`, so on-foot players may take them; taking one disables autonomy and stops it. Human-occupied vehicles cannot be taken. Exiting/disconnecting releases an NPC back to street autonomy after a pause when it can attach to a route. Other empty vehicles remain parked unless explicitly enabled.

Autonomy uses deterministic right-lane loops, including both directions around the Bay, speed-dependent following gaps and a timed eastbound Bay Bridge approach signal. Traffic demand follows the accelerated day, while the signal and driving behavior use real simulation seconds. Engage only on ground within 9 m of a supported street route. A player's throttle/steer/brake/jump/flip/boost/hover/roll input immediately cancels AV mode. The server owns route state and motion; renderers never advance traffic. No real AV/vehicle API is used. Mode is available for every model as game fiction, including historical prototypes.

Ambient demand targets up to 34 unattended autonomous highway cars alongside the 26 catalog NPCs and four police. Taken cars, off-route abandoned cars and cars reattached to city routes do not count toward that target; the optional ambient pool is capped at 68 in total, so replenishment can be delayed when its reserve is full. At most one ambient car is added or removed every five simulation seconds. Removal is beyond 1,600 m from every player and preserves occupied and stopped autonomous cars; hidden off-route abandoned cars and free-flowing city-route cars may be reclaimed when the pool blocks replenishment. Available hidden spawn sites and safe removal conditions also limit how quickly traffic follows demand.

Fleet selection accepts only Tesla IDs and requires grounded speed≤1 m/s; non-Tesla models remain drivable through street takeover. It releases the old vehicle, creates the requested player-owned model at a free spawn, and removes abandoned personal duplicates. IDs are strict allowlisted own registry properties (not `in` checks susceptible to prototype names). No client-supplied mass, coordinates or damage. Names bypass the action cooldown but remain rate-limited so startup selection isn't lost behind a name message. Protocol version constant is `PROTOCOL_VERSION` in shared/game.ts; incompatible clients explicitly reload.

Geometry/materials in the renderer are shared static caches. Removing an entity must NOT dispose shared geometry. Wheel assemblies are named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`; yaw articulation uses shared steering state. `jets` contains independent rear, corner and side cold-gas vapor groups. `addRocketKit(root,kind)` adds visible retrofit hardware and plumes for a non-native rocket kit without changing shared collision bodies. The simulation publishes a thruster bitmask so remote effects follow actual boost, jump, hover and roll events; firing patterns are arcade interpretations, not prototype control logic. Future models must pass catalog coverage, body collision, takeover, traffic-stability and multiplayer-selection tests.

## Shops and upgrades contract

`shared/upgrades.ts` owns fictional shop positions, range, upgrade IDs, prices and eligibility. Stop in a ground-level purple bay before sending `upgrade` with one of `rocket|economy|tank|motor|armor|service`. `buyUpgrade` independently validates driver, location, motion, cash, prerequisites and duplicates, and deducts the player’s session cash. The rocket kit grants any vehicle the flight controls and a full tank; economy reduces flight air use by 25%; tank upgrades double capacity, refill, and cost $30/$60/$120/$240 to reach levels 2/3/4/5; motor changes acceleration and road speed, armor halves impact damage, and service repairs/refills. Shop state belongs to each vehicle, not the player; an old personal car is removed on fleet selection and abandoned ambient traffic may be reclaimed. A room reset loses all upgrades and money. Purple rocket pickups grant a kit without payment and respawn in 20 seconds. Shared simulation and room snapshots own all state; the UI and renderer must not apply purchases themselves. See [UPGRADES.md](UPGRADES.md).

## Delivery and police contract

`shared/delivery.ts` owns restaurant and fictional customer identities, artistic coordinates, order selection, active time and payment. Each player has an independent `delivery` state in snapshots. A grounded player within 9 m moving no faster than 4 m/s automatically picks up or delivers; no client message claims a payment. Pickup has its own active-time estimate based on distance from where the order began; reaching the restaurant early pays up to 40% of base fare immediately. The delivery estimate begins at pickup and counts active play. Active time includes control input plus a 3-second grace period, and a moving player AV. When idle, the pickup and delivery estimates and leaderboard clock pause. `lastReward` contains the most recent positive pickup or delivery award with a monotonically increasing per-player ID; a renderer may celebrate each new ID once, but cannot create payouts. Base fare depends on straight-line distance; completing early adds up to 75% of base, and lateness reduces fare to a floor of zero. See [DELIVERY.md](DELIVERY.md) for details and provenance.

Each session starts at level 0 with SF orders. `earned` accumulates positive pickup and delivery rewards, independent of the spendable `cash` wallet; tickets and purchases never subtract from it. Unlocks require both completed deliveries and earned: Oakland/Berkeley at 2/$50, Peninsula/East Bay at 5/$140, San Jose at 8/$350. `LEVELS`, `ACCESS_BOUNDARIES` and `requiredLevelAt(x,z)` in `shared/delivery.ts` define this contract. Each order selects only unlocked pickups and destinations; exploration jobs reach unlocked landmark regions, while other jobs may be local or eligible rooftops. The authoritative simulation blocks controlled cars or pedestrians from crossing into a locked region, including flight, collision displacement and vehicle takeover. NPCs are unaffected. `lastBlocked:{level,at}|null` records the required level and world time of the most recent blocked attempt; clients show requirements from `LEVELS`, and may not grant access. The northern Alcatraz approach and Rocket Dome remain open at all levels. Progress is per player and per room/solo session; saved chat identity does not restore it.

Four police NPCs patrol the shared world. A cop seeing a car between 3 m and 80 m above ground within 85 m starts pursuing the player; a parked car on a roof is not flying. Pursuit ends after 10 simulated seconds outside 110 m or when the player is ticketed. When grounded and within 12 m, the car is slowed; within 7 m and below 4 m/s it receives a severity- and repeat-offense-based citation, followed by 20 seconds without re-detection. Police are not stealable. All detection, movement and cash changes are authoritative in the shared fixed-step simulation. Police pathfinding uses the compressed street grid; it is deliberately approximate.

`L` / Scores shows the current room's active players ranked by cash with active time and cash per active minute. Scores disappear on disconnect/reset; saved chat identities do not save scores and there is no global leaderboard. Local solo uses the same state. Neither clock nor leaderboard is a verified anti-cheat measure: room inputs are authoritative but anonymous clients can automate them.

## Rocket Dome soccer

`shared/dome.ts` defines the fictional Alcatraz arena; `shared/map.ts` supplies its capsule surface and support basis. `travelDome` moves one player and current vehicle or person between the arena and a checked Bay spawn, preserving health and air. A vehicle arriving from the island or air joins in place once its upright body fits inside the capsule; the exterior shell is passable on entry, while the interior contains cars. Above-roof overflights remain outside. No ferry is implemented. The arena is enclosed, has no police detection or citations, and pauses the current delivery order clock while leaving the active-play clock intact.

`shared/soccer.ts` owns the one room-wide ball and colored scores. Any car can hit either goal; there are no player teams. Crossing a colored goal awards that color a point, freezes play for three simulation seconds, then returns the ball to center. The first side to five wins; after a six-second winner display, both scores and the ball reset. Physics, scoring and timing are authoritative in solo and online rooms; clients render snapshots and never send ball positions, goals or score claims. A new or empty room starts a new match.


## Citations, rooftops and achievements

`shared/police.ts` measures airborne duration and peak height in the authoritative simulation. When a pursuit ends in a citation, `delivery.lastTicket` records the amount, offense number, flight duration, height and the duration, height and repeat components. The total is deducted immediately, once, with a grace period. Presentation must make a citation conspicuous and require an accessible acknowledgement; clearing controls does not stop server heartbeats. A room continues running while a dialog is open. Session-local UI may not create tickets or alter their amount.

Rooftop customers in `shared/delivery.ts` select actual flat `BUILDINGS` from `shared/map.ts`; the objective marker uses their shared height. A rooftop dropoff requires the car to land and stop within 6 m of the roof center. After Oakland unlocks, an eligible non-exploration order after every third completed run starting with the first may select a rooftop only when the current vehicle has flight capability. Level-zero deliveries remain on the ground. Other vehicles receive ground orders. The player may change cars later, so the interface must identify rooftop orders and the fleet remains available.

`shared/achievements.ts` owns unlocked award IDs and flight tracking per player in snapshots. Bay Hopper requires leaving one mainland shore, crossing water, and arriving on the other without landing; a bridge, island, roof or stunt-loop contact ends the attempt, and recovery or vehicle switches cancel it. Flying above a bridge is allowed. Roof Rider requires a car on a building roof; Sky Delivery requires a completed rooftop delivery; Neighborhood Regular requires three deliveries. Awards are ephemeral and do not affect cash. Clients can render progress and sequence notifications but cannot assert unlocks.
