# Implementation contracts · v7

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
- Entity `x,y,z` is the ground-center pivot, not mesh center. `y=0` is street level.
- `yaw`, `pitch` and `roll` are radians; pitch is rotation around local X and roll around local Z. Positive yaw turns left: forward vector `(-sin(yaw),0,-cos(yaw))`. Positive steer means left. Roll rotates around local Z.
- `speed` is signed forward meters/second; UI converts to km/h by multiplying 3.6. `vx`, `vy` and `vz` are world velocity in meters/second; pitchRate, yawRate and rollRate are angular rates. Air/health are bounded 0–100.
- Shared simulation uses fixed 0.05-second steps. `World.time` is simulated seconds, not epoch time. Never use render delta directly for physics.
- `shared/map.ts` owns map bounds, land polygons, roads, bridge decks and `BUILDINGS`; see [MAP.md](MAP.md). `isSurface()` is the authoritative ground support: land or a bridge at Y=0. Water is rendered at Y=−4; a grounded car stops at the shoreline, while a landing in open water returns it to an unoccupied spawn. Avoid visual obstacles in roads without shared collision. Charger posts, trees, bridge furniture and distant hills are decorative. Bridge decks and roads are flat. The Oakland STUNT_RAMP and analytic vertical STUNT_LOOP are authoritative surfaces; their rendering uses the same geometry.

## World schema

Source of truth is exported TypeScript in `shared/game.ts`:

- `Entity`: id, kind (`VehicleId | person`, 26 vehicle families in `shared/vehicles.ts`), x/y/z, yaw/pitch/roll, vx/vy/vz, angular rates, speed, health/air, stunt count, loop attachment and authoritative thruster-effect bitmask, driver (player ID or null), owner, pushX/pushZ (lateral velocity), steering, npc/autopilot, routeId/waypoint/pauseUntil; police cars additionally have `police` pursuit state.
- `Player`: id, display name, entityId, `delivery` (session cash, active time, order, completed runs and ticket state), and `achievements` (unlocked session awards and server-owned flight tracking). Each player controls exactly one entity; each vehicle has at most one driver.
- `Pickup`: id, x/z, kind (`repair|air`), active, optional readyAt (simulation seconds).
- `World`: entities, players, pickups, time. Station/building definitions are static versioned data, not repeated in snapshots.
- `Input`: throttle/steer/roll are finite numbers in [−1,1]; boost/hover/brake are booleans. Jump and flip are bounded integer press counters; the simulation consumes changed counters once, including when a tap is shorter than an input frame. Complete input frames replace previous intent.

Use the functions `createWorld`, `addPlayer`, `removePlayer`, `step`, `interact`, `resetPlayer`, `chooseVehicle`, `toggleAutopilot`. Gameplay must not trust UI validation. Keep identity/ownership changes inside simulation functions. Iteration is deterministic for the same initial world, step sequence and inputs; UUID generation belongs to the server, not physics.

## Wire protocol v8

Connect same-origin WebSocket `GET /api/room/{slug}`. Slug starts with a lowercase alphanumeric, followed by up to31 lowercase alphanumerics/hyphens. Health: `GET /api/health` returns `{ok:true,version:8,capacity:number}`.

Client messages:

```json
{"type":"input","input":{"throttle":1,"steer":0,"roll":0,"boost":false,"hover":false,"brake":false,"jump":1,"flip":0}}
{"type":"interact"}
{"type":"reset"}
{"type":"autopilot"}
{"type":"selectVehicle","kind":"zoox"}
{"type":"name","name":"Driver"}
```

Server messages:

```text
{type:"welcome", id:string, version:8, capacity:number}
{type:"state", world:World}
```

Welcome precedes the initial snapshot. Physics runs at20Hz, snapshots at10Hz. Input sends at20Hz. Client interpolates rendering only; no prediction/reconciliation yet. Client closes/reports incompatible protocol versions. Wire changes require coordinated client/server updates, version bump when incompatible, and integration tests. Do not add compatibility shims for this prototype.

Limits: text-only messages ≤1024 characters, ≤90 messages/client/second, action cooldown400ms, names trimmed/control characters stripped/24-character max. Invalid input closes1008; oversized/binary closes1009; inactive30seconds closes1001. Movement intent expires300ms after last input. Missing/malformed room route404, missing upgrade426, cross-origin browser upgrade403, room full503. Missing Origin is permitted for public nonbrowser clients; Origin checks are not authentication.

Capacity: `MAX_PLAYERS`, default64, clamped2–128. One named Durable Object per room. Shared room state is memory-only. Start timer with first connection; stop and reset when empty. No persistent promise of garages/accounts. Do not replace with a global room object or client-authoritative coordinates.

## Client adapters

`Session` owns `world`, `id`, `status` (`solo|connecting|online|disconnected`), `capacity`, `error`; commands `solo(kind?)`, `join(room,name,kind?)`, `tick(dt,input)`, `action('interact'|'reset'|'autopilot')`, `selectVehicle(kind)`, `disconnect()`. UI can replace presentation but must preserve explicit connection/error/rejoin/solo paths. Never display stale multiplayer as live. Server stalls exceeding6seconds close the connection; initial connection times out after10seconds.

`Controls.read()` returns a complete input. On blur/hidden/menu, clear keys and pointers. Multitouch uses pointer IDs and capture; release on pointerup/cancel/lost capture. Avoid stuck acceleration. Every keyboard action needs a touch equivalent. UI dialogs must neutralize controls while preserving connection heartbeats.

`GameScene.render(world,playerId,dt,menu)` reads snapshots. `start(callback)` runs render frames. `wideCamera` toggles chase modes. Camera, smoothing, labels and effects are local presentation; never modify physical coordinates to make visuals easier.

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

`shared/vehicles.ts` defines all model identities, dimensions, wheelbase, mass, steering, acceleration, braking, capabilities and provenance. Renderer consumes the same IDs and dimensions. Numbers marked estimates remain estimates; never silently promote them to manufacturer specifications. All handling is arcade tuning. Only the `roadster` Rocket has arcade thrust, jumps, flips and suction. Air jumps, free-air thruster hover and tank performance are game fiction. Suction operates only at the physical loop surface.

Collision bodies are oriented rectangles using registry length/width; mass-weighted impulse response includes lateral velocity. Bicycle steering uses wheelbase and bounded steering angle; Cybertruck/Zoox have enhanced low-speed steering and visually countersteering rear wheels. A grounded player car moving forward can initiate an arcade drift by steering with brake or reverse; lateral momentum decays after release. This is not suspension/tire simulation. Terrain roof support remains shared.

Every model has one parked entity and one NPC traffic entity. `npc` is identity; `autopilot` is current control mode. NPCs have null `driver`, so on-foot players may take them; taking one disables autonomy and stops it. Human-occupied vehicles cannot be taken. Exiting/disconnecting releases an NPC back to street autonomy after a pause when it can attach to a route. Other empty vehicles remain parked unless explicitly enabled.

Autonomy uses deterministic right-lane loops, including a cross-Bay route, and obstacle yielding. Engage only grounded within 9 m of a supported street route. A player's throttle/steer/brake/jump/flip/boost/hover/roll input immediately cancels AV mode. The server owns route state and motion; renderers never advance traffic. No real AV/vehicle API is used. Mode is available for every model as game fiction, including historical prototypes.

Fleet selection requires grounded speed≤1 m/s. It releases the old vehicle, creates the requested player-owned model at a free spawn, and removes abandoned personal duplicates. IDs are strict allowlisted own registry properties (not `in` checks susceptible to prototype names). No client-supplied mass, coordinates or damage. Names bypass the action cooldown but remain rate-limited so startup selection isn't lost behind a name message. Protocol version constant is `PROTOCOL_VERSION` in shared/game.ts; incompatible clients explicitly reload.

Geometry/materials in the renderer are shared static caches. Removing an entity must NOT dispose shared geometry. Wheel assemblies are named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`; yaw articulation uses shared steering state. `jets` contains independent rear, corner and side cold-gas vapor groups. The simulation publishes a thruster bitmask so remote effects follow actual boost, jump, hover and roll events; firing patterns are arcade interpretations, not prototype control logic. Future models must pass catalog coverage, body collision, takeover, traffic-stability and multiplayer-selection tests.

## Delivery and police contract

`shared/delivery.ts` owns restaurant and fictional customer identities, artistic coordinates, order selection, active time and payment. Each player has an independent `delivery` state in snapshots. A grounded player within 9 m moving no faster than 4 m/s automatically picks up or delivers; no client message claims a payment. Pickup has its own active-time estimate based on distance from where the order began; reaching the restaurant early pays up to 40% of base fare immediately. The delivery estimate begins at pickup and counts active play. Active time includes control input plus a 3-second grace period, and a moving player AV. When idle, the pickup and delivery estimates and leaderboard clock pause. `lastReward` contains the most recent positive pickup or delivery award with a monotonically increasing per-player ID; a renderer may celebrate each new ID once, but cannot create payouts. Base fare depends on straight-line distance; completing early adds up to 75% of base, and lateness reduces fare to a floor of zero. See [DELIVERY.md](DELIVERY.md) for details and provenance.

Four police NPCs patrol the shared world. A cop seeing a car between 3 m and 80 m above ground within 85 m starts pursuing the player; a parked car on a roof is not flying. Pursuit ends after 10 simulated seconds outside 110 m or when the player is ticketed. When grounded and within 12 m, the car is slowed; within 7 m and below 4 m/s it receives a severity- and repeat-offense-based citation, followed by 20 seconds without re-detection. Police are not stealable. All detection, movement and cash changes are authoritative in the shared fixed-step simulation. Police pathfinding uses the compressed street grid; it is deliberately approximate.

`L` / Scores shows the current room's active players ranked by cash with active time and cash per active minute. Scores disappear on disconnect/reset; there is no persistent identity or global leaderboard. Local solo uses the same state. Neither clock nor leaderboard is a verified anti-cheat measure: room inputs are authoritative but anonymous clients can automate them.


## Citations, rooftops and achievements

`shared/police.ts` measures airborne duration and peak height in the authoritative simulation. When a pursuit ends in a citation, `delivery.lastTicket` records the amount, offense number, flight duration, height and the duration, height and repeat components. The total is deducted immediately, once, with a grace period. Presentation must make a citation conspicuous and require an accessible acknowledgement; clearing controls does not stop server heartbeats. A room continues running while a dialog is open. Session-local UI may not create tickets or alter their amount.

Rooftop customers in `shared/delivery.ts` select actual flat `BUILDINGS` from `shared/map.ts`; the objective marker uses their shared height. A rooftop dropoff requires the car to land and stop within 6 m of the roof center. The next order is eligible for a rooftop after every third completed run starting with the first, only when the current vehicle has flight capability. Other vehicles receive ground orders. The player may change cars later, so the interface must identify rooftop orders and the fleet remains available.

`shared/achievements.ts` owns unlocked award IDs and flight tracking per player in snapshots. Bay Hopper requires leaving one mainland shore, crossing water, and arriving on the other without landing; a bridge, island, roof or stunt-loop contact ends the attempt, and recovery or vehicle switches cancel it. Flying above a bridge is allowed. Roof Rider requires a car on a building roof; Sky Delivery requires a completed rooftop delivery; Neighborhood Regular requires three deliveries. Awards are ephemeral and do not affect cash. Clients can render progress and sequence notifications but cannot assert unlocks.
