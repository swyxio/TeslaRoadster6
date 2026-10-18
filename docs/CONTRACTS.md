# Implementation contracts · v3

These contracts are the handoff for other coding agents. The lead integrator owns changes to shared schemas, physics, transport and deployment. A visual/UI task must not silently modify them. They describe the current implementation, not speculative infrastructure.

## Ownership and dependency direction

| Lane | Owns | May depend on | Must not change incidentally |
|---|---|---|---|
| Gameplay | `shared/game.ts`, `physics.ts`, `traffic.ts`, simulation tests | `shared/stations.ts` | Renderer, DOM, transport |
| Network | `worker/*`, integration tests, Wrangler | Shared schemas | Client-supplied authority or physics |
| UI/input | `src/main.ts`, `style.css`, `controls.ts` | Session and read-only shared state | State fields or network shapes |
| Visuals/assets | `src/scene.ts`, `bay-world.ts`, `vehicles.ts`, future `public/assets/` | Shared world and asset contract | Hitboxes, station positions, simulation |
| Data/map | `shared/map.ts`, `stations.ts`, `vehicles.ts` | Documented primary sources | Live fetching at render time |

Dependency flow: UI/input → session → authoritative simulation; snapshots → presentation. Presentation never writes the authoritative world. Solo and server use exactly the same simulation; solo is an explicit menu choice, never a silent network-failure fallback.

## Coordinates and time

- Right-handed world, meters and seconds. X east/right, Y up, Z south; forward is **−Z**.
- Entity `x,y,z` is the ground-center pivot, not mesh center. `y=0` is street level.
- `yaw` and `roll` are radians. Positive yaw turns left: forward vector `(-sin(yaw),0,-cos(yaw))`. Positive steer means left. Roll rotates around local Z.
- `speed` is signed meters/second; UI converts to km/h by multiplying 3.6. `vy` is vertical meters/second. Air/health are bounded 0–100.
- Shared simulation uses fixed 0.05-second steps. `World.time` is simulated seconds, not epoch time. Never use render delta directly for physics.
- `shared/map.ts` owns map bounds, land polygons, roads, bridge decks and `BUILDINGS`; see [MAP.md](MAP.md). `isSurface()` is the authoritative ground support: land or a bridge at Y=0. Water is rendered at Y=−4; a grounded car stops at the shoreline, while a landing in open water returns it to an unoccupied spawn. Avoid visual obstacles in roads without shared collision. Charger posts, trees, bridge furniture and distant hills are decorative. Bridge decks and roads are flat, with no elevated terrain physics.

## World schema

Source of truth is exported TypeScript in `shared/game.ts`:

- `Entity`: id, kind (`VehicleId | person`, 26 vehicle families in `shared/vehicles.ts`), x/y/z, yaw/roll, speed/vy, health/air, driver (player ID or null), owner, pushX/pushZ (lateral velocity), steering, npc/autopilot, routeId/waypoint/pauseUntil.
- `Player`: id, display name, entityId. Each player controls exactly one entity; each vehicle has at most one driver.
- `Pickup`: id, x/z, kind (`repair|air`), active, optional readyAt (simulation seconds).
- `World`: entities, players, pickups, time. Station/building definitions are static versioned data, not repeated in snapshots.
- `Input`: throttle/steer/roll are finite numbers in [−1,1]; boost/lift/brake are booleans. Complete input frames replace previous intent.

Use the functions `createWorld`, `addPlayer`, `removePlayer`, `step`, `interact`, `resetPlayer`, `chooseVehicle`, `toggleAutopilot`. Gameplay must not trust UI validation. Keep identity/ownership changes inside simulation functions. Iteration is deterministic for the same initial world, step sequence and inputs; UUID generation belongs to the server, not physics.

## Wire protocol v3

Connect same-origin WebSocket `GET /api/room/{slug}`. Slug starts with a lowercase alphanumeric, followed by up to31 lowercase alphanumerics/hyphens. Health: `GET /api/health` returns `{ok:true,version:3,capacity:number}`.

Client messages:

```json
{"type":"input","input":{"throttle":1,"steer":0,"roll":0,"boost":false,"lift":true,"brake":false}}
{"type":"interact"}
{"type":"reset"}
{"type":"autopilot"}
{"type":"selectVehicle","kind":"zoox"}
{"type":"name","name":"Driver"}
```

Server messages:

```text
{type:"welcome", id:string, version:3, capacity:number}
{type:"state", world:World}
```

Welcome precedes the initial snapshot. Physics runs at20Hz, snapshots at10Hz. Input sends at20Hz. Client interpolates rendering only; no prediction/reconciliation yet. Client closes/reports incompatible protocol versions. Wire changes require coordinated client/server updates, version bump when incompatible, and integration tests. Do not add compatibility shims for this prototype.

Limits: text-only messages ≤1024 characters, ≤90 messages/client/second, action cooldown400ms, names trimmed/control characters stripped/24-character max. Invalid input closes1008; oversized/binary closes1009; inactive30seconds closes1001. Movement intent expires300ms after last input. Missing/malformed room route404, missing upgrade426, cross-origin browser upgrade403, room full503. Missing Origin is permitted for public nonbrowser clients; Origin checks are not authentication.

Capacity: `MAX_PLAYERS`, default64, clamped2–128. One named Durable Object per room. Shared room state is memory-only. Start timer with first connection; stop and reset when empty. No persistent promise of garages/accounts. Do not replace with a global room object or client-authoritative coordinates.

## Client adapters

`Session` owns `world`, `id`, `status` (`solo|connecting|online|disconnected`), `capacity`, `error`; commands `solo(kind?)`, `join(room,name,kind?)`, `tick(dt,input)`, `action('interact'|'reset'|'autopilot')`, `selectVehicle(kind)`, `disconnect()`. UI can replace presentation but must preserve explicit connection/error/rejoin/solo paths. Never display stale multiplayer as live. Server stalls exceeding6seconds close the connection; initial connection times out after10seconds.

`Controls.read()` returns a complete input. On blur/hidden/menu, clear keys and pointers. Multitouch uses pointer IDs and capture; release on pointerup/cancel/lost capture. Avoid stuck acceleration. Every keyboard action needs a touch equivalent. UI dialogs must neutralize controls while preserving connection heartbeats.

`GameScene.render(world,playerId,dt,menu,lift)` reads snapshots. `start(callback)` runs render frames. `wideCamera` toggles chase modes. Camera, smoothing, labels and effects are local presentation; never modify physical coordinates to make visuals easier.

## UI continuity and acceptance

Keep brand/menu access in menu, game, joining and error states. Fullscreen/pointer lock must have a visible exit if introduced. Room invite links retain room slug and require explicit join. Names must enter DOM through `textContent`, never HTML interpolation. Support 390×844 portrait and 844×390 landscape plus desktop; gameplay and toolbar actions must remain visible without scrolling. Menu may scroll. Touch targets ≥44px where practical; no hover-only actions. Canvas needs accessible labeling; all interactive controls must have names, focus indication, and keyboard operation.

## Required handoff from every contributor

1. State owned files and intended contract changes before editing shared files.
2. Keep a playable end-to-end baseline; do not leave the default route on a mock or asset gallery.
3. Run `pnpm test` and `pnpm build`; network changes also run live two-client integration.
4. Visual/input changes: inspect desktop and portrait/landscape phone layouts, drive/lift/land, and switch cars. Record actual browser/device used; emulation is not physical-device evidence.
5. List assets, provenance/licenses, budgets and known gaps. No unlicensed GTA assets or unexplained remote dependencies.
6. Provide a small concrete diff and verification result. Do not change deployment names, domains, accounts or shared contracts as part of an art/UI task.

## Fleet and autonomy contract

`shared/vehicles.ts` defines all model identities, dimensions, wheelbase, mass, steering, acceleration, braking, capabilities and provenance. Renderer consumes the same IDs and dimensions. Numbers marked estimates remain estimates; never silently promote them to manufacturer specifications. All handling is arcade tuning. Only `roadster` Air Edition has flight/boost.

Collision bodies are oriented rectangles using registry length/width; mass-weighted impulse response includes lateral velocity. Bicycle steering uses wheelbase and bounded steering angle; Cybertruck/Zoox have enhanced low-speed steering and visually countersteering rear wheels. This is not suspension/tire simulation. Terrain roof support remains shared.

Every model has one parked entity and one NPC traffic entity. `npc` is identity; `autopilot` is current control mode. NPCs have null `driver`, so on-foot players may take them; taking one disables autonomy and stops it. Human-occupied vehicles cannot be taken. Exiting/disconnecting releases an NPC back to street autonomy after a pause when it can attach to a route. Other empty vehicles remain parked unless explicitly enabled.

Autonomy uses deterministic right-lane loops, including a cross-Bay route, and obstacle yielding. Engage only grounded within 9 m of a supported street route. A player's throttle/steer/brake/lift/boost/roll input immediately cancels AV mode. The server owns route state and motion; renderers never advance traffic. No real AV/vehicle API is used. Mode is available for every model as game fiction, including historical prototypes.

Fleet selection requires grounded speed≤1 m/s. It releases the old vehicle, creates the requested player-owned model at a free spawn, and removes abandoned personal duplicates. IDs are strict allowlisted own registry properties (not `in` checks susceptible to prototype names). No client-supplied mass, coordinates or damage. Names bypass the action cooldown but remain rate-limited so startup selection isn't lost behind a name message. Protocol version constant is `PROTOCOL_VERSION` in shared/game.ts; incompatible clients explicitly reload.

Geometry/materials in the renderer are shared static caches. Removing an entity must NOT dispose shared geometry. Wheel assemblies are named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`; yaw articulation uses shared steering state. `jets` remains the flight effect group. Future models must pass catalog coverage, body collision, takeover, traffic-stability and multiplayer-selection tests.
