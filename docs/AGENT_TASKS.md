# Ready-to-use contributor tasks

All tasks begin: read AGENTS.md and docs/CONTRACTS.md, DESIGN.md, ASSETS.md. Preserve shared simulation and network contracts. Keep the existing playable route working. Report changed files, screenshots, tests, asset provenance, limitations. The lead reviews and integrates the selected alternative. Do not deploy alternatives over the shared default independently.

## Alternate UI model

Own `src/main.ts` and `src/style.css`. Produce a coherent alternate menu/HUD treatment for desktop and touch. Preserve Tesla-only fleet selection, shop and pickup feedback, Session/Controls APIs, explicit solo versus multiplayer, room invitation, live/disconnected states, vehicle entry, lift/boost/roll/brake, recovery, air/condition/nearest-station feedback. Keep a visible menu/exit at every state. Test390×844 and844×390 plus desktop. Do not edit physics, station placements, assets, Wrangler or the protocol. Deliver screenshots of menu, driving and connection error; check touch target layout and input neutralization. Prefer making the existing DOM cleaner over adding a framework.

## Vehicle artist/coding model

Own `src/vehicles.ts`, `src/fleet-preview.ts` and `public/assets/vehicles/` plus manifest. Improve the existing 26-family procedural fleet while preserving each registry ID and distinctive silhouette. Read FLEET_RESEARCH.md; do not reduce all models to generic sedan/SUV shapes. Keep ground-center pivots, −Z forward, meter scale, registry envelopes and `jets` group behavior, including `addRocketKit` for any non-native rocket vehicle. Use original/permitted assets, shared materials and mobile budgets. Leave `createVehicle(kind)` as the entry point. Test ground/air/roll views and several vehicles together. Do not change collision radii, controls or game balance to fit the art.

## Environment artist/coding model

Own world-building internals in `src/bay-world.ts`, `src/scene.ts` and `public/assets/environment/`. Read MAP.md for the shared geography contract. Improve Bay Area character using the existing BUILDINGS and STATIONS data: waterfront, skyline, bridge, district palettes, trees and clear charger beacons. Preserve `render()`, `start()`, `cameraMode`, `cycleCamera()` and `objectiveScreen()` interfaces and the cockpit behavior in CONTRACTS.md, as well as roads, collider dimensions and station coordinates. Add no visual ramps/elevated drivable surfaces until the lead approves matching shared geometry. Prefer instancing and material reuse; keep initial download and phone budgets. Submit aerial, street and airborne screenshots and record draw/triangle measurements if available.

UI and vehicle lanes can run concurrently. Environment and vehicle lanes touch common rendering integration concerns; keep their factories/interfaces stable and let the lead resolve integration, rather than introducing competing engine abstractions.
