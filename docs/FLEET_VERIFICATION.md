# Poly AV fleet verification · 2026-10-17 Pacific

## Implemented

26 researched platform families (11 Tesla, 9 Waymo, 4 Cruise, 2 Zoox); every family has a parked and an NPC instance. Original shared procedural mesh factories, distinct scale/body/sensors, steering-wheel assemblies, and an on-demand catalog preview. No remote assets or copied operator artwork. See FLEET_RESEARCH.md for provenance and estimated versus sourced values.

The simulation now uses oriented vehicle bodies, model wheelbases and steering angles, low-speed rear steering on Cybertruck/Zoox, mass-weighted separation/impulses, and lateral momentum. Acceleration/speed/braking are intentionally arcade tuning. Only the next-generation Roadster Air Edition flies. All families have fictional manual and autonomous controls; no real vehicle control is integrated.

26 NPCs use deterministic street loops, corner pauses and forward-obstacle yielding. Manual input overrides player AV mode; nearby empty/NPC cars can be taken, while human-occupied cars remain protected. Fleet switching requires a grounded stop. No trailer articulation, tire/suspension simulation, traffic-light state, destination planner, or full road-rule model.

## Checks

- `pnpm typecheck`: separate browser and Worker environments pass. This split avoids Cloudflare HTMLRewriter Element types colliding with browser DOM types.
- `pnpm test`: 13 tests pass, including every-model parked/NPC/selectable coverage, no personal-car leaks, takeover/manual override, nose collisions, heavy versus light impact response, invalid model IDs, ownership, and two minutes of stable traffic.
- Follow-up simulation observation after two minutes: all 26 NPCs moved >100 m over the next 20 simulated seconds; no generic path-following gridlock observed in that unobstructed scenario.
- Local live two-client integration passes: movement, fleet selection, autonomous mode, malformed input isolation, cleanup and HTTP route validation.
- Local 64-player smoke with 26 NPCs: all clients saw all peers; minimum 76 snapshots/client, p95 inter-snapshot interval 111 ms over 8 seconds. Not sustained-load or rendering evidence.
- Chrome desktop: starting-model selection, Cybertruck geometry/3,000 kg game mass/rear-steering HUD, player AV engagement and autonomous state, full catalog and source/estimate disclosure inspected.

## Detailed-vehicle follow-up

- Build/typechecks and 14 tests pass, including geometry bounds, finite vertices, <12k triangles/model, and independently articulated cloned wheel groups.
- Reworked passenger body curvature/cabins, wheel openings, 32-segment tires, rims, glass, clearcoat and studio reflections. Rounded shuttle bodies keep visible glass bands. City geometry unchanged.
- Actual factory count: approximately 2.9k–7.5k triangles per vehicle. Geometry is cached and static parts combined by material. No sustained GPU/mobile frame-rate benchmark has been performed.
- Chrome inspected Roadster catalog and on-road movement, Zoox glazing, and phone-width catalog. Physical phones and final landscape layout remain unverified. Screenshot: screenshots/roadster-detail.png.
- Live two-client integration passes fleet selection/autonomy/movement/cleanup. Live 64-client smoke: minimum 80 snapshots/client, p95 inter-snapshot interval 159 ms, eight seconds. This does not establish sustained or mobile rendering capacity.
- Deployed to https://bay-drive.swyxio.workers.dev, Worker version 379f4c9b-e746-4573-b23c-5677949b37b6.

Prior baseline evidence lives in VERIFICATION.md; do not treat it as new-fleet validation.
