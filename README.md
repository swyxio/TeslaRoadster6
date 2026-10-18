# Poly AV

Formerly Bay Drive. A small, playable multiplayer driving sandbox inspired by the San Francisco Bay Area. Pick up food and deliver it for cash, dodge police, jump and flip a Roadster, drive through an inverted stunt loop, swap cars, bump your friends, and refill compressed air at real-world Tesla Supercharger identities placed on a deliberately compressed map. Drive a 19.9 km circuit through the Peninsula, San Jose, Fremont and Oakland, cross the Bay Bridge via Yerba Buena Island, or take the Golden Gate north to Marin.

**[Play Poly AV](https://bay-drive.swyxio.workers.dev)** · [Staging preview](https://staging-bay-drive.swyxio.workers.dev) · [Contribute](CONTRIBUTING.md) · [Deploy your own](docs/DEPLOYMENT.md)

This checkout contains the Rocket Island expansion and Rocket Dome; the public link may still serve an earlier version. See [verification](docs/VERIFICATION.md) for observed checks.

![Driving across the Bay Bridge toward Oakland](docs/screenshots/bay-bridge-drive.jpg)

**Delivery:** Pick up at a gold marker and stop at the customer. Reach the restaurant quickly for a pickup bonus, then beat the active-time delivery estimate for another bonus; late deliveries pay less. Flying near police starts a chase and potentially a costly citation; repeat and more serious flights increase the fine. Some Roadster orders lead to rooftops. Earn session achievements for rooftop landings, deliveries, and flying across the Bay. The room leaderboard lasts only for the session. See [delivery design](docs/DELIVERY.md).

**Sound:** An original synthesized 8-bit soundtrack and driving effects accompany the game. Use **♫** for master, music and effects levels or to mute; settings stay on this browser. See [audio design](docs/AUDIO.md).

**Rocket Dome:** Open Actions and choose ⚽ Rocket Dome to travel to a fictional Alcatraz soccer arena, separate from Rocket Island. Anyone can hit the shared ball into either colored goal; the first side to five wins and a new match starts automatically. The Rocket Roadster can drive up the curved walls and across the ceiling. Use Leave Dome to return to the Bay.

**Fleet:** 26 sourced Tesla/Waymo/Cruise/Zoox families, each parked, in NPC traffic, selectable, drivable and available for takeover. Published versus estimated values are documented in [fleet research](docs/FLEET_RESEARCH.md).

**Start here:** [agent contracts](docs/CONTRACTS.md), [game design](docs/DESIGN.md), [asset brief](docs/ASSETS.md), [fleet verification](docs/FLEET_VERIFICATION.md), [ready-to-use agent tasks](docs/AGENT_TASKS.md).

**Rocket Island:** Take the autonomous ferry from the north SF dock to a fictional island with a banked speed oval, a separate banked lane, an inverted cliff and a short circuit. Purple Rocket pads temporarily give any vehicle the Roadster's fictional air moves. The two registered parking playgrounds offer Park It and Cut the queue. These are session-only arcade activities; see [implementation status and remaining checks](docs/ROCKET_ISLAND_PLAN.md).

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

- **WASD / arrows:** accelerate, reverse, steer. **Space:** brake; steer while braking or reversing to drift, then release to regain grip.
- **J:** Rocket jump (or fictional air jump). **H:** hold for fictional thruster hover. **X:** one-tap flip. **Shift:** air boost. **Q/E:** manual airborne roll. In the air, steering turns and W/S pitch.
- **F:** exit a stopped car / take the nearest empty car within 7 world meters.
- **V:** toggle autonomous cruise (manual input takes over). **G:** fleet catalog; select a new ride while stopped.
- **L:** room leaderboard with cash and active play time. **T:** session achievements.
- **C / Actions → Camera:** cycle chase, first-person cockpit, and wide view. The cockpit follows the car through flips; on foot it falls back to chase. First-person time and whole first-person deliveries appear on the session leaderboard as self-reported. **R:** unstuck recovery, preserving air and condition.
- Touch: steering and pedals; hold Brake or Rev while steering to drift. Tap Jump and the airborne Flip button; hold Hover for fictional thruster hover. Boost, manual roll, brake and toolbar actions support portrait and landscape.
- Stop inside a mint station ring to refill air. Green pickups repair; amber pickups refill air. Both return after 20 seconds.
- At the north SF dock, drive onto the stationary ferry and stop completely on deck. Cars are secured during a crossing; drive off on arrival. The HUD and dock signs show ferry status and countdown; painted walking lanes, visual gates and a nearby horn mark the crossing.
- Drive over a purple Rocket pickup in a car to refill air and grant that vehicle 90 simulation seconds of fictional Rocket moves. Pads return after 20 seconds; the stock Rocket Roadster remains capable permanently.
- At a marked parking playground, open **Actions** for Park It or Cut the queue. At an island race start, choose a course and join/start through Actions. Cars can bump during races. Keyboard users can reach these actions with Tab and Enter.
- Enter the same room code on multiple devices, or use **Invite** to copy its URL. Invite links open the menu; joining is explicit.

## Boundaries

This is a working foundation, not GTA-scale content or a persistent MMO. Four station identities are sourced from Tesla, but their game positions are compressed artistic placements. Compressed-air refills, repeated air jumps and the game’s thrust and suction tuning are fictional. The Rocket is inspired by a prototype, not a production-car specification. No live charging availability, payment, telemetry, account, or Tesla API integration. No affiliation is implied.

Rooms are ephemeral and public-by-code. No authentication, persistent progression, saving, shooting, or death/respawn yet. Delivery money is fictional and session-only. Traffic is deterministic arcade driving, not real AV software. Combat and recovery expansion are designed in `docs/DESIGN.md`. Room state resets on deployment, runtime restart, or last disconnect. Room codes are not access control.

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
shared/ferry.ts     Authoritative ferry and passenger attachment
shared/rocket.ts    Vehicle-local temporary Rocket pickups
shared/island-stunts.ts  Shared bank and cliff surfaces
shared/oval-bank.ts  Shared speed-oval geometry and surface contacts
shared/dome*.ts     Rocket Dome geometry and surface collisions
shared/soccer.ts    Authoritative ball, goals and match state
shared/parking*.ts  Parking playground definitions and rounds
shared/race*.ts     Island courses and race rounds
worker/protocol.ts  Input parser and room capacity policy
worker/index.ts     HTTP routing and one Durable Object per room
src/session.ts     Solo/multiplayer transport adapter
src/controls.ts    Keyboard and multitouch intent adapter
src/audio.ts       Synthesized music, effects and volume buses
src/audio-events.ts  Presentation cues derived from world snapshots
src/camera.ts      Cockpit and chase camera poses
src/scene.ts       Three.js world and camera
src/bay-world.ts   Compressed Bay Area environment and landmarks
src/island-stunts.ts  Bank and cliff meshes from shared geometry
src/rocket-dome.ts  Dome, goals and ball visuals
src/vehicles.ts    Replaceable procedural visual models
src/main.ts        Menu, instruments, action wiring, minimap
src/style.css      Tailwind entry and responsive visual treatment
tests/             Simulation, protocol and live connection checks
```

No framework is needed for this small HUD. Keep the simulation independent from Three.js, the DOM, and Cloudflare. Keep pnpm lockfile committed. Alternative UI or art implementations should obey the contracts before adding dependencies or changing shared gameplay.

## License and attribution

First-party source, documentation and original procedural assets are [MIT licensed](LICENSE). The highway source extract and generated traces are © OpenStreetMap contributors, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/); see [map provenance and the reproducible bake](docs/MAP.md). Third-party dependencies have their own licenses; the bundled three.js notice is in [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt). Restaurant names identify real places, with fictional in-game locations and no affiliation. Tesla, Waymo, Cruise and Zoox names identify the vehicles that inspired this independent project; they do not imply endorsement, and the MIT license does not grant trademark rights.
