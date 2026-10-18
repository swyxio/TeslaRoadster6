# Verification · 2026-10-17 Pacific

## Rocket shop feedback and restart fix · protocol v13 · 2026-10-17 Pacific

- `pnpm run ci` passed 157 tests, both typechecks and the build; Vite's existing chunk-size warning remains. Regression checks cover reused retrofit meshes, solo purchase results and validated request IDs.
- Local Wrangler two-client integration passed with requester-only results for a rejected purchase and a second immediate request. Successful multiplayer purchases remain covered by shared simulation, not a live room transaction; this is not a load test.
- Staging preview of commit `39b41c4` returned protocol v13, matched the locally built browser assets, and passed the same two-client integration. This is not a load test.
- Chrome desktop solo with a temporary, removed fixture: a Model 3 bought a rocket for $60 from $200, displayed “Rocket kit installed” and showed the retrofit; restarting the same Model 3 removed the hardware and showed no air tank. Chrome 390×844 portrait touch emulation bought the kit and displayed its confirmation; 844×390 landscape showed it after scrolling the shop. The fixture is absent from the built source. No physical device was tested for this follow-up.

## Rocket shops integrated with Rocket Dome · protocol v12 · 2026-10-17 Pacific

- After merging the dome implementation, `pnpm run ci` passed 156 tests, both typechecks and the build; Vite's chunk-size warning remains. A new regression drives an upgraded Zoox onto the dome walls and verifies the kit survives travel.
- Local Wrangler's two-client room integration passed for dome entry, a shared ball impact and goal, exit, Tesla-only selection, upgrade snapshot fields and a rejected purchase. Successful purchases remain covered by the shared simulation and solo UI fixture, not a live room transaction. This is not a load test.
- The staging preview of commit `976a204` returned protocol v12 and served the locally built browser assets. Its two-client integration passed the same room checks, including a rejected purchase. This is not a load test.
- Chrome desktop showed both Rocket Dome and Shop in Actions, shop distance guidance, and a working trip to the dome. Chrome 390×844 portrait and 844×390 landscape emulation showed the combined driving layout; in portrait, an emulated touch opened Actions and Shop displayed its nearest-shop guidance. The shop purchase dialog was checked in both orientations before dome integration (below). No physical phone was tested.

## Rocket pickups, Tesla fleet and workshops · pre-dome protocol v11 · 2026-10-17 Pacific

- `pnpm run ci` passed 124 tests, both TypeScript checks and the production build. The existing JavaScript chunk-size warning remains. Tests cover all 26 families collecting a rocket kit and jumping, Tesla-only selection, shop eligibility and costs, installed upgrade effects, geometry and independent retrofit plumes.
- Local Wrangler two-client room integration passed, including replicated upgrade fields, a rejected non-Tesla selection and a rejected purchase without funds/outside a workshop. Positive purchases were tested in the shared simulation and in the local solo UI, not over a live room. This is not a load test.
- Chrome desktop solo: chose a Model 3, drove through a purple rocket pickup, saw retrofit hardware and the installation notice, and jumped with air consumption. The Tesla-only fleet displayed all 11 models. A temporary, local-only fixture placed a damaged Model 3 and test cash inside the Mission shop: buying all five items reduced $200 to $3, with installed/full states shown. The fixture was removed before building.
- Chrome emulated 390×844 portrait and 844×390 landscape: inspected shop and driving layouts, purchased a kit, and opened/closed the shop with emulated touch after accounting for the browser emulation's input scaling. The landscape shop scrolls for its footer. These are emulation observations, not physical-device evidence.
## Rocket Dome production · 2026-10-17 Pacific

- The production Cloudflare build for merge `884bab5` completed successfully, and `/api/health` returned protocol v11. The live two-client room integration passed for cockpit state, arena entry, shared ball impact, replicated goal, exit and existing room checks; it was not a load test.
- Chrome desktop opened the live solo game and the Rocket Dome; the field, ball and first-to-five scoreboard were visible. Local desktop and touch-emulated playtests are documented below; no physical-device or production frame-rate test was performed.

## Rocket Dome with cockpit · protocol v11, local build · 2026-10-17 Pacific

- After integrating the cockpit update and correcting natural arena entry and long-vehicle wall clearance, `pnpm test` passed 147/147 and `pnpm build` passed; the main JavaScript is 697 kB (195 kB gzip) and Vite still reports its chunk-size warning. Simulation regressions cover first-person order eligibility, grounded and airborne entry, overflight, police/delivery policy and yaw-projected wall clearance.
- Local Wrangler two-client integration passed for cockpit state, arena entry, ball impact, a goal observed by both clients, arena exit and existing room checks. An earlier run overlapped a Wrangler reload and timed out; the stable rerun passed. This is not a load test.
- Chrome desktop showed the arena and switched to cockpit view. In 390×844 touch emulation, driving in cockpit scored a blue goal and climbed to 22 m; switching camera showed the field again. In 844×390 landscape emulation, score and controls remained visible. A subsequent 390×844 touch-emulated drive brought a Tesla Semi to a side wall and stopped it. The browser reported no console errors. No physical device, multi-touch reliability, frame rate or motion-comfort test was performed.

## Cockpit view · protocol v10 · 2026-10-17 Pacific

- After merging the road-first HUD, `pnpm run ci` passed 116 tests and the production build; local Wrangler two-client integration replicated cockpit selection, active time and switching back, alongside existing multiplayer checks. Camera pose tests cover pitch and roll; simulation tests cover complete and mixed-view runs, paused intervals, on-foot use and malformed flags. Camera claims are not anti-cheat proof.
- The staging deployment of commit `b49338e` returned protocol v10 and matched the locally built browser assets. Its live two-client room integration passed, including cockpit state replication; this was not a load test.
- Chrome desktop solo: switched to cockpit, drove, jumped and flipped with the view rolling with the vehicle, and saw first-person active time in the leaderboard. Chrome 390×844 portrait and 844×390 landscape emulation showed dashboard guidance and driving controls; the on-foot chase fallback and a switch to Model 3 were observed before the HUD merge. After integration, the phone action drawer switched views and a projected restaurant sign appeared when driving toward the pickup. No browser console errors were captured. These are browser emulation, not physical touch, frame-rate or motion-comfort tests.

## Alcatraz Rocket Dome · protocol v10, pre-cockpit local build

- After integrating the sound and road-first HUD updates, `pnpm test` passed 135/135 and `pnpm build` passed; the main JavaScript is 692 kB (194 kB gzip) and retains Vite's chunk-size warning. Simulation tests cover both goals, goal colors, fifth-goal reset, wall and ceiling ball strikes, and car collisions on the arena surface.
- Local Wrangler two-client integration passed for arena entry, a car moving the shared ball, a goal score observed by both clients, arena exit and the existing room checks. This is not a load test.
- Chrome desktop solo: scored a goal by driving into the ball, returned to the Bay and re-entered, then drove the Rocket up a wall to 22 m and onto the 50 m ceiling with the field and ball visible. A later shot into the blue goal increased the blue score. The combined build's reloaded ceiling playtest showed no console errors.
- Chrome touch emulation: the combined build's portrait 390×844 accelerator moved the car to 184 km/h and scored; portrait and 844×390 landscape showed the score and controls. No physical device, multi-touch or frame-rate measurement was performed.
- The arena is reached by direct travel; the planned ferry and broader Rocket Island playground are not implemented. Non-Rocket vehicles remain inside the arena without wall adhesion.

## Synthesized audio with Bay integration · 2026-10-17 Pacific

- After integrating the protocol-v9 Bay expansion, `pnpm run ci` passed 111 tests and the build. The existing chunk-size warning remains. Audio tests include supported landing on elevated roads and rooftops and a near-full station refill.
- Local Wrangler two-client integration passed with protocol v9 and surface identity. Chrome desktop opened the sound dialog during a solo drive; 390×844 portrait and 844×390 landscape emulation showed the combined sound dialog. These checks do not establish physical touch or subjective listening quality.

## Synthesized audio · pre-Bay-integration, 2026-10-17 Pacific

- `pnpm run ci` passed 56 tests, both typechecks and the production build; the existing Vite chunk-size warning remains. Audio event tests cover delivery, pickup, citations, achievements, police pursuit, jump, landing, impacts, refills, vehicle changes and repeat snapshots.
- In local Chrome, the sound dialog opened from the menu and during solo driving; mute, music volume, test cue and preference restoration after reload were exercised. Chrome 390×844 portrait and 844×390 landscape emulation showed the sound controls; emulated pointer actions did not activate the HUD button, although it worked at the desktop viewport. Physical touch remains unverified.
- A temporary browser fixture measured nonzero Web Audio output for all 11 event cues and for music, wind, thrust and siren; muting reduced the measured signal to zero. This verifies signal generation, not speaker output, subjective mix quality or listening on real devices.

## Bay circuit deployment · 2026-10-17 Pacific

- Cloudflare Workers Builds deployed merge commit `a0dff9546de09c8d626300a1a5125d9b11ef0d73` successfully. Worker version `2f7d5efe-11b7-40c6-a6a6-b19ce5ddc775` served `/api/health` with protocol 9 and capacity 64.
- The deployed two-client room integration passed for join, traffic, clock, support, movement, delivery, police, stunts, vehicle selection, autonomous mode, invalid input and disconnect cleanup. This was not a production load test; touch and peak-traffic limitations below still apply.

## Bay circuit, achievements and citations · protocol v9, local build

- `pnpm test` passed 104/104, including first-frame and support-aware achievements, severity-based police citations, rooftop delivery, Bay traffic and keyboard/touch input simulation. `pnpm build` passed; Vite warns about the 655 kB main JavaScript chunk (181 kB gzip).
- Local Wrangler two-client integration passed for protocol, room clock, traffic, support identity, deliveries, police, stunts, fleet and disconnects. An eight-second same-host 64-client smoke passed with at least 65 snapshots/client and a 145 ms p95 inter-snapshot gap. That new-room run started at dawn with no ambient takeovers; it did not exercise the 34-car peak target or the 68-car optional reserve. This is not a production, WAN or sustained-load test.
- A separate instrumented 64-client rerun had at least 66 snapshots/client and a 139 ms p95 gap. Across recipient snapshots, individual maxima were 123 entities, 33 NPCs, 3 ambient cars and 111,155 UTF-8 bytes; the largest observed room time was 7.7 seconds. These are recipient-specific maxima, not room-wide counts: interest filtering hides distant unattended vehicles. A new room begins with 41 NPCs including 11 ambient cars; maximum reserve and worst-case snapshot workloads remain untested.
- Local Chrome desktop: drove the Bay Bridge, used Space to brake and J to jump, and opened and closed Awards. Chrome 390×844 portrait and 844×390 landscape emulation showed the driving HUD and Awards dialog. Automated touch taps did not visibly register in the final emulation; input-to-simulation tests cover touch jump and brake, but physical touch, multitouch and frame rate remain unverified. The landmark/terrain and traffic limits below still apply.

## Ambient traffic reserve · historical pre-achievements integration, 2026-10-17 Pacific

- A synthetic morning reconciliation test with one stationary observer and available hidden spawn sites reached the 34-car unattended target at 07:30; the largest shortfall was one car while demand rose from 14 at 06:30. The five-second interval is unchanged. This fixture does not establish actual rush-hour throughput or capacity when visibility, spacing or the reserve constrain placement.
- Focused tests cover takeover replacement, off-route and city-route disconnect, the 68-car optional pool cap and preservation of occupied, visible or blocked cars during reclamation. These are simulation tests, not a new load or production measurement.
- After this change, `pnpm test` passed 88/88 tests and `pnpm build` passed (648 kB / 179 kB gzip main JavaScript; the chunk-size warning remains). Local Wrangler two-client integration passed. An eight-second same-host 64-client smoke passed with at least 70 snapshots/client and a 120 ms p95 inter-snapshot gap; it started at dawn without takeovers and did not test peak or reserve ambient population. It is not a sustained, WAN or production capacity test. Browser playtests below preceded the reserve fix, which changed traffic reconciliation rather than controls or rendering.

## Keyboard controls · historical pre-Bay build, 2026-10-17 Pacific

- `pnpm test` passed 41 tests and `pnpm build` passed; the input tests cover Space braking without jumping, J jumping, and touch brake and jump. The existing Vite chunk-size warning remains.
- Local Chrome desktop solo: accelerated, used Space to stop, then pressed J and observed the Roadster airborne with air use. Touch-emulated 390×844 portrait and 844×390 landscape layouts showed the controls. Physical touch and multi-touch remain unverified.

## Bay circuit with drift, Rocket and pickup rewards · historical pre-reserve protocol v8 build

- `pnpm test`: 84/84 pass, including Bay traffic, elevated support, drift, stunt inputs, all fleet models and delivery rewards. `pnpm build` passed; Vite still warns about the 647 kB JavaScript chunk (179 kB gzip).
- Local Wrangler two-client integration passed, including remote drift, room clock, traffic, surfaces, delivery, police and stunts. An eight-second same-host 64-client smoke saw at least 69 snapshots per client and a 128 ms p95 inter-snapshot gap; this is not a sustained, WAN or production capacity test.
- Local Chrome desktop: accelerated to 195 km/h on the Bay Bridge, then Ctrl plus steering turned and slowed the car. Chrome 390×844 portrait touch emulation drove and jumped at 73 km/h with 76% air remaining; 844×390 landscape showed the map, Brake and flight controls. No physical device, multi-touch handling or frame rate was verified.
- NPC lane changes, I-280 and additional crossings are not implemented. Traffic situations are fictional arcade approximations; hill, overpass, ramp and loop physics have simulation coverage but were not all manually driven in the browser. No new deployment was verified by these local checks.

## Drift controls · historical pre-Bay build, 2026-10-17 Pacific

- `pnpm test` passed 41 tests and `pnpm build` passed, including authoritative sliding, return to grip, straight braking and Ctrl/touch input release. The existing Vite chunk-size warning remains.
- Local Wrangler two-client integration passed with drift lateral motion visible in the second client's snapshot. This is not a load test.
- Local Chrome desktop solo: accelerated, then used Ctrl plus left steering and observed the car turn and slow. The control help was visible. Chrome touch-emulated 390×844 portrait and 844×390 landscape showed the Brake and steering buttons. Real-device multi-touch and subjective handling remain unverified.

## Bay circuit, Rocket and pickup rewards · historical pre-drift protocol v8 build

- These checks predate the drift-controls merge; they do not verify the current combined build.
- `pnpm test`: 80/80 pass, including both Bay circuit directions, traffic queues and incidents, elevated support, stunt inputs, all fleet models and delivery rewards. `pnpm build` passed; Vite warns about the 647 kB JavaScript chunk (178 kB gzip).
- Local Wrangler health reported protocol 8 and capacity 64; the two-client integration passed for clock, traffic, surfaces, stunts, delivery and police. An eight-second same-host 64-client smoke recorded at least 63 snapshots per client and a 152 ms p95 inter-snapshot gap; it is not a sustained, WAN, mobile or production test.
- In local Chrome desktop, drove the Bay Bridge, switched to the Bay map and jumped at 161 km/h with the pickup timer visible; the built v8 game joined a local multiplayer room. Chrome 390×844 portrait touch emulation accelerated to 76 km/h and jumped, using 24% air; 844×390 landscape showed the map and flight controls after a label-spacing correction. The v7 browser run also checked invalid room validation.
- No physical-device, sustained peak-traffic, WAN or new deployed verification was performed. Ramp and loop physics were exercised by simulation tests, not a completed manual browser route. NPC lane changes, I-280 and additional crossings are not implemented; the traffic scenarios are fictional arcade approximations.

## Pickup rewards and minimap · historical pre-Bay build, 2026-10-17 Pacific

- After integrating the Rocket stunt update, `pnpm run ci` passed 37 tests and both typechecks/build; the existing Vite chunk-size warning remains. Local Wrangler two-client integration passed with protocol v6, pickup-clock replication and the stunt checks. This is not a load test.
- After also integrating nozzle effects, `pnpm run ci` passed 39 tests and the build; local and staging two-client integrations passed with protocol v7, pickup-clock replication and remote thruster effects.
- Chrome desktop and emulated 390×844 portrait / 844×390 landscape showed the larger heading marker, pickup timer and available bonus alongside the updated stunt controls. A separate browser preview of the actual reward component showed the cash card and confetti; simulation tests cover awarding and preventing duplicate payments. A complete positive pickup and its animation were not manually observed together, and no physical device was tested.

## Roadster nozzle visuals · historical v6 branch, 2026-10-17 Pacific

- `pnpm test` (37 tests) and `pnpm build` passed. Tests cover ten nozzle mounts, independent visual clones, actual boost/jump/flip/depleted-air signals and the existing fleet. The Vite chunk-size warning remains.
- Local Wrangler two-client integration passed, including remote rear, corner and side effect flags. An earlier run timed out waiting for autonomous mode; the later run passed after the build and code changes completed. Neither run is a load test.
- Local Chrome desktop playtest showed four rear nozzle rings, rear vapor during boost and downward vapor while hovering. Portrait 390×844 and touch-emulated landscape 844×390 layouts were inspected. Side plumes were checked through model/simulation tests and multiplayer state, not directly seen in a browser playtest. Real device and multi-touch testing remain unverified. A narrow landscape desktop viewport with a fine pointer showed existing HUD overlap; the touch-emulated landscape layout did not.
- No new production deployment is implied by these local checks. The ten-port layout is based on event reporting; exact hardware geometry and firing sequences remain artistic approximations.

## Rocket stunt implementation · historical v6 branch, 2026-10-17 Pacific

- Local simulation checks cover 0–60 mph arcade targets, three jump/flip/landing sequences (99% tank), two flips in one jump, depleted-air driving and falling, inverted thruster hover, the physical ramp, a complete suction loop and detachment. After integrating delivery and police from main, the full test suite and production build passed; Vite retains its existing >500 kB chunk warning.
- Local Wrangler two-client integration passed with authoritative movement, jump, one-tap flip, landing, fleet switching and invalid-input isolation. This is not a load or production test. One earlier integration run was interrupted when a concurrent Vite build caused Wrangler to reload; it passed when rerun after the build.
- Local Chrome desktop: solo jump, flip, landing and 67% remaining air were visible. Chrome 390×844 portrait and 844×390 landscape emulation: layout and changing airborne control labels inspected; keyboard-activated fleet selection and invalid room validation verified. Those observations and screenshots preceded integration of the delivery and police UI: `screenshots/stunt-desktop.png`, `screenshots/stunt-portrait.png`, `screenshots/stunt-landscape.png`. After integration, the desktop delivery HUD and stunt keyboard controls were visible; the combined mobile layouts were not rechecked.
- Chrome's emulated pointer actions in this session did not activate either touch or ordinary toolbar buttons. Pointer handling was exercised with synthetic unit events and keyboard activation worked, but genuine phone touch and multi-finger interaction remain unverified. The ramp and loop have simulation tests, not a completed manual route playtest. No physical device, new load test, or production deployment was verified.

## Bay and Rocket integration · historical v7 intermediate, local build

- These checks used the Bay and stunt integration before the delivery-feedback rebase; they do not verify the combined protocol-v8 build or a deployment.
- `pnpm test` passed 78 tests and `pnpm build` passed, with the existing Vite chunk warning (645 kB / 177.75 kB gzip). Local Wrangler two-client integration passed. An eight-second same-host 64-client smoke recorded at least 60 snapshots per client and a 177 ms p95 delivery gap; this is not a sustained or WAN load test.
- Chrome desktop: drove the Bay Bridge at 189 km/h, toggled the minimap and jumped to 2 m with 76% air remaining. Portrait touch emulation exercised driving at 139 km/h and jumping; landscape controls, invalid-room handling and a local browser multiplayer LIVE state were inspected. Physical devices and frame rate were not checked.

## Bay circuit, terrain and traffic · historical v5 branch, local build

- This section describes the protocol-v5 Bay expansion after integration with delivery and police, before integration with the Rocket stunts and protocol v7. These observations do not verify the later combined v7 or v8 builds. Older deployment observations below refer to earlier builds; they do not establish that this version is deployed.
- `pnpm test` passed 62 tests; `pnpm build` passed both TypeScript checks and the Vite build. Vite still warns that the main JavaScript chunk exceeds 500 kB (about 635 kB / 174 kB gzip). The source extract, generated OSM-derived trace and bake script were emitted as downloadable build assets; a clean temporary bake reproduced the checked-in trace.
- The approximately 19.86 km loop was simulated in both directions. Controlled San Jose bend approaches at initial 160 and 220 km/h stayed within 4.1 m of the centerline in both directions; a 259 km/h boosted reverse approach left the pavement. The fictional hill and overpass, including ramp traversals at 100, 160 and 220 km/h and stacked-vehicle collisions, were checked in simulation. They were not manually driven in the browser.
- Chrome desktop on the local build: drove across the Bay Bridge at up to 183 km/h, saw the Oakland approach, switched the local/Bay map, and lifted to 22 m while air decreased. The 06:00-start clock advanced. Local Chrome 390×844 portrait and 844×390 landscape touch emulation showed the driving controls; portrait acceleration moved the car, and the landscape scores dialog opened and closed. Invalid room input showed the validation message, and a browser joined a local multiplayer room. These checks are emulation, not physical-device or frame-rate evidence.
- Local Wrangler two-client integration passed for clock, terrain support, traffic, delivery/police, fleet selection, remote movement, invalid input and disconnect cleanup. A separate eight-second local same-host 64-client smoke passed: all clients saw all players, minimum 69 snapshots/client and p95 snapshot delivery gap 128 ms. It started at dawn with fewer NPCs than the rush target; it is not a WAN, sustained-load or production test.
- A separate local Node probe at the morning peak used 64 players and 43 NPCs after warm-up. Three repetitions measured 4.18–9.40 ms p95 per 50 ms simulation step, with a 115.8 ms maximum in one run. Another run under concurrent host work measured 166 ms p95. These noisy same-host observations are not a Workers performance guarantee.
- The traffic profile, bridge meter and highway incident are fictional arcade scenarios; the bridge meter controls eastbound NPCs and AVs, not manual drivers. Sparse traffic and synthetic queue tests do not prove realistic Bay congestion. I-280, the other Bay crossings and real interchanges are not implemented. No physical-device, sustained peak-traffic, geographic-latency or new deployed verification has been performed.

## Bay expansion planning (no implementation)

- Added `BAY_EXPANSION_PLAN.md`: source review, proposed map compression/day clock, queue arithmetic, traffic/network budgets and staged acceptance gates. No gameplay, protocol or deployment changes.
- Local current-world serialization probe with 64 players after 100 neutral 50 ms steps: 116 entities, 34,370-byte state JSON. The plan's bandwidth projections are arithmetic, not measured network throughput or production billing.
- `pnpm test`: 18/18 pass. `pnpm build`: both TypeScript checks and Vite build pass; existing >500 kB chunk warning remains. No visual, physical-device or new capacity claim follows from these checks.

## Open-source and staging preparation

- A fresh clone of the public repository passed `pnpm install --frozen-lockfile` and `pnpm run ci` (18 tests, both typechecks, and Vite build). The build retains Vite's warning about a JavaScript chunk over 500 kB.
- GitHub's unauthenticated repository API reports the repository public and its license MIT; private vulnerability reporting is enabled. A targeted scan of reachable text blobs for common credential formats found no matches; this is not a guarantee that history contains no sensitive data.
- Manually deployed Cloudflare Worker Preview `staging` at `https://staging-bay-drive.swyxio.workers.dev`. Health returned protocol version 3 and capacity 64; the deployed two-client integration passed. A simultaneous connection to the same room code in production and staging saw only one player on each side, confirming isolation for that test. The three.js license notice was served from staging.
- Manually deployed production Worker version `008d695b-7dcb-44f8-91cd-7ad12909c8ea`. Health and the two-client integration passed, and the three.js notice was served from production.
- Cloudflare Workers Builds automatically built commit `39e9749` from both `main` and `staging`, running `pnpm run ci` and deploying production and the staging Preview. Both live health checks returned protocol version 3 and capacity 64, and both two-client integrations passed. A same-room-code test after the automatic deployments observed only its own player in each environment for at least five snapshots. Production version: `4d20b472-5d12-440d-8ca0-33b35eaae093`. Build IDs: production `db7ae04e`, staging `65b64b52`.

## Bay geography rebuild

- Hand-authored SF, Oakland, Yerba Buena and Marin land polygons; navigable Bay Bridge and Golden Gate decks, water, waterfront/port, parks, skyline landmarks and corresponding minimap. Geometry is compressed and streets/decks remain flat. See MAP.md for provenance and limits.
- `pnpm test`: 18 tests pass, including both shore-to-shore crossings, water recovery, safe parked cars and a cross-Bay AV round trip. `pnpm build`: browser and Worker typechecks and Vite build pass.
- Local Worker two-client integration passed. Local 64-client same-host smoke passed (8 seconds; minimum 77 snapshots/client, p95 inter-snapshot gap 111 ms). This is not WAN latency, mobile rendering or a sustained load test.
- Deployed Worker version `2a0c90bf-8759-4eac-b813-83c5cb62517c`: health returned protocol version 3 and capacity 64; two-client integration passed. The deployed 64-client same-host smoke passed (8 seconds; minimum 77 snapshots/client, p95 inter-snapshot gap 160 ms). Snapshot delivery gaps are not input latency.
- Chrome desktop: drove from SF across the Bay Bridge to Oakland, observed the bridge above water, Yerba Buena Island and the Oakland charger. Chrome 390×844 and 844×390 with touch emulation: controls and route visible; portrait acceleration exercised. Physical devices and frame rate remain unverified.
- Screenshot: `screenshots/bay-bridge-drive.jpg` from the deployed game. The Golden Gate crossing was tested in simulation, not manually driven in the browser.

## Earlier baseline · historical evidence

## Observed

- Production URL: https://bay-drive.swyxio.workers.dev
- Repository: https://github.com/swyxio/TeslaRoadster6 (private), branch main.
- `pnpm build`: TypeScript and Vite production build passed. Main JS ~529KB uncompressed /137KB gzip. Vite warns about a >500KB chunk; Three.js dominates and is required for first play. No speculative chunking added.
- Simulation/protocol checks cover authoritative driving, lift/air/landing, ownership/car switches, collision, charging, resource-preserving recovery,64-player spawn validity, parser bounds and stable rooftops. All eight tests passed, including pickup refill/expiry.
- Local Wrangler two-client integration passed: both players visible, remote movement, invalid input isolation/close1008, cleanup and route responses.
- Deployed two-client integration passed against workers.dev with the same assertions.
- Local64-client smoke: all connected and saw64 peers; minimum78 snapshots/client; p95 inter-snapshot gap108ms during an8-second measurement.
- Deployed64-client smoke: all connected and saw64 peers; minimum80 snapshots/client; p95 inter-snapshot gap114ms during an8-second measurement. All synthetic clients originated from one machine. The measurement is delivery interval, NOT input latency or end-to-end round-trip time.
- Live `/api/health` returned `{"ok":true,"version":1,"capacity":64}`.
- Chrome desktop visibly verified local solo drive, lift, on-foot exit and car re-entry; deployed room join and Roadster flight (14m altitude with air consuming).
- Chrome tab-scoped device emulation inspected390×844 portrait and844×390 landscape; touch controls visible, combined touch throttle/lift exercised and air consumption observed. Physical device behavior and sustained FPS are not verified. Roll controls were moved into a clear strip above pedals after layout inspection; portrait camera aim adjusted to keep the car above the instruments.
- Screenshots: `screenshots/live-desktop.jpg`, `screenshots/mobile-portrait.jpg`, `screenshots/mobile-landscape.jpg`.

## Known limits / next checks

No sustained load,128-player load, geographic multi-region latency, adversarial abuse soak or actual phone thermals/frame rates tested. Public room codes offer no privacy guarantee. Active rooms use billed DO duration and WebSocket messages; total public-room creation is not globally quota-limited by this app. Monitor usage before broadly promoting the sandbox.

Multiplayer presentation interpolates server snapshots without client prediction; remote latency can be felt. Camera can clip scenery at awkward angles; collision geometry is simplified. Trees/charger posts/bridge furniture are decorative. At that baseline there was no sound, NPC traffic, quests, persistent inventory, shooting or death/respawn; NPC traffic has since been added. At that baseline, playable streets were flat and hills were scenery; the map is not an accurate road network.

## Station provenance

Primary Tesla pages read2026-10-17; site identity/address only, not live stall availability or real air service:

- SF16th Street,2300 16th St: https://www.tesla.com/en_CA/findus/location/supercharger/8739
- SF Geary Boulevard,2675 Geary Blvd: https://www.tesla.com/en_GB/findus/location/supercharger/SanFranciscoCAsupercharger2
- Oakland2nd Street,255 2nd Street: https://www.tesla.com/en_gb/findus/location/supercharger/oaklandcasupercharger
- San Mateo Park Place,1200 Park Place: https://www.tesla.com/en_CA/findus/location/supercharger/sanmateosupercharger

Cloudflare reference: https://developers.cloudflare.com/durable-objects/api/state/ documents a32,768 hibernation-API WebSocket connection ceiling and explicitly notes practical CPU/memory limits. This game uses standard accepted WebSockets and an active physics timer; that ceiling is not its gameplay capacity. Reference: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ .


## 2026-10-17 · Citations and session achievements

In the isolated release worktree, `pnpm run ci` passed; the two-client Wrangler room integration passed on localhost. Shared-simulation tests cover scaling fines, repeat-offense grace, flight above the sight ceiling, supported stunt surfaces, rooftop delivery, ground/air eligibility, and a physically simulated two-jump Bay crossing. In Chrome, a solo flight triggered a pursuit and a real $60 citation; Escape left it open, acknowledgement resumed play, and the wallet showed the deduction. The achievement panel was inspected on desktop and at 390×844 emulated portrait; the citation and touch acknowledgement were inspected at 844×390 emulated landscape. A temporary scene fixture also showed the gold marker above its actual shared rooftop; it did not exercise a full manually driven delivery. These are emulations, not physical-device or multiplayer load tests.

## 2026-10-17 · Road-first HUD

In the isolated worktree, `pnpm test` passed 112 tests after integrating the sound-settings change, including keyboard focus/Tab and Space brake coverage; `pnpm build` passed. Chrome local solo play was inspected at desktop and emulated 390×844 portrait and 844×390 landscape. The action drawer exposed all eight actions, fleet opened, both drawers closed with Escape, and sound settings opened from the action drawer; a citation interrupted and closed the guide and acknowledgement resumed play. After opening the action drawer, an emulated touch on Drive closed it and accelerated to 42 km/h, a touch on Brake stopped the car, and steering showed its pressed state on the same touch; a jump used air and changed Drive to Flip and steering labels to Bank. No physical phone or multiplayer-specific behavior was verified for this HUD change. Screenshots and concept comparison are linked from DESIGN.md.

## 2026-10-17 · Flight controls and arcade tanks

In the isolated worktree, `pnpm test` passed 159 tests and `pnpm build` passed. A local Wrangler two-client room integration verified protocol v13, tank-level snapshots, jump, flip, and forward flight while hovering; this was not a load test. Chrome solo play verified E plus W produced airborne motion (52 km/h before the tank change), and the updated Level 1 HUD and Jump were exercised. Phone emulation at 390×844 and 844×390 showed separate forward, flip, jump, hover and roll controls. These are emulations, not physical-device tests. Tank purchase progression, full refill, prices and capacity doubling through Level 5 were verified in the authoritative simulation tests.

After integrating the shop confirmation follow-up, 161 tests and `pnpm build` passed; the local two-client Wrangler room test passed on protocol v14, including forward flight while hovering and purchase result messages. A focused solo shop test also confirmed a tank purchase reports success, deducts cash and refills. Chrome solo play additionally showed H holding altitude and X producing a visible roll.

## 2026-10-17 · Remote OTA shop

`pnpm test` passed 166 tests and `pnpm build` passed. The local two-client Wrangler room integration and a deployed Cloudflare preview passed with protocol v15, including subscription acknowledgement, paused state and cancellation replication. Shared-simulation tests exercise payment, renewal, insufficient funds, automatic resumption, cancellation, and remote airborne purchases. A controls regression covers delayed jump acknowledgement and preserves brake-before-jump ordering. In Chrome solo play, opening the shop away from a workshop showed the price and allowed enrollment with $0, displaying the paused state. The dialog was inspected at desktop and emulated 390×844 portrait and 844×390 landscape; physical phones were not tested.

One additional local integration run timed out at the existing Tesla fleet-change assertion; a subsequent run passed. The preview integration also passed. This intermittent selection result needs investigation if it recurs.
