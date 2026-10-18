# Poly AV

Formerly Bay Drive. A small, playable multiplayer driving sandbox inspired by the San Francisco Bay Area. Pick up food and deliver it for cash, dodge police, jump and flip a Roadster, drive through an inverted stunt loop, swap cars, bump your friends, and refill compressed air at real-world Tesla Supercharger identities placed on a deliberately compressed map. Drive a 19.9 km circuit through the Peninsula, San Jose, Fremont and Oakland, cross the Bay Bridge via Yerba Buena Island, or take the Golden Gate north to Marin.

**[Play Poly AV](https://bay-drive.swyxio.workers.dev)** · [Staging preview](https://staging-bay-drive.swyxio.workers.dev) · [Contribute](CONTRIBUTING.md) · [Deploy your own](docs/DEPLOYMENT.md)

![Driving across the Bay Bridge toward Oakland](docs/screenshots/bay-bridge-drive.jpg)

**Delivery:** Pick up at a gold marker and stop at the customer. Reach the restaurant quickly for a pickup bonus, then beat the active-time delivery estimate for another bonus; late deliveries pay less. Flying near police starts a chase and potentially a costly citation; repeat and more serious flights increase the fine. Some Roadster orders lead to rooftops. Earn session achievements for rooftop landings, deliveries, and flying across the Bay. The room leaderboard lasts only for the session. See [delivery design](docs/DELIVERY.md).

**Sound:** An original synthesized 8-bit soundtrack and driving effects accompany the game. Use **♫** for master, music and effects levels or to mute; settings stay on this browser. See [audio design](docs/AUDIO.md).

**Rocket Dome:** Open Actions and choose ⚽ Rocket Dome to travel to a fictional Alcatraz soccer arena. Anyone can hit the shared ball into either colored goal; the first side to five wins and a new match starts automatically. The Rocket Roadster can drive up the curved walls and across the ceiling. Use Leave Dome to return to the Bay. The ferry and the rest of Rocket Island remain a proposal.

**Global chat:** Pick a driver name and chat with players across rooms, including from solo play. Names in use are distinguished with a suffix such as `#2`; a player ID also distinguishes chat senders. You can optionally save your chat identity with a generated recovery code. Keep that code private: anyone with it can use the identity. Recovering restores your chat ID and saved name, not your car, money, or game progress.

**Fleet:** 26 sourced Tesla/Waymo/Cruise/Zoox families, each parked, in NPC traffic, selectable, drivable and available for takeover. Published versus estimated values are documented in [fleet research](docs/FLEET_RESEARCH.md).

**Start here:** [agent contracts](docs/CONTRACTS.md), [game design](docs/DESIGN.md), [asset brief](docs/ASSETS.md), [fleet verification](docs/FLEET_VERIFICATION.md), [ready-to-use agent tasks](docs/AGENT_TASKS.md).

**Proposal:** The [larger Rocket Island and parking playgrounds](docs/ROCKET_ISLAND_PLAN.md) are planned; the Rocket Dome is playable now.

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
pnpm exec tsx tests/chat.integration.ts http://localhost:8787
pnpm exec tsx tests/chat-restart.integration.ts # starts an isolated local Worker
pnpm exec tsx tests/capacity.integration.ts http://localhost:8787 64
```

The network checks need the local Worker running. See [deployment](docs/DEPLOYMENT.md) for a separate Cloudflare deployment and the native build/preview workflow; deploying is not needed to contribute.

## Play

- **WASD / arrows:** accelerate, reverse, steer. **Space:** brake; steer while braking or reversing to drift, then release to regain grip.
- **J:** Rocket jump (or fictional air jump). **H:** hold for fictional thruster hover. **X:** one-tap flip. **Shift:** air boost. **Q/E:** manual airborne roll. In the air, steering turns and W/S pitch.
- **F:** exit a stopped car / take the nearest empty car within 7 world meters.
- **V:** toggle autonomous cruise (manual input takes over). **G:** fleet catalog; select a new ride while stopped.
- **L:** room leaderboard with cash and active play time. **T:** session achievements.
- **C / Actions → Camera:** cycle chase, first-person cockpit, and wide view. The cockpit follows the car through flips; on foot it falls back to chase. First-person time and whole first-person deliveries appear on the session leaderboard as self-reported. **R:** unstuck recovery, preserving air and condition.
- Touch: steering and pedals; hold Brake or Rev while steering to drift. Tap Jump and the airborne Flip button; hold Hover for fictional thruster hover. Boost, manual roll, brake and toolbar actions support portrait and landscape.
- Stop inside a mint station ring to refill air. Green pickups repair; amber pickups refill air. Both return after 20 seconds.
- Enter the same room code on multiple devices, or use **Invite** to copy its URL. Invite links open the menu; joining is explicit.

## Boundaries

This is a working foundation, not GTA-scale content or a persistent MMO. Four station identities are sourced from Tesla, but their game positions are compressed artistic placements. Compressed-air refills, repeated air jumps and the game’s thrust and suction tuning are fictional. The Rocket is inspired by a prototype, not a production-car specification. No live charging availability, payment, telemetry, or Tesla account/API integration. No affiliation is implied.

Rooms are ephemeral and public-by-code. Delivery money is fictional and session-only; there is no persistent game progression, shooting, or death/respawn yet. Traffic is deterministic arcade driving, not real AV software. Combat and recovery expansion are designed in `docs/DESIGN.md`. Room state resets on deployment, runtime restart, or last disconnect. Room codes are not access control. Saved chat identities persist separately, but room labels are self-asserted and are not proof of a chat identity. Global chat retains only a recent, transient history, which disappears on server restart.

Capacity defaults to **64**, configurable through `MAX_PLAYERS` in Wrangler up to a provisional ceiling of 128. This is a gameplay limit, not Cloudflare's WebSocket maximum. Player-relevant snapshots and a collision spatial index reduce work in the larger world; increase the ceiling only after measurement. Active real-time rooms incur Durable Object duration and request usage; they do not hibernate while physics runs. Never advertise a connection limit as tested gameplay concurrency.

## Layout

```
shared/game.ts      Pure authoritative simulation and world schema
shared/map.ts       Shared land, bridges, road and collision geometry
shared/vehicles.ts  26-model registry with provenance and tuning
shared/physics.ts   Oriented bodies and mass-based collisions
shared/traffic.ts   Deterministic autonomous routes and traffic demand
shared/delivery.ts  Orders, restaurant data, cash and active-time scoring
shared/police.ts    Police detection, chase and severity-based tickets
shared/achievements.ts  Session awards and flight tracking
shared/day.ts       Accelerated day clock and demand profiles
shared/bridge-signal.ts  Shared Bay Bridge approach meter
shared/stations.ts  Curated real station provenance + game placements
worker/protocol.ts  Input parser and room capacity policy
worker/index.ts     HTTP routing and one Durable Object per room
worker/global-chat.ts  Global chat and optional saved identities
src/session.ts     Solo/multiplayer transport adapter
src/controls.ts    Keyboard and multitouch intent adapter
src/audio.ts       Synthesized music, effects and volume buses
src/audio-events.ts  Presentation cues derived from world snapshots
src/scene.ts       Three.js world and camera
src/bay-world.ts   Compressed Bay Area environment and landmarks
src/vehicles.ts    Replaceable procedural visual models
src/main.ts        Menu, instruments, action wiring, minimap
src/style.css      Tailwind entry and responsive visual treatment
tests/             Simulation, protocol and live connection checks
```

No framework is needed for this small HUD. Keep the simulation independent from Three.js, the DOM, and Cloudflare. Keep pnpm lockfile committed. Alternative UI or art implementations should obey the contracts before adding dependencies or changing shared gameplay.

## License and attribution

First-party source, documentation and original procedural assets are [MIT licensed](LICENSE). The highway source extract and generated traces are © OpenStreetMap contributors, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/); see [map provenance and the reproducible bake](docs/MAP.md). Third-party dependencies have their own licenses; the bundled three.js notice is in [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt). Restaurant names identify real places, with fictional in-game locations and no affiliation. Tesla, Waymo, Cruise and Zoox names identify the vehicles that inspired this independent project; they do not imply endorsement, and the MIT license does not grant trademark rights.
