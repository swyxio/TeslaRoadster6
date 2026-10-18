# Visual/UI contributor brief

## Replacement surface

`src/vehicles.ts:createVehicle(kind)` returns a Three.js Group. Replace internals or load a GLB behind that factory; retain kind, origin and orientation. Loading must leave procedural geometry playable until ready; asset failure must remain visible/recoverable. Do not block room join on downloads. A full new renderer still consumes the same World/Player/Entity schema.

| Kind | Approx visual envelope (m) | Collision radius | Role |
|---|---|---|---|
| roadster | 2 wide × 1.5 high × 4.5 long | 1.8 | Hero, red; air jets |
| coupe | 2 × 1.5 × 4.5 | 1.8 | Gold/cream street car |
| truck | 2 × 1.7 × 4.9 | 2.4 | Silver utility silhouette |
| person | .7 × 2 × .5 | .65 | Readable on foot |

Collision bodies intentionally approximate arcade vehicles; visual replacements cannot enlarge gameplay hitboxes silently. +Y is up; −Z forward; root ground-center. Model at1 meter/unit, transforms applied, no baked world position. Root handles yaw; visual roll rotates around localZ. Proposed future named attachments: `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `jet_left`, `jet_right`, `muzzle`, `seat_driver`. Only current `jets` group is consumed; other sockets are reserved conventions, not implemented runtime APIs.

## Initial performance budgets (targets, not measured claims)

- Aim60fps desktop,30fps midrange mobile. DPR≤1.5 baseline; allow a quality control if measurement justifies it.
- Hero ≤12k triangles, other cars≤6k; LOD for distant peers when larger rooms justify it.
- Shared materials/geometry, instanced repeated city details. Do not make a texture/material per window or per player.
- Textures≤1024px mobile; use compressed textures only when toolchain is deliberately added. Keep first-play compressed downloads under3MB, optional art pack under8MB.
- Avoid mandatory realtime shadows/postprocessing. Add toggles with measured mobile cost.
- Pooled effects with bounded counts; dispose replacement geometries/textures. No per-frame asset/network requests.

## Environment

Read `BUILDINGS` for collision/roof positions. Decorative details must not hide playable lanes or station rings. Station IDs, source URLs and positions belong in shared data. Terrain/elevated roads/ramps require a shared height/collision design before meshes are introduced. Bridge, hillside and water models are currently scenery; do not imply traversable surfaces that simulation cannot support.

## UI alternatives

Keep immediate solo/play-with-friends choices. Preserve room link sharing, joining feedback, explicit reconnect, a visible return-to-menu, drive/lift/roll/boost/brake/enter-exit/recovery controls and station refill feedback. Touch must permit steering plus throttle plus lift without impossible finger placement. Menus neutralize input; release/cancel clears held controls. UI may use a framework if replacing the current HUD reduces complexity; do not introduce one only for a visual variant.

## Delivery format

For each supplied asset, provide source file and optimized export, author/source link, license/permission, dimensions, triangles, texture memory estimate and attachment names in `public/assets/manifest.md`. Current procedural assets are original project code; no remote artwork is bundled. Do not copy GTA, Tesla promotional models, music, trademarks-as-logos or third-party assets without usable permission. Referencing real location names is distinct from distributing third-party assets.

Include screenshots at desktop/phone portrait/phone landscape and demonstrate the asset in the actual playable route. An isolated model viewer is supplemental. Deliver alternatives in isolated scoped work; the lead selects/integrates one coherent default.
