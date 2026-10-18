# Poly AV contributor instructions

Read docs/FLEET_RESEARCH.md, README.md, docs/CONTRACTS.md, docs/DESIGN.md and docs/ASSETS.md before implementation. User intent: optimize for simple fun; other models will produce alternate UI/assets. Shared gameplay and wire contracts belong to the lead integrator. Keep the default game playable while adding layers.

Stack: pnpm, TypeScript, Tailwind, Three.js, Cloudflare Workers + Durable Objects + WebSockets. Pure shared simulation; authoritative multiplayer; explicit solo mode. Do not add backward-compatibility layers to this baseline. Preserve unrelated changes. No speculative engine abstractions or persistent game progression. Optional saved chat identities are the only persistent player data.

Desktop AND touch are required. Room capacity default64 is provisional, not Cloudflare's connection maximum. Do not claim scaling beyond measured evidence. Real Supercharger site identities need primary-source provenance; compressed game placement and fictional air service must remain explicit.

Tests: pnpm test and pnpm build. Network changes: live room.integration.ts and chat.integration.ts against Wrangler as relevant. Protocol changes: update contracts and integration tests together. Visuals: check actual game, mobile portrait/landscape, errors and controls. Physical device claims require real device evidence.

Contributors should open a pull request; maintainers integrate to main and operate the Cloudflare deployment. Do not alter a shared deployment without authorization. Keep docs/VERIFICATION.md current with dated observations.

Fleet source of truth: shared/vehicles.ts. Do not present estimated AV mass/geometry or arcade tuning as manufacturer specs. All 26 catalog IDs must retain parked/NPC/drivable/takeover coverage. Protocol v14, the delivery/police and cockpit contracts in docs/DELIVERY.md, and new wheel assemblies are documented in CONTRACTS.md. Shared mesh geometry must not be disposed per entity.

Map source of truth: shared/map.ts; read docs/MAP.md before changing terrain, coastlines, bridges or landmarks. Do not move visual streets or water independently of authoritative surfaces and collisions.
