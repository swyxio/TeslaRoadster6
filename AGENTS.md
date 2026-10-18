# Tesland contributor instructions

Read docs/FLEET_RESEARCH.md, README.md, docs/CONTRACTS.md, docs/DESIGN.md and docs/ASSETS.md before implementation. User intent: optimize for simple fun; other models will produce alternate UI/assets. Shared gameplay and wire contracts belong to the lead integrator. Keep the default game playable while adding layers.

Performance remains a priority. Follow the periodic checks and change-specific gates in docs/PERFORMANCE_RELEASE_GATES.md; a confirmed regression blocks the responsible change. Higher FPS alone does not satisfy the motion gate. Do not claim room capacity from connected sockets or ship an optimization whose end-to-end regression is unexplained.

Stack: pnpm, TypeScript, Tailwind, Three.js, Cloudflare Workers + Durable Objects + WebSockets. Pure shared simulation; authoritative multiplayer; automatically join the public Bay room or the room in an invite link. Do not add backward-compatibility layers to this baseline. Preserve unrelated changes. No speculative engine abstractions. The saved-driver candidate persists wallet, deliveries, achievements and owned vehicle configuration separately from room simulation; its global Starship counter uses eligible lifetime earnings. Existing per-room Mars data must remain preserved. Recovery codes may be remembered locally; never expose them in public snapshots or logs.

Desktop AND touch are required. The owner-selected room admission default is 64, provisional rather than validated playable capacity or Cloudflare's connection maximum. Do not claim scaling beyond measured evidence; retain the known throughput limitations and measure at the intended occupancy. Real Supercharger site identities need primary-source provenance; compressed game placement and fictional air service must remain explicit.

Tests: pnpm test and pnpm build. Network changes: live room.integration.ts and chat.integration.ts against Wrangler as relevant. Protocol changes: update contracts and integration tests together. Visuals: check actual game, mobile portrait/landscape, errors and controls. Physical device claims require real device evidence.

Keep docs/VERIFICATION.md current with dated observations.

Fleet source of truth: shared/vehicles.ts. Do not present estimated AV mass/geometry or arcade tuning as manufacturer specs. All 26 ambient IDs must retain parked/NPC/drivable/takeover coverage across seeded room cohorts, not permanent simultaneous copies. Keep the current budget of eight city cars, eight parked cars, two to four highway cars and four police unless measurements justify changing it. The six Vault models require ownership and are excluded from ambient traffic and the free fleet. The current wire protocol and delivery/police, cockpit and wheel contracts are documented in CONTRACTS.md. Shared mesh geometry must not be disposed per entity.

Map source of truth: shared/map.ts; read docs/MAP.md before changing terrain, coastlines, bridges or landmarks. Do not move visual streets or water independently of authoritative surfaces and collisions.
