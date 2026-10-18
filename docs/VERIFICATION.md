# Verification · 2026-10-18 Pacific

These entries describe separate historical builds. Check the version and scope in each entry before applying its results to another build.

## Main documentation integration · protocol v20 · 2026-10-18 Pacific

- After integrating main's economy proposal and development-blog updates, `pnpm test` again passed 305 tests and `pnpm build` passed both typechecks and public-page generation. Vite retained its large-chunk warning. No gameplay or protocol files changed in this integration; the room and route observations below were made on the earlier v20 build.

## Island, Dome approach and Bay landmarks · protocol v20 · 2026-10-18 Pacific

- At merge `a9f902c`, `pnpm test` passed 305 tests and `pnpm build` passed both TypeScript checks, Vite and public-page generation. The main JavaScript was 831.99 kB (241.27 kB gzip), with Vite's large-chunk warning. Local Wrangler reported v20; its two-client room and global-chat integrations passed. The Cloudflare branch preview served the same asset hashes and v20, and passed the two-client room integration. These checks do not describe the shared production deployment.
- In a local v20 room, one client drove from SF onto the ferry using normal inputs while a second observed. The observer saw the stopped car secured for departure, maintain its deck offset in transit, arrive at the island and drive onto land. Both clients disconnected normally. This was a scripted multiplayer input run, not a browser or physical-device playthrough.
- A separate two-client local v20 run used scripted throttle, steering and braking from spawn, with no position injection. The observer confirmed boarding, secured transit, island arrival and drive-off, then the driver followed the land approach into the Dome. The observer saw the island return side and a normal Dome action return the driver to the island. Both sockets closed normally. This was not a visual or touch playthrough.
- A five-second same-process synthetic run with 64 players, six ferry passengers, four parking entrants, four racers, four Dome players and four oval drivers passed: p95 simulation step 8.80 ms, p95 64-recipient snapshot batch 20.78 ms, and maximum snapshot 127,152 bytes. This is not network, peak-traffic, sustained, mobile or production-capacity evidence.
- Focused simulation tests cover the protected Island–Dome land approach, Bay and island return sides after fly-in, walking, shortcuts, vehicle changes and both ferry destinations. They also cover landmark, billboard and hill clearance around island roads, the ferry, parking and race gates. A review identified and prompted the Bay fly-in return fix and a protocol bump; subsequent independent review found no new actionable issues.
- Chrome desktop solo opened Actions, entered the Dome and returned to the Bay. At 390×844 touch emulation, Drive accelerated 0→81 km/h and Jump reached 5 m; at 844×390, Drive accelerated 0→57 km/h and Jump reached 4 m. Touch opened and scrolled Actions, and a race request away from the island showed the correct start-marker guidance. No console errors were observed. This was emulation, not a physical-device test or a completed race.

## Island with flight steering and release 0.0.2 · protocol v18 · 2026-10-18 Pacific

- At merge `d98a31d`, `pnpm test` passed 284 tests and `pnpm build` passed both TypeScript checks, Vite and generation of two release entries. The main JavaScript was 796.47 kB (229.09 kB gzip), with Vite's large-chunk warning. Local Wrangler's room and global-chat integrations passed. The Cloudflare branch preview built successfully and served the matching JavaScript and stylesheet, protocol v18 and the 0.0.2 release entry; its two-client room integration passed. These checks do not describe the shared production deployment.
- Chrome desktop held Jump/Hover at 5 m while air fell from 72% to 64%, and Actions showed parking and races. At 390×844 touch emulation, holding Jump/Hover stayed at 5 m while air fell from 46% to 37%; at 844×390 it stayed at 5 m while air fell from 23% to 16%. Actions opened in both; a police citation needed dismissal before the landscape action. The changelog marked 0.0.2 as new to a 0.0.1 returning player. No console errors were observed; no physical device was tested.
- Two local Wrangler clients observed a scripted normal-input Park It round at the SF 16th Street charger: the driver reached the lot from spawn, parked in bay `sf-16th-1`, and held for two seconds, finishing in 15.45 simulation seconds. The second client then observed queue join and withdrawal; both sockets closed normally. This did not test a two-entrant queue competition or establish playability at every lot.
- In another local Wrangler room on the same build, two clients observed a normal-input car ferry crossing: boarding at 160.0 s, secured departure at 180.2 s, fixed-offset transit at 196.1 s, island arrival at 225.2 s and drive-off onto ground at 231.4 s. Both sockets closed after completion, with no progression block or state injection. A race was not attempted in this room.
- Independent review of the flight-steering merge found no actionable regressions; focused controls and island-flight tests passed. Earlier load and hosted crossing results below describe the earlier combined build.

## Island with release history · protocol v18 · 2026-10-18 Pacific

- At merge `e697757`, `pnpm test` passed 280 tests and `pnpm build` passed both TypeScript checks, Vite and generation of the public blog and changelog. The main JavaScript was 795.37 kB (228.66 kB gzip), with Vite's large-chunk warning. Local Wrangler room and global-chat integrations passed; `/blog/` and `/changelog/` returned HTML. These checks preceded the subsequent flight-steering integration.
- Chrome opened the changelog, blog index and article, returned to the game, and opened Actions and Controls & gamepad in solo play. After driving and reloading, the menu showed the last-play time and linked to the changelog with the prior release. At 390×844 touch emulation, Drive accelerated 0→72 km/h and Jump reached 5 m. No console errors were observed; no physical device was tested.

## Island with Bay progression, currents and controls · protocol v18 · 2026-10-18 Pacific

- `pnpm test` passed 276 tests; `pnpm build` passed both TypeScript checks and Vite. The main JavaScript was 792.39 kB (227.48 kB gzip), with Vite's large-chunk warning. Local Wrangler reported protocol v18; the two-client room integration, global chat integration and isolated chat-restart integration passed. The Cloudflare branch preview for `1623aba` returned protocol v18, served the same asset hashes as the local build and passed the two-client room integration against its live Worker. These checks do not describe the shared production deployment.
- The local eight-second 64-client smoke passed: minimum 61 snapshots per client, p95 snapshot gap 153 ms, maximum per-recipient snapshot 138,906 bytes. A separate five-second same-process benchmark with 64 players, six ferry passengers, four parking entrants, four racers, four dome players and four oval drivers passed: p95 simulation step 8.30 ms, p95 64-recipient batch 23.11 ms, maximum recipient snapshot 124,866 bytes. Neither is evidence of sustained, peak-traffic, WAN, mobile-rendering or production capacity.
- The Cloudflare branch preview for `1623aba` passed a separate two-client natural-input car crossing: boarding at 160.0 s, secured departure at 180.3 s, fixed-offset transit at 196.1 s, island arrival at 225.2 s and drive-off onto ground at 231.5 s. Both sockets closed normally; this was a preview, not the shared production deployment.
- Two local Wrangler clients observed a natural-input v18 car crossing: boarding at 159.9 s, secured departure at 180.2 s, fixed-offset transit at 196.1 s, arrival at 225.2 s and drive-off onto island ground at 231.4 s. Both sockets closed normally, with no progression block or state injection.
- Focused shared-simulation tests cover level-zero access to the island and SF playground while preserving the mainland gates, plus flight-speed limits after ordinary and dome collisions and time-based low-condition damping. A separate simulation run completed a level-zero ferry crossing and all eight oval gates; a 64-player spawn check placed no controlled vehicle in a locked region. Simulation is not a browser or production playtest. An automated review of the combined merge reported no actionable regressions.
- Chrome desktop rendered the combined scene and Level 0 requirements, Controls & gamepad, parking and race Actions, and the neutral Park It request message. At 390×844 portrait emulation, touch Drive accelerated 0→151 km/h and Jump reached 5 m. At 844×390 landscape, Drive accelerated 4→103 km/h, Jump reached 5 m and touch opened Actions. Sky-current guidance was visible but entering a current was not tested in this pass. No console errors were observed. No physical device was tested.

## Island playground, charger lots and flight · protocol v17 before main integration · 2026-10-18 Pacific

- `pnpm test` passed 253 tests and `pnpm build` passed; the Vite bundle retained its size warning (768.01 kB minified, 218.65 kB gzip). The local Wrangler health reported protocol v17 and capacity 64. Two-client room and global-chat integration passed, including replicated ferry/activity snapshots, kits, dome, forward flight, shop/OTA results and chat isolation. These were functional checks, not capacity or production evidence.
- An 8-second same-host synthetic 64-client room smoke passed: at least 62 snapshots per client, p95 snapshot gap 163 ms and maximum per-recipient snapshot 136,398 bytes. A separate five-second same-process mixed-activity benchmark with six ferry passengers, four parking entrants, four racers, four dome players and four oval drivers passed: p95 simulation step 9.40 ms, p95 64-recipient snapshot batch 27.42 ms, maximum per-recipient snapshot 122,306 bytes. Neither measures peak traffic, sustained performance, WAN, physical-device rendering or production capacity.
- Local Chrome portrait 390×844 touch emulation drove from 0 to 72 km/h, jumped to 4 m, opened Actions, reached SF · 16th Street and displayed fictional air refill and a Park It stall assignment. Landscape 844×390 touch emulation drove from 0 to 48 km/h, jumped to 4 m and opened Actions. A temporary passive pointer observer was removed after calibrating emulation; the Rocket pickup itself was not visually verified and no physical device was tested.
- Independent automated review identified per-substep condition damping and uncapped collision impulses; both require fixes in the subsequent combined build. Browser testing identified a misleading unconditional parking request toast; a subsequent combined build corrects it.
- Two clients used normal inputs from spawn: the observer saw the car board at 168.1 s, secured departure at 192.3 s, fixed-offset transit at 195.1 s, island arrival at 240.5 s and drive-off onto island ground at 248.1 s. Both sockets closed normally. This local Wrangler check does not verify physical devices or production.

## Island, chat and flight · protocol v16, before charger-lot changes · 2026-10-18 Pacific

- At commit `a5d89db`, `pnpm test` passed 247/247 and `pnpm build` passed both typechecks and Vite. The main JavaScript was 767 kB (218 kB gzip); Vite reported its large-chunk warning.
- Local Wrangler room integration passed two-client ferry/activity snapshots, Rocket kits, dome scoring, cockpit, forward flight, shop/OTA replies and existing room behavior. Global chat and isolated chat-restart integrations passed. These were not load tests.
- Two clients joined a fresh local room. Using ordinary input messages from spawn, one walked to SF and boarded; the other observed boarding at 164.9 s, secured departure at 194.6 s, the rider's fixed deck-relative position in transit at 197.4 s, arrival at 245.8 s and walk-off onto island ground at 249.1 s. Both sockets closed normally. This verifies a pedestrian crossing, not a car crossing or production behavior.
- Chrome desktop opened the activities, connected chat, identity and OTA/tank shop. At 390×844 touch emulation, Drive accelerated to 97 km/h, Jump reached 3 m and Flip received input while airborne. At 844×390, Drive reached 84 km/h, Jump reached 3 m and Flip consumed air. Actions opened in both. A touch swipe timed out; browser scrolling reached the remaining controls. The claimed-stall marker and physical-device touch were not verified. No console errors were observed.
- Automated review found that extreme upgraded flight could tunnel through cars; this observation preceded the subsequent flight-speed fix. Complete activities, multiplayer car crossings, sustained peak traffic and physical devices remain unverified.

## Island with global chat · protocol v14, before flight merge · 2026-10-18 Pacific

- At commit `6ac1fca`, `pnpm test` passed 235/235 and `pnpm build` passed both typechecks and Vite. The main JavaScript was 763 kB (217 kB gzip); Vite reported its chunk-size warning.
- Local Wrangler room, global-chat and isolated chat-restart integrations passed. The room check exercised ferry/activity snapshots, Rocket kits, dome scoring, cockpit and existing room behavior; it was not a ferry crossing or a load test.
- On the earlier combined v14 build before the chat merge and queue fix, Chrome touch emulation drove and jumped in portrait and landscape after correcting the automation input scale. No physical device was tested, and the landscape Actions drawer was not fully traversed.
- Automated review found queue claims could be reused; the fix in `eeedba9` was then reviewed and led to further round completion and claimed-stall visibility fixes. These observations precede the protocol-v16 flight integration.

## Two-client ferry crossing · protocol v14, before global chat and queue fix · 2026-10-18 Pacific

- In local Wrangler, two clients joined a fresh room and used normal input messages. One player walked from the starting vehicle to the SF dock, boarded after the ferry's normal return, rode to Rocket Island and walked onto island ground. The second client observed boarding, the secured passenger in transit, arrival and disembarkation. Both connections remained open until cleanup.
- This pedestrian check preceded the global-chat merge and queue scoring fix. It did not verify a car crossing, production, physical touch or peak traffic.

## Economy planning model · 2026-10-18 Pacific

- On checkout `8625bf0`, `pnpm test` passed 273 tests and `pnpm build` passed; Vite's existing large-chunk warning remains. The standalone planning script also passed a separate TypeScript check.
- Ran both `node --experimental-strip-types scripts/economy-scenarios.ts --ledger` and the `--smooth --ledger` variant. Their cash ledgers balanced, and the first-home scenarios agreed with an independent calculation. These are hypothetical projections, not gameplay, device, live-room or production measurements. The economy proposal does not change gameplay or protocol.

## Rocket Island integration · protocol v18 · 2026-10-18 Pacific

- After integrating main's flight controls, tank levels, progression and chat, `pnpm test` passed 261 tests and `pnpm build` passed. The build retains Vite's existing large-chunk warning. Tests cover the ferry crossing, temporary Rocket expiry, parking and races, island surfaces, and level-zero access to the island and SF playground.
- Local Wrangler two-client room integration passed protocol v18, shared flight/sky currents, activity snapshots, soccer scoring, OTA, fleet and disconnect checks. An initial room run timed out at dome entry while the build was running; a subsequent run after the build passed. Local chat and an isolated real Wrangler restart test passed. These are functional checks, not load tests.
- Chrome desktop solo: opened the combined activity menu, entered the dome, drove into the ball and observed Blue score. At emulated 390×844 portrait and 844×390 landscape, inspected touch controls and the scrollable activity menu. This is browser emulation, not a physical-device test; the ferry crossing was verified in simulation rather than the browser.

## Flight and steering feel · 2026-10-18 Pacific

- `pnpm test` passed 198 tests after integrating the latest main branch, and `pnpm build` passed. Vite retains its existing large-chunk warning. Tests cover held jump/hover across keyboard, touch and simulated gamepad, rebound controls, proportional low-air launches, forward thrust while hovering, steering at road speeds and in reverse, and existing drift/autopilot behavior. No physical controller or phone was tested.
- Local Wrangler two-client room integration passed movement, jump/flip/landing, sky currents and the existing room checks; this is not a load test.
- Chrome desktop solo: holding E launched and hovered at 4 m; a steering input visibly turned the moving car. A temporary, removed local fixture set the tank to 9%: the HUD showed a low-air refill direction, and a 350 ms E press launched to 4 m with 2% remaining. Chrome emulation showed the combined Jump / Hover control at 390×844 portrait and 844×390 landscape. Touch activation and subjective handling on a physical device remain unverified.

## Release notes and dev blog · 2026-10-18 Pacific

- `pnpm test` passed 195 tests, including browser-storage failure, return-visit records, and changelog comparisons against synthetic older, current and unknown releases. `pnpm build` passed both TypeScript checks and emitted the static blog index, first post and changelog. Vite's existing large-chunk warning remains.
- The local two-client Wrangler room integration passed, including shared movement, deliveries, police, sky currents and Rocket Dome; this was not a load test. Local Wrangler served complete article and changelog HTML, the game and `/api/health`. In Chrome, starting a solo drive and reloading displayed the recorded date and version; the changelog reported no newer release. The blog index, article and changelog were inspected at desktop size; the article was inspected at emulated 390×844 portrait and 844×390 landscape, and the game menu was inspected at those sizes. These are browser-emulation observations, not physical-device checks. The game remains playable when browser storage is unavailable according to the focused storage test.

## Chat quota test timing · 2026-10-18 Pacific

- The production build for merge `843657f` failed in the existing global-chat quota test: its simulated one-hour reset was based on a timestamp taken before the tested quota bucket was constructed. The test now uses a timestamp taken immediately after construction, avoiding a race on loaded builders without changing the runtime limit.
- On the latest controls integration, `pnpm test` passed 182 tests and `pnpm build` passed both TypeScript checks and the production build; Vite's existing large-chunk warning remains.
- The subsequent production build `bb85cf4` deployed protocol v16 and served the locally built assets. Its two-client room integration passed, including sky-lane speed and refill. Two initial runs exposed a test setup assumption: either connection can occupy the Bay spawn; the test now moves the other car when needed and checks the actual launch position. This is not a load test.
- After integrating Bay progression (protocol v17), `pnpm test` passed 191 tests, `pnpm build` passed, and the local two-client room integration again passed the sky-lane check. This is not a load test.

## Gamepad and keyboard bindings · 2026-10-18 Pacific

- After integrating sky currents, `pnpm test` passed 182 tests and `pnpm build` passed; the controls and network protocol were unchanged by this integration.

- `pnpm test` passed 177 tests on rerun and `pnpm build` passed; one prior run failed an unrelated timing-sensitive global-chat test while the build was running concurrently. Vite's existing chunk-size warning remains. Unit tests cover simulated standard-controller analog steering, braking/reverse, flight, button edges, disconnect and safe resume, keyboard remapping, storage errors and touch independence. No physical controller was tested.
- Chrome desktop: rebound forward from W to I, confirmed focus returned to its binding, and drove a solo Roadster to 82 km/h with I. Chrome emulation at 390×844 portrait and 844×390 landscape showed the scrollable settings dialog. Mobile interaction through the emulated browser targeted a different button, so touch activation and physical devices remain unverified.

## Sky currents with flight controls and global chat · protocol v16 · 2026-10-18 Pacific

- After integrating flight-control and tank upgrades, `pnpm test` passed 178 tests and `pnpm build` passed both TypeScript checks and the production build. Vite's existing large-chunk warning remains. The sky tests additionally verify that the same air units refill tanks of different capacities.
- Local Wrangler two-client room integration passed, including a double jump into City Glide and server-applied speed and air refill. Local global-chat and isolated restart integration also passed. These are functional checks, not concurrency or production-load tests.
- Staging at commit `5851eca` returned protocol v16, served the locally built assets, and passed the two-client room integration, including sky-lane refill and acceleration. This is not a load test.
- Chrome desktop solo reached City Glide with two timed E jumps, showing its speed and air indicator while police pursued. Chrome emulation at 390×844 portrait and 844×390 landscape showed the active lane indicator and updated touch controls. A temporary, removed local fixture placed the Roadster beside Transamerica: one E jump entered the thermal, rose to 19 m and refilled air. Thermal touch jumping was also independently checked before the flight-control integration below. No physical phone, subjective comfort or frame rate was tested.

## Sky currents with global chat · before flight-control integration · protocol v14 · 2026-10-18 Pacific

- After integrating the global-chat changes, `pnpm test` passed 168 tests and `pnpm build` passed both TypeScript checks and the production build. Vite's existing large-chunk warning remains. Shared simulation tests cover directional acceleration, free air, tank cap, all three thermal locations, jump reachability, vehicle eligibility, boundaries and determinism.
- Local Wrangler two-client room integration observed a double jump enter City Glide and verified the server-applied speed and air refill in the second client's snapshots. Local global-chat and isolated restart integration also passed. These are functional checks, not a concurrency or production-load test.
- Chrome desktop in the combined build reached City Glide by double jump and the car accelerated across the Bay without holding boost. A separate temporary local-only fixture placed the car by Transamerica: one jump entered the thermal, rose above the skyline and refilled the tank; the fixture was removed before the final build. Chrome 390×844 portrait emulation used the touch Jump control to enter that thermal, and 844×390 landscape and portrait emulation showed the combined sky-lane HUD and controls. Invalid room validation was visible, and the final local browser session reported no console errors. No physical phone, subjective comfort or frame rate was tested.

## Global chat with shop feedback · protocol v13 · 2026-10-18 Pacific

- After integrating the shop feedback fixes, `pnpm test` passed 164/164 and `pnpm build` passed. Vite's large-chunk warning remains.
- Local Wrangler room and chat integrations passed, including requester-only shop rejection results, global chat and saved-driver recovery. An isolated Wrangler restart again preserved the saved ID and name and cleared history. These are not load tests.
- Chrome desktop solo showed the combined game and connected chat with a chosen name. Earlier portrait and landscape layout checks and touch limitations are documented below.

## Supercharger parking lots · protocol v14 · 2026-10-18 Pacific

- `pnpm test` passed 219 tests and `pnpm build` passed both typechecks and Vite. The existing chunk warning remains (744 kB main JavaScript, 211 kB gzip). Shared-simulation checks cover every charging bay, all fleet footprints, clear lots and both parking modes.
- Local Wrangler two-client integration passed ferry/activity snapshots, Rocket pads, shop responses, dome ball and goals, movement and disconnect checks. An earlier run timed out at the ball impact while files were changing; the settled rerun passed. This was not a multiplayer ferry crossing or load test.
- In Chrome desktop solo, a temporary spawn fixture placed the car near the SF 16th Street lot. The lot, marked stalls and posts were visible; driving into a bay and stopping refilled the air tank, and Park It assigned a stall. The fixture was removed before the final build. Portrait 390×844 and landscape 844×390 emulation showed the lot, HUD and controls; no physical device or full touch drive was tested.
- These checks describe this branch against its v14 base. Main advanced separately; integration and deployment remain outstanding.

## Ferry playground with shop feedback · protocol v14 · 2026-10-18 Pacific

- After integrating main's shop purchase acknowledgements, `pnpm test` passed 217 tests and `pnpm build` passed both typechecks and Vite. The existing chunk warning remains (744 kB main JavaScript, 210 kB gzip).
- Local Wrangler two-client integration passed the ferry and activity snapshots, Rocket pads, requester-only shop results, dome ball and goals, movement and disconnect checks. This did not exercise a full multiplayer ferry crossing or a load test.
- Chrome desktop and 390×844 portrait / 844×390 landscape emulation showed the final game's driving HUD and activity actions. The fixture-based island observations below were from the preceding v13 build, not this final merge. Touch driving, physical devices and a complete manual route remain unverified.

## Ferry, parking, temporary rockets and connected dome · protocol v13 before the shop follow-up · local checks

- `pnpm test` passed 216 tests and `pnpm build` passed browser and Worker typechecks and Vite. The existing chunk-size warning remains (743 kB main JavaScript, 210 kB gzip).
- Local Wrangler two-client integration passed the ferry and activity snapshots, Rocket pads, dome ball and goals, movement, delivery and disconnect checks. This was not a full multiplayer ferry crossing or a load test.
- Shared-simulation checks cover driving onto and across the ferry, parking rounds and queue overtakes, temporary upgrade expiry, purchased kits, and driving from the island into the dome. The direct dome action returns visitors to their original Bay or island side.
- In local Chrome, a temporary spawn fixture placed the car in the island parking approach: Park It assigned a stall and Cut the queue joined with the correct position and countdown. Separate temporary spawn fixtures displayed a Model 3 with a 90-second Rocket and a car secured on the ferry after departure. The fixtures were removed before the final build. These do not prove a full manually driven route or multiplayer crossing.
- Desktop and 390×844 portrait / 844×390 landscape emulation showed the driving HUD and activity controls. The dome, ball and scoreboard were visible in landscape. The parking action gave location guidance away from a lot. Browser emulation did not establish a successful touch drive on this final checkout; no physical device was tested.

## Rocket Island, cockpit and Rocket Dome · protocol v12, local checks · 2026-10-17 Pacific

- `pnpm test` passed 204/204 and `pnpm build` passed both TypeScript checks and Vite. The main JavaScript is 734 kB (207 kB gzip); Vite retains its chunk-size warning.
- Local Wrangler protocol-v12 two-client integration passed ferry/activity snapshots, Rocket pads, cockpit, dome entry, a shared ball impact and goal, arena exit, movement and disconnect cleanup. The first run overlapped a build-triggered worker reload and timed out; the settled rerun passed. It did not test a multiplayer ferry crossing.
- A same-host eight-second 64-client smoke passed with at least 69 snapshots per client, a 123 ms p95 snapshot gap and 123,476-byte maximum recipient snapshot. It began at dawn without an occupied ferry or peak traffic; it is not a WAN, sustained or production test.
- A five-second same-process synthetic mixed-activity run included 64 players, six ferry passengers, four parking entrants, four racers and four dome players. Across 3,200 serialized snapshots, p95 simulation step was 12.45 ms, p95 batch of 64 snapshots was 35.35 ms and the largest recipient snapshot was 108,595 bytes. The run was not a network, peak-traffic, mobile, sustained or production test.
- A continuous shared-simulation test drove onto the ferry from the SF pier, waited for its normal crossing and drove onto Rocket Island. Actual multiplayer ferry crossing, physical-device touch and full island activity playthroughs remain unverified.

The protocol v11 island and dome records below describe separate builds.

## Rocket Island and cockpit · protocol v11, local checks · 2026-10-17 Pacific

- `pnpm test` passed 168 tests and `pnpm build` passed, including both TypeScript checks. Vite reports a 710 kB main chunk (199 kB gzip) and its existing chunk-size warning.
- Local Wrangler two-client integration passed with protocol 11, including cockpit and island state replication and rejection of remote activity intents. It did not exercise an end-to-end ferry crossing.
- A same-host, eight-second 64-client WebSocket smoke passed with at least 63 snapshots per client and a 139 ms p95 snapshot gap; maximum recipient snapshot was 119,828 bytes. This new room did not exercise occupied ferry/activities or peak traffic. It is not a WAN, sustained or production test.
- `pnpm exec tsx tests/island-load.bench.ts` passed five simulation seconds with 64 players, six ferry passengers, four parking entrants and four race entrants. Across 3,200 serialized snapshots, p95 simulation step was 3.90 ms, p95 batch of 64 recipient snapshots was 19.45 ms, and the largest recipient snapshot was 104,788 bytes. This same-process synthetic run is not network, peak-traffic, mobile, sustained or production evidence.
- In local Chrome on the combined checkout, C switched to cockpit view and showed the pickup target and timer; Actions exposed the parking/race controls and keyboard guidance. Clicking Park It away from a lot displayed the location guidance. This did not verify a game join.
- Independent review found and led to fixes for race re-entry, parking approach bounds, ferry rider transfer, cliff collisions and cockpit order eligibility during a paused delivery. Regression tests cover each. Real-device touch, full island/activity playthroughs and end-to-end multiplayer ferry crossings remain unverified.
## Rocket shop feedback and restart fix · protocol v13 · 2026-10-17 Pacific

- `pnpm run ci` passed 157 tests, both typechecks and the build; Vite's existing chunk-size warning remains. Regression checks cover reused retrofit meshes, solo purchase results and validated request IDs.
- Local Wrangler two-client integration passed with requester-only results for a rejected purchase and a second immediate request. Successful multiplayer purchases remain covered by shared simulation, not a live room transaction; this is not a load test.
- Staging preview of commit `39b41c4` returned protocol v13, matched the locally built browser assets, and passed the same two-client integration. Production health also reported protocol v13 during subsequent integration. These checks do not verify the combined v14 checkout or establish a load result.
- Chrome desktop solo with a temporary, removed fixture: a Model 3 bought a rocket for $60 from $200, displayed “Rocket kit installed” and showed the retrofit; restarting the same Model 3 removed the hardware and showed no air tank. Chrome 390×844 portrait touch emulation bought the kit and displayed its confirmation; 844×390 landscape showed it after scrolling the shop. The fixture is absent from the built source. No physical device was tested for this follow-up.

## Banked oval and review fixes · protocol v12, local checks · 2026-10-17 Pacific

- `pnpm test` passed 213/213 and `pnpm build` passed; Vite reports a 739 kB main chunk (209 kB gzip) and its chunk-size warning. Regression tests include a driven full oval lap through all eight gates, shared mesh/simulation triangles, large vehicles, flat junctions and an eight-car grid. The physics are arcade handling, not a tire-grip simulation.
- The final local Wrangler protocol-v12 two-client integration passed island/activity snapshots, dome scoring, cockpit, movement and existing room checks. It did not exercise a multiplayer ferry crossing. A later two-client crossing attempt was interrupted by a local worker reload before boarding; both sockets closed and no crossing or disembarkation was observed.
- A same-host eight-second 64-client smoke passed with at least 64 snapshots per client, a 140 ms p95 snapshot gap and 123,464-byte maximum recipient snapshot. It began at dawn without an occupied ferry or peak traffic; it is not a WAN, sustained or production test.
- A five-second same-process synthetic workload included 64 players, six ferry passengers, four parking entrants, four racers, four dome players and four banked-oval drivers. All four remained on the oval for 100 ticks. Across 3,200 serialized snapshots, p95 simulation step was 5.85 ms, p95 batch of 64 snapshots was 21.10 ms and the largest recipient snapshot was 109,392 bytes. This is not a network, peak-traffic, mobile, sustained or production test.
- A temporary local Chrome fixture placed a Roadster on the oval; the bank and markings rendered, and driving and steering remained supported. This was not a natural route or full browser lap. The fixture was removed.
- Automated review identified island/dome vehicle replacement overlap, shore-side vehicles straddling a departing ferry, and water recoveries far from the island; fixes have focused regression coverage, including both docks and a full deck.
- On the prior combined v12 build, a Chrome desktop pedestrian boarded at SF, rode the secured crossing and walked onto the island; delivery stayed paused. Car boarding and crossing were exercised in shared simulation, not end-to-end in the browser or between two clients. The resized dock sign was rechecked in Chrome.
- Portrait touch emulation opened Actions, but repeated Drive holds did not register reliably in the automation session. No physical-device touch, complete island activity playthrough, mobile frame-rate or production performance verification was performed.

## Rocket Island, cockpit and Rocket Dome · protocol v12, before banked oval · 2026-10-17 Pacific

- `pnpm test` passed 204/204 and `pnpm build` passed both TypeScript checks and Vite. The main JavaScript is 734 kB (207 kB gzip); Vite retains its chunk-size warning.
- Local Wrangler protocol-v12 two-client integration passed ferry/activity snapshots, Rocket pads, cockpit, dome entry, a shared ball impact and goal, arena exit, movement and disconnect cleanup. The first run overlapped a build-triggered worker reload and timed out; the settled rerun passed. It did not test a multiplayer ferry crossing.
- A same-host eight-second 64-client smoke passed with at least 69 snapshots per client, a 123 ms p95 snapshot gap and 123,476-byte maximum recipient snapshot. It began at dawn without an occupied ferry or peak traffic; it is not a WAN, sustained or production test.
- A five-second same-process synthetic mixed-activity run included 64 players, six ferry passengers, four parking entrants, four racers and four dome players. Across 3,200 serialized snapshots, p95 simulation step was 12.45 ms, p95 batch of 64 snapshots was 35.35 ms and the largest recipient snapshot was 108,595 bytes. The run was not a network, peak-traffic, mobile, sustained or production test.
- A continuous shared-simulation test drove onto the ferry from the SF pier, waited for its normal crossing and drove onto Rocket Island. Actual multiplayer ferry crossing, physical-device touch and full island activity playthroughs remain unverified.

The protocol v11 island and dome records below describe separate builds.

## Rocket Island and cockpit · protocol v11, local checks · 2026-10-17 Pacific

- `pnpm test` passed 168 tests and `pnpm build` passed, including both TypeScript checks. Vite reports a 710 kB main chunk (199 kB gzip) and its existing chunk-size warning.
- Local Wrangler two-client integration passed with protocol 11, including cockpit and island state replication and rejection of remote activity intents. It did not exercise an end-to-end ferry crossing.
- A same-host, eight-second 64-client WebSocket smoke passed with at least 63 snapshots per client and a 139 ms p95 snapshot gap; maximum recipient snapshot was 119,828 bytes. This new room did not exercise occupied ferry/activities or peak traffic. It is not a WAN, sustained or production test.
- `pnpm exec tsx tests/island-load.bench.ts` passed five simulation seconds with 64 players, six ferry passengers, four parking entrants and four race entrants. Across 3,200 serialized snapshots, p95 simulation step was 3.90 ms, p95 batch of 64 recipient snapshots was 19.45 ms, and the largest recipient snapshot was 104,788 bytes. This same-process synthetic run is not network, peak-traffic, mobile, sustained or production evidence.
- In local Chrome on the combined checkout, C switched to cockpit view and showed the pickup target and timer; Actions exposed the parking/race controls and keyboard guidance. Clicking Park It away from a lot displayed the location guidance. This did not verify a game join.
- Independent review found and led to fixes for race re-entry, parking approach bounds, ferry rider transfer, cliff collisions and cockpit order eligibility during a paused delivery. Regression tests cover each. Real-device touch, full island/activity playthroughs and end-to-end multiplayer ferry crossings remain unverified.

## Global chat with rocket shops · protocol v12 · 2026-10-17 Pacific

- The combined build after review fixes passed `pnpm test` (163/163) and `pnpm build`. Vite's large-chunk warning remains.
- Local Wrangler room and chat integrations passed, including global delivery, private recovery, name collisions and the existing arena and shop checks. An isolated Wrangler restart restored the saved driver and cleared transient chat history. A room run overlapping the rebuild timed out at the dome goal; the stable rerun passed. These are not load tests.
- The pre-review Cloudflare preview passed chat integration. One room run timed out on vehicle selection, then repeated runs passed; the test now checks the car is stationary and allows more time around the action cooldown.
- Chrome desktop showed chat alongside the rocket shops; the reviewed build accepted a 20-emoji name and retained an invalid Unicode draft. 390×844 portrait and 844×390 landscape emulation showed the chat layout before the review fixes. No browser console errors were observed. Emulated touch activation of the chat button and physical devices remain unverified.

## Global chat and saved drivers · pre-rocket-shops local build · 2026-10-17 Pacific

- `pnpm test` passed 152/152 tests and `pnpm build` passed; the existing Vite large-chunk warning remains.
- Local Wrangler integration passed for global message delivery, case-insensitive name collisions in chat and rooms, private recovery codes, repeated save, recovery, invalid-code rejection and cross-origin rejection. A separate isolated Wrangler restart test restored the same saved ID and name and confirmed the chat history was gone. The existing two-client room integration also passed. These are not load tests.
- Chrome desktop solo showed a chosen name, sent a local chat message, generated a recovery code and displayed an invalid-code error. Chrome emulation at 390×844 and 844×390 showed chat and the scrollable recovery dialog; keyboard activation worked. Emulated pointer/touch activation did not register for the chat button, so touch activation and physical devices remain unverified. No browser console errors were observed.

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

The protocol v10 records below describe separate earlier builds; they do not verify the combined v12 checkout.

## Rocket Island · protocol v10, local checkout · 2026-10-17 Pacific

- Local Wrangler two-client room integration passed, including ferry/activity snapshots, Rocket pads and rejection of activity requests from outside their locations. It did not exercise a two-client ferry crossing or a load test.
- Shared simulation tests exercise ferry boarding, crossing and return, passenger safety and recovery, island protection, temporary Rocket capability, bank support, cliff attachment and detachment. These are simulation checks rather than completed browser routes.
- Local Chrome desktop and 390×844 portrait emulation exercised driving and Jump; the portrait run accelerated from 0 to 72 km/h and reached 4 m during Jump. The portrait Actions drawer eventually scrolled to `scrollTop` 194.
- After same-tab Chrome recovery, 844×390 coarse-pointer emulation opened and closed Actions, held Drive from 0 to 66 km/h, and jumped to 5 m. Park It was tapped away from a lot, so joining a parking game was not verified.
- The first local 64-client smoke was interrupted by a Wrangler reload while source files changed; it produced no capacity result. Real-device touch, complete island/activity playthroughs and end-to-end multiplayer ferry crossings remain unverified. These local observations do not establish a production deployment or performance budget.

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

One additional local integration run timed out at the existing Tesla fleet-change assertion while Wrangler reloaded; a subsequent run passed. The preview integration also passed.

After integrating main's global chat, 173 tests and `pnpm build` passed. Both the room and global-chat integrations passed against local Wrangler. Chrome portrait emulation showed the combined game and remote shop; no physical device was tested.

## 2026-10-18 · Bay delivery progression and landmarks

In the isolated release worktree, `pnpm test` passed 182 tests and `pnpm build` passed, including both TypeScript checks; Vite retains its large-chunk warning. The local Wrangler two-client room integration passed on protocol v16. Shared-simulation tests exercise the delivery and earnings thresholds, per-player access, locked boundaries on the ground and in flight, collisions and takeover, and supported, collision-clear landmark arrivals. The integration is not a load test.

In Chrome local solo play, the level-zero objective pointed into SF, attempting to cross the locked Bay Bridge showed the Oakland requirements and stopped the car, and the expanded map concealed locked regions. The desktop cockpit, invalid-room feedback, and 390×844 portrait and 844×390 landscape emulated layouts were inspected; a landscape HUD overlap and the starting heading were corrected. Keyboard driving moved the car. Emulated pointer actions did not reliably target the requested control in this browser session, so mobile touch behavior was not verified by this playtest. No physical device or complete manual drive through all unlocks was tested. Lake Merritt and its islands are decorative, not physical water.

After merging main's sky currents and configurable controls, 191 tests and `pnpm build` passed. The local two-client room integration passed on protocol v17, including sky-lane speed and refill. Chrome desktop confirmed the combined level-zero HUD and the bridge rejection; checkpoint guides now indicate that the restriction also applies in the air. The final airborne guides were not manually approached in flight.

## 2026-10-18 · More Bay landmarks and billboards

In an isolated release worktree, `pnpm test` passed 208 tests and `pnpm build` passed, including TypeScript checks. The local Wrangler two-client room integration passed on protocol v18, which versions the new collision and terrain data; this is not a load test. Tests cover the 100 new landmark identities, physical envelopes, highway clearance, billboard placement, and driving over the three authored hills. The room landing check was updated to accept a supported landing on terrain or a roof rather than requiring sea-level ground.

Chrome local solo play exercised keyboard driving at desktop size and inspected 390×844 portrait and 844×390 landscape with touch emulation. Temporary spawn fixtures inspected the Palace of Fine Arts and a roadside Moon Goose billboard; the fixture was removed from the final build. A billboard post was shortened after it obscured the panel. No console errors were observed during the local playtest. The new sites are stylized and compressed, and the hills are authored rather than surveyed terrain. This was not a complete manual visit to every site or a physical-device test; touch interaction was not verified in this pass.

After integrating the Rocket Island, ferry and parking changes from main, 273 tests and the build passed. The local two-client room integration passed on protocol v19, including ferry and activity snapshots. Tests also check the new landmarks, hills and billboards against parking areas, the ferry corridor and island race routes. Chrome showed the merged solo start at desktop, portrait and landscape emulation; no physical device was tested.

## 2026-10-18 · First development post rewrite

In the isolated article worktree after integrating the Rocket Island and landmark changes, `pnpm test` passed 273 tests and `pnpm build` passed, including both TypeScript checks. In Chrome, the static article was inspected at desktop and emulated 390×844 portrait and 844×390 landscape widths; the delivery-loop graphic was resized for readable phone labels. Local solo play supplied the street, flight, citation and cockpit screenshots from the integrated build. These are browser captures, not physical-device or multiplayer load tests.

## 2026-10-18 · Automatic multiplayer and room overflow

In the isolated multiplayer worktree, `pnpm test` passed 275 tests and `pnpm build` passed. Local Wrangler with `MAX_PLAYERS=2` passed the protocol-v20 two-client room integration and a separate capacity test: the third connection received close code 4003, an independently named room accepted a player, and a freed seat accepted a replacement. One earlier room integration run timed out at the existing soccer-goal assertion while tests and build were running concurrently; a subsequent isolated run passed.

Chrome automatically entered `bay`, and a third client saw the full-room prompt. Naming a different room connected successfully, and keyboard driving advanced the car. The game and overflow prompt were inspected at desktop, emulated 390×844 portrait and 844×390 landscape. Keyboard activation of the alternate-room button worked; emulated pointer activation was not verified at landscape size. No physical phone was tested.

Short local synthetic load checks with all clients and Wrangler on the same machine are not Cloudflare capacity measurements. With the cached serializer, 64 clients sent 12,608 inputs over 10 seconds, received 6.6 snapshots per client per second and advanced the room 6.5 simulated seconds; aggregate received snapshots were about 600 MiB. A 128-client, 6-second run received 3.07 snapshots per client per second and advanced 1.8 simulated seconds, with about 570 MiB received. There were no observed socket closures during either measurement. These runs show substantial local slowdowns and bandwidth; the 64-player production cap remains provisional. `scripts/load-room.ts` can repeat the experiment against a local server or an authorized preview.

The Cloudflare staging preview advertised protocol v20 and an experimental capacity of 128. Its two-client gameplay integration passed. In separate four-second synthetic tests from one client machine, 64 clients stayed connected, received 10.93 snapshots per client per second, advanced 4.2 simulated seconds and received about 397 MiB in aggregate; the p95 snapshot gap was 154 ms. At 128 clients, all stayed connected, but received 2.45 snapshots per client per second, advanced 1.1 simulated seconds and received about 302 MiB; the p95 snapshot gap was 1,585 ms. Client processing and network conditions also affect these measurements. These short runs are not a soak test, a measurement of input latency or evidence that 64 players is reliably playable.

After integrating main's updated Rocket Island physics and bumping the protocol to v21, `pnpm test` passed 308 tests and `pnpm build` passed. Local Wrangler passed the two-client gameplay integration and the two-seat overflow integration. In Chrome, a newly connected player drove immediately without opening a menu; in a full two-seat room, choosing the same room retained the connection and active delivery time. The earlier Cloudflare load figures describe the prior v20 preview, not this combined v21 build.

The combined v21 Cloudflare branch preview passed the two-client gameplay integration. Short synthetic tests from one client machine again show that connected sockets are not a capacity guarantee: 64 clients received 4.02 snapshots per client per second and observed 1.5 simulated seconds over 4.01 seconds; 128 clients received 0.24 snapshots per client per second over 4.13 seconds, and the sampled player received too few snapshots to measure simulation progress. No sockets closed during the measurement, although the 128-client process needed interruption while closing. A subsequent 32-client run observed 1.6 simulated seconds over four seconds, but may have been affected by residual load from the prior test. These are brief, synthetic observations, not a sustained or isolated capacity benchmark. Production's 64-player cap remains provisional, and performance may degrade well before the room is full.
## 2026-10-18 · Driving feel, supplies and surfaces

In the isolated worktree, `pnpm test` passed 281 tests and `pnpm build` passed, including both TypeScript checks; Vite retains its large-chunk warning. Simulation tests cover direction changes, controlled airborne momentum, repeated jump velocity, supply rewards, rocket-pad eligibility, the stunt loop and curved-roof landings. A local Wrangler two-client room integration passed on protocol v20; a separate run timed out at its existing flip-completion assertion, so that integration remains susceptible to intermittent failure. This was not a load test.

In Chrome solo play, temporary spawn fixtures showed a supply pickup restoring air and awarding cash, and a thermal showing the refill message and increasing air. The thermal display was inspected at desktop and at emulated 390×844 portrait and 844×390 landscape; the final nearby-label adjustment was rechecked at desktop. Fixtures were removed. No physical device, full manual loop drive, or ferry landing was tested; further playtesting is needed to judge the handling. The collision surfaces remain stylized approximations, not exact collision meshes for every landmark.

After integrating main's island, ferry and permanent Rocket kit changes, all 313 tests and the build passed. The local two-client Wrangler room integration passed on protocol v21; it is not a ferry-crossing or load test. Chrome showed the integrated solo game on desktop and in emulated portrait and landscape layouts, with landscape touch controls visible. No physical device was tested.
