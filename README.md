# Tesland

Formerly Poly AV and Bay Drive. In our fictional 2050, the Roadsters have finally arrived and Tesla and SpaceX run the Bay. You are a delivery driver making your own way through it. A small, playable multiplayer driving sandbox inspired by the San Francisco Bay Area. Pick up food and deliver it for cash, dodge police, jump and flip a Roadster, swap cars, and refill compressed air at real-world Tesla Supercharger identities placed on a deliberately compressed map. Start in San Francisco and unlock Oakland, the Peninsula, Fremont and San Jose through deliveries; the full circuit is about 19.9 game km. The Golden Gate and Rocket Dome are available from the start.

**[Play Tesland](https://tesland.swyx.io)** · [Changelog](https://tesland.swyx.io/changelog/) · [Dev blog](https://tesland.swyx.io/blog/) · [The story](https://tesland.swyx.io/lore/) · [Staging preview](https://staging-bay-drive.swyxio.workers.dev) · [Contribute](CONTRIBUTING.md) · [Deploy your own](docs/DEPLOYMENT.md)

See [verification](docs/VERIFICATION.md) for observed checks and known limitations, the [performance audit](docs/PERFORMANCE_AUDIT.md) for benchmarks, and [headless playtesting](docs/HEADLESS_PLAYTESTING.md) for repeatable recordings and local agent controls.

![Driving across the Bay Bridge toward Oakland](docs/screenshots/bay-bridge-drive.jpg)

**Delivery:** Pick up at a gold marker and stop at the customer. Reach the restaurant quickly for a pickup bonus, then beat the active-time delivery estimate for another bonus; late deliveries pay less. Current cash determines your level and which regions are open; purchases and tickets can lower it again. The HUD shows the next milestone. Flying near police can lead to a citation; some rocket-equipped orders lead to rooftops. See [delivery design](docs/DELIVERY.md).

**Research tour:** Find the blue rings at UCSF Parnassus in SF, the Berkeley Campanile, Stanford’s Hoover Tower and SFO’s control tower; the map labels each landmark. Stop in each ring for a one-time award: UCSF pays $250; Berkeley pays $400 and gives 20% off efficient nozzles; Stanford pays $600 and gives 20% off sport motors; SFO pays $600 and gives 20% off air tanks. Complete a delivery to SFO for an additional $1,000 achievement. Open **Actions → Awards** to see each goal.

**Mars mission:** Open 🚀 Mars mission to see the global $1 billion goal. Eligible earnings count automatically across drivers and rooms without spending cash. Once funded, reach level 2, stop in the gold ring at the fictional Fremont spaceport and board for the To Mars achievement and victory. You can keep exploring afterwards.

**Sound and radio:** Use **♫** to choose the original 8-bit soundtrack or a random episode from the last two months of Latent Space or ThursdAI. Play, pause and skip episodes while driving; master, music/radio and effects levels are separate. The station and sound preferences stay on this browser. Podcast audio streams from the publisher. See [audio design](docs/AUDIO.md).

**Rocket Dome:** Drive through the entrance on the China Basin waterfront or choose Rocket Dome in the Mini-games picker. Hit the ball into either colored goal; the first color to five ends the match. The last driver to touch the ball gets the goal, and the driver with the most goals wins (ties share the win). Finish a match after touching the ball to earn achievements for the Roadster · Rocket or a rocket-retrofitted car; winning with credited goals can unlock more, including a stock-car challenge. Rocket-equipped cars can drive up the curved walls and across the ceiling; keep moving above the gold wall line to refill air. Drive out to SF, or use Leave Dome to return to a checked SF or island spawn based on where you entered.

**Global chat and saved drivers:** Pick a driver name and chat with players across rooms. Names in use get a suffix such as `#2`. By default, the game saves your driver and remembers its recovery code in this browser; you can turn off browser remembering. Copy the code to use the same driver on another device. Keep it private: anyone with it can use the identity. Recovery restores your cash, delivery progress, achievements, owned Vault vehicles and purchased vehicle configurations.

**Map and mini-games:** Open the map to choose an accessible destination; double-tap Shift or tap **Self-drive to delivery** for the current pickup or drop-off. Street Pilot can try to rejoin roads and recover from a blockage. In the SpaceX shop, buy Ludicrous Leap for traffic hops and Maximum Plaid for flight and helpful air currents; both need rockets. Select the mode for your next trip, and use the driving controls to take over. Rooftop orders still require manual flight. The Mini-games picker offers quick entry to the Dome, parking games and island races.

**Scores and awards:** Scores show delivery milestones, room standings and current or recently observed mini-game results. Results last for the drive. Awards show your progress and save status; confirmed awards follow a saved driver across drives and devices.

**Tesland in 2050:** Cross the Golden Gate to the wooded Marin headlands, where the fictional First Delivery Monument celebrates the Bay’s most important cargo. Its base is solid and landable. See [the setting](content/lore.md).

**Bay sights:** Explore 100 additional low-poly landmarks around San Francisco, Marin, Oakland, Berkeley, the Peninsula, Fremont and San Jose, plus Twin Peaks and Mount Tamalpais. Three small, drivable hills evoke those summits and Mission Peak. Locations, sizes and slopes are playful approximations. Roadside billboards advertise fictional parody tech companies. See [map details](docs/MAP.md) and the [northern](docs/BAY_LANDMARKS_NORTH.md) and [southern](docs/BAY_LANDMARKS_SOUTH.md) place references.

**Fleet:** Choose from 11 Teslas. Waymo, Cruise and Zoox vehicles join the Teslas in parked and NPC traffic; exit your car and take one from the street. All 26 families are drivable. Published versus estimated values are documented in [fleet research](docs/FLEET_RESEARCH.md).

**The Vault:** Find the luxury showroom in Palo Alto near Stanford to buy six high-end cars and motorcycles. Collect an owned vehicle at the Vault or a workshop, and customize its paint and decals. Purchases and collection milestones unlock one-time achievements. See [the showroom guide](docs/LUXURY_SHOWROOM.md).

**Rocket shops:** Collect a purple Rocket pickup to equip a car for flight for the session, or buy a kit with delivery cash at a fictional SpaceX shop. An optional OTA subscription costs $100 per game hour (two real minutes) and opens the shop remotely; it pauses when renewal cannot be paid and resumes when funded. Buy efficient nozzles, larger air tanks, a sport motor, impact armor, repairs, air, paint and decals. Finishes unlock across cash levels, and purchased configurations follow your saved driver by vehicle model. See [upgrades and locations](docs/UPGRADES.md).

**Sky currents:** Fly into blue lanes for free speed and air, or ride the golden thermal beside the Transamerica Pyramid for lift and air. Jump into a thermal or double-jump into the low lane over the Bay approach; higher lanes reward exploration. The minimap marks their footprints and lane direction. These are fictional arcade currents, not live weather. See [sky currents](docs/SKY_CURRENTS.md).

**Release history:** The menu shows the current release and, after a successful drive starts, the last-played version and time saved in this browser. The changelog highlights known releases since that visit. History starts with 0.0.1 Alpha; earlier visits cannot be recovered. Browser storage is local to the origin and may be cleared or unavailable. See [publishing notes](docs/PUBLISHING.md).

**Start here:** [agent contracts](docs/CONTRACTS.md), [game design](docs/DESIGN.md), [asset brief](docs/ASSETS.md), [fleet verification](docs/FLEET_VERIFICATION.md), [ready-to-use agent tasks](docs/AGENT_TASKS.md).

**Planning:** [economy implementation guide](docs/ECONOMY_IMPLEMENTATION.md), [economy and property proposal](docs/ECONOMY.md), [luxury showroom](docs/LUXURY_SHOWROOM.md), [player progression simulations](docs/ECONOMY_SIMULATIONS.md), and [five-minute earnings and branching paths](docs/ECONOMY_FIVE_MINUTE.md).

**North Bay Playground:** Take the autonomous ferry from the north SF dock to a fictional island with redwood groves, vineyard rows, a banked speed oval, a separate banked lane, an inverted cliff, two eastbound jump ramps and a short circuit. Purple Rocket pickups equip any vehicle with the Roadster's fictional air moves for the rest of its session. Parking playgrounds, charging lots and Caltrain-area lots offer Park It and Cut the queue. These are session-only arcade activities; see [implementation status and remaining checks](docs/ROCKET_ISLAND_PLAN.md).

**Caltrain and campuses:** Explore compressed, fictional interpretations of Caltrain stops from San Francisco to San José, joined by decorative tracks, local streets and short optional sky lanes. The tracks do not simulate train service. Real company names identify original miniature campus landmarks; game placement is invented. See [the map notes](docs/MAP.md) and [campus references](docs/TECH_CAMPUSES.md).

## Run

Node 22 and pnpm 10.33.1 are recommended. No credentials are needed locally.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm dev:server
# http://localhost:8787 serves both client and WebSocket server
```

For frontend hot reload, leave Wrangler running and start `pnpm dev` in another terminal. Vite proxies `/api` and WebSockets to port 8787. The room server runs the multiplayer simulation in local development and on Cloudflare.

```sh
pnpm run ci # tests, TypeScript checks and production build
pnpm exec tsx tests/radio.integration.ts http://localhost:8787
pnpm exec tsx tests/room.integration.ts http://localhost:8787
pnpm exec tsx tests/chat.integration.ts http://localhost:8787
pnpm exec tsx tests/chat-restart.integration.ts # starts an isolated local Worker
pnpm exec tsx tests/mars-restart.integration.ts # isolated Worker with endgame test fixture
pnpm exec tsx tests/capacity.integration.ts http://localhost:8787 8
```

The network checks need the local Worker running. See [deployment](docs/DEPLOYMENT.md) for a separate Cloudflare deployment and the native build/preview workflow; deploying is not needed to contribute.

### Controls and gamepads

Open **Controls & gamepad** from the start screen or the Actions menu to customize up to two keyboard keys per action, or restore defaults. Bindings stay in this browser; touch controls are unchanged. Space brakes and drifts on the road and flips in the air by default. Browser shortcuts remain available.

Standard-mapped Xbox/PlayStation-style controllers use the left stick to steer, right trigger to accelerate and left trigger to brake and then reverse (or fly backward). A/Cross jumps and holds to hover, X/Square flips, B/Circle boosts, and the bumpers or right stick roll. D-pad up enters/exits, down changes camera, left unsticks and right toggles autopilot. Menu/Options opens the menu; use keyboard, mouse or touch in menus. A controller must return to neutral after connecting, focus loss or a menu before driving resumes. Non-standard controllers are reported as unsupported.

The trigger layout follows familiar racing conventions ([Forza Motorsport accessibility notes](https://forums.forza.net/t/meet-the-most-accessible-forza-motorsport-ever/597587/38)); browser controller detection uses the [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

## Play

- **WASD / arrows:** accelerate, reverse, steer. **Space:** brake; steer while braking to drift, then release to regain grip.
- **E:** tap to jump (or fictional air jump), hold to hover; J also works. **Space** in the air or **X:** one-tap flip. **Shift:** boost. **Q/R:** manual airborne roll. W/S provide forward/reverse thrust in the air; A/D turn. Powered flight corrects sideways or opposing momentum to help aim. Air jumps restore upward speed without stacking it indefinitely.
- **F:** exit a stopped car / take the nearest empty car within 7 world meters.
- **V:** toggle autonomous cruise (manual input takes over). Double-tap **Shift** or use **Self-drive to delivery** to route toward the current delivery goal. **G:** Tesla fleet catalog; select a new ride while stopped. **B:** enter a shop when stopped in its purple ring.
- **L:** delivery standings and mini-game results. **T:** awards, progress and save status.
- **C / Actions → Camera:** cycle chase, first-person cockpit, and wide view. The cockpit follows the car through flips; on foot it falls back to chase. First-person time and whole first-person deliveries appear on the session leaderboard as self-reported. **K:** unstuck recovery, preserving air and condition.
- Touch: steering and pedals; hold Brake while steering to drift. Drive also thrusts forward in the air; Flip has its own button. Tap Jump / Hover to jump and hold it for fictional thruster hover. Boost, manual roll, brake and toolbar actions support portrait and landscape.
- Each rocket-equipped car starts with a Level 1 tank twice the original capacity. Buy Levels 2–5 at fictional SpaceX shops; each doubles capacity and refills the tank.
- Stop inside a mint station ring or marked charging bay to refill air. Green diamonds repair; amber diamonds refill air. Each also gives $5 and returns after 20 seconds.
- At the north SF dock, drive onto the stationary ferry and stop completely on deck. Cars are secured during a crossing; drive off on arrival. The HUD and dock signs show ferry status and countdown; painted walking lanes, visual gates and a nearby horn mark the crossing.
- Drive over a purple Rocket pickup in a car to refill air and grant that vehicle fictional Rocket moves for the session. Pads return after 20 seconds. Permanently equipped cars only collect them when they need air; a full car leaves the pad for others.
- Choose Park It or Cut the Queue under **Actions → Mini-games**. At a parking playground, charging lot or Caltrain lot, the game uses that lot; otherwise it takes you to a playground. Races are in the same menu. Cars can bump during races. Keyboard users can reach these actions with Tab and Enter.
- Opening the game joins the shared `bay` room, or the room named by an invite link. Use **Invite** to copy the current link; the menu also offers another room. A full or disconnected room offers retry or another room.

## Boundaries

This is a working foundation, not GTA-scale content or a persistent MMO. Twenty station identities are sourced from Tesla; four air stations in Berkeley, Mill Valley and Corte Madera are fictional. Their game positions and surroundings are compressed artistic placements; see [station sources](docs/STATIONS.md). Compressed-air refills, repeated air jumps and the game’s thrust and suction tuning are fictional. The Rocket is inspired by a prototype, not a production-car specification. No live charging availability, payment, telemetry, or Tesla account/API integration. No affiliation is implied.

Rooms are public-by-code. Room simulation resets on deployment, runtime restart, or last disconnect; saved driver progress and the global Mars goal persist. Room codes are not access control, and room labels are self-asserted. Global chat retains a recent, transient history, which disappears on server restart. Traffic is deterministic arcade driving; shooting and death/respawn are not implemented.

Rooms default to **64 players**, with retry or another named room when full. Automatic overflow is not implemented; see the [overflow plan](docs/ROOM_OVERFLOW_PLAN.md). This limit is provisional, not validated playable capacity: a previous same-host 64-client test showed substantial simulation slowdown. `MAX_PLAYERS` remains configurable up to 128 for explicit, bounded experiments. Active real-time rooms incur Durable Object duration and request usage; they do not hibernate while physics runs. Never advertise a connection limit as tested gameplay concurrency. See [verification](docs/VERIFICATION.md).

To investigate capacity, `pnpm exec tsx scripts/load-room.ts http://localhost:8787 8 60` opens synthetic clients in a new disposable room, sends game inputs and reports snapshot rate, gaps, volume and simulated time. The script accepts only local servers because it generates substantial network and Worker usage; choose a client count up to the configured room limit. This is a synthetic check, not proof of player experience or sustained production capacity.

## Layout

```
shared/game.ts      Pure authoritative simulation and world schema
shared/map.ts       Shared land, bridges, road and collision geometry
shared/north-landmarks.ts  Northern Bay place identities and footprints
shared/south-landmarks.ts  Peninsula, Fremont and South Bay place identities
shared/billboards.ts  Fictional roadside signs and placement
shared/vehicles.ts  26-model registry with provenance and tuning
shared/upgrades.ts  Fictional shop locations, prices and eligibility
shared/sky-currents.ts  Shared sky-lane and thermal volumes
shared/physics.ts   Oriented bodies and mass-based collisions
shared/traffic.ts   Deterministic autonomous routes and traffic demand
shared/navigation.ts  Lane-graph routing for player-selected destinations
shared/delivery.ts  Orders, restaurant data, cash and active-time scoring
shared/police.ts    Police detection, chase and severity-based tickets
shared/achievements.ts  Session awards and flight tracking
shared/day.ts       Accelerated day clock and demand profiles
shared/bridge-signal.ts  Shared Bay Bridge approach meter
shared/stations.ts  Curated real station provenance + game placements
shared/ferry.ts     Authoritative ferry and passenger attachment
shared/island-stunts.ts  Shared bank and cliff surfaces
shared/island-jumps.ts   Shared island launch ramps and landing contacts
shared/oval-bank.ts  Shared speed-oval geometry and surface contacts
shared/dome*.ts     Rocket Dome geometry and surface collisions
shared/soccer.ts    Authoritative ball, goals and match state
shared/parking*.ts  Parking playground definitions and rounds
shared/race*.ts     Island courses and race rounds
worker/protocol.ts  Input parser and room capacity policy
worker/index.ts     HTTP routing and one Durable Object per room
worker/global-chat.ts  Global chat and optional saved identities
src/session.ts     Multiplayer transport adapter
src/map-dialog.ts  Destination selection and autonomous driving controls
src/minigames.ts   Quick entry to shared mini-games
src/controls.ts    Keyboard, gamepad and multitouch intent adapter
src/audio.ts       Synthesized music, effects and volume buses
src/radio.ts       Local podcast selection and playback
worker/radio.ts    Cached public-podcast episode metadata
src/audio-events.ts  Presentation cues derived from world snapshots
src/camera.ts      Cockpit and chase camera poses
src/scene.ts       Three.js world and camera
src/sky-currents.ts  Animated sky-lane and thermal markers
src/bay-world.ts   Compressed Bay Area environment and landmarks
src/north-landmarks.ts, src/south-landmarks.ts  Original procedural landmark art
src/billboards.ts  Original parody billboard art
src/island-stunts.ts  Bank and cliff meshes from shared geometry
src/island-jumps.ts  Island launch ramp meshes from shared geometry
src/rocket-dome.ts  Dome, goals and ball visuals
src/dome-stadium.ts  Decorative stadium architecture and wall-charge markings
src/vehicles.ts    Replaceable procedural visual models
src/main.ts        Menu, instruments, action wiring, minimap
src/style.css      Tailwind entry and responsive visual treatment
content/releases.ts  Dated release notes and current game version
content/posts/     Markdown development posts, rendered to static pages at build
scripts/build-public-pages.ts  Blog and changelog page generator
tests/             Simulation, protocol and live connection checks
```

No framework is needed for this small HUD. Keep the simulation independent from Three.js, the DOM, and Cloudflare. Keep pnpm lockfile committed. Alternative UI or art implementations should obey the contracts before adding dependencies or changing shared gameplay.

## License and attribution

First-party source, documentation and original procedural assets are [MIT licensed](LICENSE). The highway source extract and generated traces are © OpenStreetMap contributors, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/); see [map provenance and the reproducible bake](docs/MAP.md). Third-party dependencies have their own licenses; the bundled three.js notice is in [THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt). Restaurant names identify real places, with fictional in-game locations and no affiliation. Tesla, Waymo, Cruise, Zoox and SpaceX names are used for fictional game content; they do not imply endorsement, and the MIT license does not grant trademark rights.
