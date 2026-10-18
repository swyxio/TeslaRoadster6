# Poly AV

Formerly Bay Drive. A small, playable multiplayer driving sandbox inspired by the San Francisco Bay Area. Pick up food and deliver it for cash, dodge police, jump and flip a Roadster, drive through an inverted stunt loop, swap cars, bump your friends, and refill compressed air at real-world Tesla Supercharger identities placed on a deliberately compressed map. Cross the Bay Bridge from San Francisco to Oakland via Yerba Buena Island, or take the Golden Gate north to Marin.

**[Play Poly AV](https://bay-drive.swyxio.workers.dev)** · [Staging preview](https://staging-bay-drive.swyxio.workers.dev) · [Contribute](CONTRIBUTING.md) · [Deploy your own](docs/DEPLOYMENT.md)

![Driving across the Bay Bridge toward Oakland](docs/screenshots/bay-bridge-drive.jpg)

**Delivery:** Pick up at a gold marker and stop at the customer. Beat the active-time estimate for a bonus; late deliveries pay less. Flying near police starts a chase and a possible ticket. The room leaderboard lasts only for the session. See [delivery design](docs/DELIVERY.md).

**Fleet:** 26 sourced Tesla/Waymo/Cruise/Zoox families, each parked, in NPC traffic, selectable, drivable and available for takeover. Published versus estimated values are documented in [fleet research](docs/FLEET_RESEARCH.md).

**Start here:** [agent contracts](docs/CONTRACTS.md), [game design](docs/DESIGN.md), [asset brief](docs/ASSETS.md), [fleet verification](docs/FLEET_VERIFICATION.md), [ready-to-use agent tasks](docs/AGENT_TASKS.md).

## Run

Node 22 and pnpm 10.33.1 are recommended. No credentials are needed locally.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm dev:server
# http://localhost:8787 serves both client and WebSocket server
```

For frontend hot reload, leave Wrangler running and start `pnpm dev` in another terminal. Vite proxies `/api` and WebSockets to port 8787. Cloudflare owns production hosting and multiplayer; solo mode uses the same simulation locally.

```sh
pnpm run ci # tests, TypeScript checks and production build
pnpm exec tsx tests/room.integration.ts http://localhost:8787
pnpm exec tsx tests/capacity.integration.ts http://localhost:8787 64
```

The network checks need the local Worker running. See [deployment](docs/DEPLOYMENT.md) for a separate Cloudflare deployment and the native build/preview workflow; deploying is not needed to contribute.

## Play

- **WASD / arrows:** accelerate, reverse, steer. **B:** brake.
- **Space:** Rocket jump (or fictional air jump). **H:** hold for fictional thruster hover. **X:** one-tap flip. **Shift:** air boost. **Q/E:** manual airborne roll. In the air, steering turns and W/S pitch.
- **F:** exit a stopped car / take the nearest empty car within 7 world meters.
- **V:** toggle autonomous cruise (manual input takes over). **G:** fleet catalog; select a new ride while stopped.
- **L:** room leaderboard with cash and active play time.
- **C:** alternate chase camera. **R:** unstuck recovery, preserving air and condition.
- Touch: steering and pedals; tap Jump and the airborne Flip button; hold Hover for fictional thruster hover. Boost, manual roll, brake and toolbar actions support portrait and landscape.
- Stop inside a mint station ring to refill air. Green pickups repair; amber pickups refill air. Both return after 20 seconds.
- Enter the same room code on multiple devices, or use **Invite** to copy its URL. Invite links open the menu; joining is explicit.

## Boundaries

This is a working foundation, not GTA-scale content or a persistent MMO. Four station identities are sourced from Tesla, but their game positions are compressed artistic placements. Compressed-air refills, repeated air jumps and the game’s thrust and suction tuning are fictional. The Rocket is inspired by a prototype, not a production-car specification. No live charging availability, payment, telemetry, account, or Tesla API integration. No affiliation is implied.

Rooms are ephemeral and public-by-code. No authentication, persistent progression, saving, shooting, or death/respawn yet. Delivery money is fictional and session-only. Traffic is deterministic arcade driving, not real AV software. Combat and recovery expansion are designed in `docs/DESIGN.md`. Room state resets on deployment, runtime restart, or last disconnect. Room codes are not access control.

Capacity defaults to **64**, configurable through `MAX_PLAYERS` in Wrangler up to a provisional ceiling of 128. This is a gameplay limit, not Cloudflare's WebSocket maximum. Full snapshots and all-pairs collisions intentionally favor simplicity; increase the ceiling only after measurement. Active real-time rooms incur Durable Object duration and request usage; they do not hibernate while physics runs. Never advertise a connection limit as tested gameplay concurrency.

## Layout

```
shared/game.ts      Pure authoritative simulation and world schema
shared/map.ts       Shared land, bridges, road and collision geometry
shared/vehicles.ts  26-model registry with provenance and tuning
shared/physics.ts   Oriented bodies and mass-based collisions
shared/traffic.ts   Deterministic autonomous street loops
shared/delivery.ts  Orders, restaurant data, cash and active-time scoring
shared/police.ts    Police detection, chase and tickets
shared/stations.ts  Curated real station provenance + game placements
worker/protocol.ts  Input parser and room capacity policy
worker/index.ts     HTTP routing and one Durable Object per room
src/session.ts     Solo/multiplayer transport adapter
src/controls.ts    Keyboard and multitouch intent adapter
src/scene.ts       Three.js world and camera
src/bay-world.ts   Compressed Bay Area environment and landmarks
src/vehicles.ts    Replaceable procedural visual models
src/main.ts        Menu, instruments, action wiring, minimap
src/style.css      Tailwind entry and responsive visual treatment
tests/             Simulation, protocol and live connection checks
```

No framework is needed for this small HUD. Keep the simulation independent from Three.js, the DOM, and Cloudflare. Keep pnpm lockfile committed. Alternative UI or art implementations should obey the contracts before adding dependencies or changing shared gameplay.

## License and attribution

First-party source, documentation and original procedural assets are [MIT licensed](LICENSE). Third-party dependencies have their own licenses; the bundled three.js notice is in [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt). Restaurant names identify real places, with fictional in-game locations and no affiliation. Tesla, Waymo, Cruise and Zoox names identify the vehicles that inspired this independent project; they do not imply endorsement, and the MIT license does not grant trademark rights.
