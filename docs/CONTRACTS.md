# Implementation contracts · v1

These contracts are the handoff for other coding agents. The lead integrator owns changes to shared schemas, physics, transport and deployment. A visual/UI task must not silently modify them. They describe the current implementation, not speculative infrastructure.

## Ownership and dependency direction

| Lane | Owns | May depend on | Must not change incidentally |
|---|---|---|---|
| Gameplay | `shared/game.ts`, simulation tests | `shared/stations.ts` | Renderer, DOM, transport |
| Network | `worker/*`, integration tests, Wrangler | Shared schemas | Client-supplied authority or physics |
| UI/input | `src/main.ts`, `style.css`, `controls.ts` | Session and read-only shared state | State fields or network shapes |
| Visuals/assets | `src/scene.ts`, `vehicles.ts`, future `public/assets/` | Shared world and asset contract | Hitboxes, station positions, simulation |
| Data/map | `shared/stations.ts`, building definitions | Documented primary sources | Live fetching at render time |

Dependency flow: UI/input → session → authoritative simulation; snapshots → presentation. Presentation never writes the authoritative world. Solo and server use exactly the same simulation; solo is an explicit menu choice, never a silent network-failure fallback.

## Coordinates and time

- Right-handed world, meters and seconds. X east/right, Y up, Z south; forward is **−Z**.
- Entity `x,y,z` is the ground-center pivot, not mesh center. `y=0` is street level.
- `yaw` and `roll` are radians. Positive yaw turns left: forward vector `(-sin(yaw),0,-cos(yaw))`. Positive steer means left. Roll rotates around local Z.
- `speed` is signed meters/second; UI converts to km/h by multiplying 3.6. `vy` is vertical meters/second. Air/health are bounded 0–100.
- Shared simulation uses fixed 0.05-second steps. `World.time` is simulated seconds, not epoch time. Never use render delta directly for physics.
- Arena is X/Z ±240; collision geometry in `BUILDINGS` is authoritative. Do not add visual obstacles in roads without corresponding shared collisions. Current charger posts/trees/bridge furniture are decorative.

## World schema

Source of truth is exported TypeScript in `shared/game.ts`:

- `Entity`: id, kind (`roadster|coupe|truck|person`), x/y/z, yaw/roll, speed/vy, health/air, driver (player ID or null).
- `Player`: id, display name, entityId. Each player controls exactly one entity; each vehicle has at most one driver.
- `Pickup`: id, x/z, kind (`repair|air`), active, optional readyAt (simulation seconds).
- `World`: entities, players, pickups, time. Station/building definitions are static versioned data, not repeated in snapshots.
- `Input`: throttle/steer/roll are finite numbers in [−1,1]; boost/lift/brake are booleans. Complete input frames replace previous intent.

Use the functions `createWorld`, `addPlayer`, `removePlayer`, `step`, `interact`, `resetPlayer`. Gameplay must not trust UI validation. Keep identity/ownership changes inside simulation functions. Iteration is deterministic for the same initial world, step sequence and inputs; UUID generation belongs to the server, not physics.

## Wire protocol v1

Connect same-origin WebSocket `GET /api/room/{slug}`. Slug starts with a lowercase alphanumeric, followed by up to31 lowercase alphanumerics/hyphens. Health: `GET /api/health` returns `{ok:true,version:1,capacity:number}`.

Client messages:

```json
{"type":"input","input":{"throttle":1,"steer":0,"roll":0,"boost":false,"lift":true,"brake":false}}
{"type":"interact"}
{"type":"reset"}
{"type":"name","name":"Driver"}
```

Server messages:

```text
{type:"welcome", id:string, version:1, capacity:number}
{type:"state", world:World}
```

Welcome precedes the initial snapshot. Physics runs at20Hz, snapshots at10Hz. Input sends at20Hz. Client interpolates rendering only; no prediction/reconciliation yet. Client closes/reports incompatible protocol versions. Wire changes require coordinated client/server updates, version bump when incompatible, and integration tests. Do not add compatibility shims for this prototype.

Limits: text-only messages ≤1024 characters, ≤90 messages/client/second, action cooldown400ms, names trimmed/control characters stripped/24-character max. Invalid input closes1008; oversized/binary closes1009; inactive30seconds closes1001. Movement intent expires300ms after last input. Missing/malformed room route404, missing upgrade426, cross-origin browser upgrade403, room full503. Missing Origin is permitted for public nonbrowser clients; Origin checks are not authentication.

Capacity: `MAX_PLAYERS`, default64, clamped2–128. One named Durable Object per room. Shared room state is memory-only. Start timer with first connection; stop and reset when empty. No persistent promise of garages/accounts. Do not replace with a global room object or client-authoritative coordinates.

## Client adapters

`Session` owns `world`, `id`, `status` (`solo|connecting|online|disconnected`), `capacity`, `error`; commands `solo()`, `join(room,name)`, `tick(dt,input)`, `action('interact'|'reset')`, `disconnect()`. UI can replace presentation but must preserve explicit connection/error/rejoin/solo paths. Never display stale multiplayer as live. Server stalls exceeding6seconds close the connection; initial connection times out after10seconds.

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
