# Verification · 2026-10-17 Pacific

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
- Screenshots: `screenshots/live-desktop.png`, `screenshots/mobile-portrait.png`, `screenshots/mobile-landscape.png`.

## Known limits / next checks

No sustained load,128-player load, geographic multi-region latency, adversarial abuse soak or actual phone thermals/frame rates tested. Public room codes offer no privacy guarantee. Active rooms use billed DO duration and WebSocket messages; total public-room creation is not globally quota-limited by this app. Monitor usage before broadly promoting the sandbox.

Multiplayer presentation interpolates server snapshots without client prediction; remote latency can be felt. Camera can clip scenery at awkward angles; collision geometry is simplified. Trees/charger posts/bridge furniture are decorative. No sound, NPC traffic, quests, persistent inventory, shooting or death/respawn. The map has flat playable streets and scenic hills; it is not an accurate road network.

## Station provenance

Primary Tesla pages read2026-10-17; site identity/address only, not live stall availability or real air service:

- SF16th Street,2300 16th St: https://www.tesla.com/en_CA/findus/location/supercharger/8739
- SF Geary Boulevard,2675 Geary Blvd: https://www.tesla.com/en_GB/findus/location/supercharger/SanFranciscoCAsupercharger2
- Oakland2nd Street,255 2nd Street: https://www.tesla.com/en_gb/findus/location/supercharger/oaklandcasupercharger
- San Mateo Park Place,1200 Park Place: https://www.tesla.com/en_CA/findus/location/supercharger/sanmateosupercharger

Cloudflare reference: https://developers.cloudflare.com/durable-objects/api/state/ documents a32,768 hibernation-API WebSocket connection ceiling and explicitly notes practical CPU/memory limits. This game uses standard accepted WebSockets and an active physics timer; that ceiling is not its gameplay capacity. Reference: https://developers.cloudflare.com/durable-objects/best-practices/websockets/ .
