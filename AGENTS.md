# Poly AV contributor instructions

Read docs/FLEET_RESEARCH.md, README.md, docs/CONTRACTS.md, docs/DESIGN.md and docs/ASSETS.md before implementation. User intent: optimize for simple fun; other models will produce alternate UI/assets. Shared gameplay and wire contracts belong to the lead integrator. Keep the default game playable while adding layers.

Stack: pnpm, TypeScript, Tailwind, Three.js, Cloudflare Workers + Durable Objects + WebSockets. Pure shared simulation; authoritative multiplayer; explicit solo mode. Do not add backward-compatibility layers to this baseline. Preserve unrelated changes. No speculative engine abstractions, accounts or persistence.

Desktop AND touch are required. Room capacity default64 is provisional, not Cloudflare's connection maximum. Do not claim scaling beyond measured evidence. Real Supercharger site identities need primary-source provenance; compressed game placement and fictional air service must remain explicit.

Tests: pnpm test and pnpm build. Network changes: live room.integration.ts against Wrangler. Protocol changes: update contracts and integration tests together. Visuals: check actual game, mobile portrait/landscape, errors and controls. Physical device claims require real device evidence.

Use Chrome for authenticated external sessions. If browser/desktop automation fails, immediately read /Users/swyx/.agents/skills/resilient-computer-use/SKILL.md and follow supported recovery. Do not bypass actual authentication restrictions.

At completion, try to integrate to main and deploy within user-authorized scope; verify live paths and report limitations. Do not alter unrelated deployments. Keep docs/VERIFICATION.md current with dated observations.

Fleet source of truth: shared/vehicles.ts. Do not present estimated AV mass/geometry or arcade tuning as manufacturer specs. All 26 catalog IDs must retain parked/NPC/drivable/takeover coverage. Protocol v2 and new wheel assemblies are documented in CONTRACTS.md. Shared mesh geometry must not be disposed per entity.
