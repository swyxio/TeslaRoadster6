# Verification · 2026-10-17 Pacific

## Rocket stunt implementation · 2026-10-17 Pacific

- Local simulation checks cover 0–60 mph arcade targets, three jump/flip/landing sequences (99% tank), two flips in one jump, depleted-air driving and falling, inverted thruster hover, the physical ramp, a complete suction loop and detachment. After integrating delivery and police from main, the full test suite and production build passed; Vite retains its existing >500 kB chunk warning.
- Local Wrangler two-client integration passed with authoritative movement, jump, one-tap flip, landing, fleet switching and invalid-input isolation. This is not a load or production test. One earlier integration run was interrupted when a concurrent Vite build caused Wrangler to reload; it passed when rerun after the build.
- Local Chrome desktop: solo jump, flip, landing and 67% remaining air were visible. Chrome 390×844 portrait and 844×390 landscape emulation: layout and changing airborne control labels inspected; keyboard-activated fleet selection and invalid room validation verified. Those observations and screenshots preceded integration of the delivery and police UI: `screenshots/stunt-desktop.png`, `screenshots/stunt-portrait.png`, `screenshots/stunt-landscape.png`. After integration, the desktop delivery HUD and stunt keyboard controls were visible; the combined mobile layouts were not rechecked.
- Chrome's emulated pointer actions in this session did not activate either touch or ordinary toolbar buttons. Pointer handling was exercised with synthetic unit events and keyboard activation worked, but genuine phone touch and multi-finger interaction remain unverified. The ramp and loop have simulation tests, not a completed manual route playtest. No physical device, new load test, or production deployment was verified.

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

Multiplayer presentation interpolates server snapshots without client prediction; remote latency can be felt. Camera can clip scenery at awkward angles; collision geometry is simplified. Trees/charger posts/bridge furniture are decorative. At that baseline there was no sound, NPC traffic, quests, persistent inventory, shooting or death/respawn; NPC traffic has since been added. The map has flat playable streets and scenic hills; it is not an accurate road network.

## Station provenance

Primary Tesla pages read2026-10-17; site identity/address only, not live stall availability or real air service:

- SF16th Street,2300 16th St: https://www.tesla.com/en_CA/findus/location/supercharger/8739
- SF Geary Boulevard,2675 Geary Blvd: https://www.tesla.com/en_GB/findus/location/supercharger/SanFranciscoCAsupercharger2
- Oakland2nd Street,255 2nd Street: https://www.tesla.com/en_gb/findus/location/supercharger/oaklandcasupercharger
- San Mateo Park Place,1200 Park Place: https://www.tesla.com/en_CA/findus/location/supercharger/sanmateosupercharger

Cloudflare reference: https://developers.cloudflare.com/durable-objects/api/state/ documents a32,768 hibernation-API WebSocket connection ceiling and explicitly notes practical CPU/memory limits. This game uses standard accepted WebSockets and an active physics timer; that ceiling is not its gameplay capacity. Reference: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ .
