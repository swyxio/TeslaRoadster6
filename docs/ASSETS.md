# Visual/UI contributor brief

## Replacement surface

`src/vehicles.ts:createVehicle(kind)` returns a Three.js Group. Replace internals or load a GLB behind that factory; retain kind, origin and orientation. Loading must leave procedural geometry playable until ready; asset failure must remain visible/recoverable. Do not block room join on downloads. A full new renderer still consumes the same World/Player/Entity schema.

The 26 ambient models and six special Vault models are defined in `shared/vehicles.ts` and [FLEET_RESEARCH.md](FLEET_RESEARCH.md). Each vehicle ID maps to an original procedural model; `person` is separate. The special IDs are kept outside ambient traffic and the free fleet picker; see [LUXURY_SHOWROOM.md](LUXURY_SHOWROOM.md). The registry's length/width defines collision envelopes. Dimensions include no extra clearance promise for decorative sensor rigs.

+Y is up; −Z is forward; root is ground-center in meters. Preserve `createVehicle(kind)`. Four-wheel vehicles use `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`; motorcycles use `wheel_f` and `wheel_r`, a `seat_driver`, and a `rider` group. The front wheels articulate with authoritative steering; motorcycle rider visibility follows occupancy and grounded lean is visual. The stock Rocket has ten named nozzles and separate vapor groups; other fleet models show fictional retrofit hardware and effects when a Rocket pickup or purchased kit makes them capable. `setThrusterEffects` uses authoritative capability and thruster flags. Geometry and materials are cached and shared; do not dispose on individual despawn. Model factory changes must preserve scale and tests across all registry IDs.

`src/luxury-models.ts` builds the six original showroom models. Its on-demand showroom preview shares the cached vehicle meshes and releases its own render target and WebGL context when closed. The wallet and purchase/collection flow remain in progress; in-game visual and performance verification are pending.

Distinct cues include open original Roadster, new sports wedge, Cybertruck's angular steel body, gold Cybercab, Falcon-door seams on X, tall Semi, Robovan, Waymo roof rigs/Firefly pod, orange Cruise sensors/pods, and mint symmetric Zoox/corner sensors. Trucks are tractors without trailers. All geometry is original, with no copied brand logos or remote artwork.

## Initial performance budgets (targets, not measured claims)

- Aim60fps desktop,30fps midrange mobile. DPR≤1.5 baseline; allow a quality control if measurement justifies it.
- Vehicles ≤12k triangles; LOD for distant peers when larger rooms justify it.
- Shared materials/geometry, instanced repeated city details. Do not make a texture/material per window or per player.
- Textures≤1024px mobile; use compressed textures only when toolchain is deliberately added. Keep first-play compressed downloads under3MB, optional art pack under8MB.
- Avoid mandatory realtime shadows/postprocessing. Add toggles with measured mobile cost.
- Pooled effects with bounded counts; dispose replacement geometries/textures. No per-frame asset/network requests.

## Environment

Read `shared/map.ts` for land polygons, bridge decks, roads and `BUILDINGS` collision/roof positions; see MAP.md. Decorative details must not hide playable lanes, charging stalls, station rings or shop rings. Distinguish purple Rocket pickups and fictional workshops from repair and air pickups. Station IDs, source URLs, positions and stall geometry belong in shared data. The Vault building footprint and gold forecourt ring derive from `LUXURY_SHOWROOM`; keep rendered surfaces aligned with the shared collision building and arrival area. The hill, overpass, Oakland stunt ramp and loop derive their geometry from shared data. Island bank and cliff meshes use the vertices in `shared/island-stunts.ts`; the banked oval uses `shared/oval-bank.ts` including its flat grid and junction transitions. The two launch ramp meshes follow `shared/island-jumps.ts`. Preserve those physical triangles and the separate flat roads when replacing visuals. The ferry mesh follows the authoritative moving deck. Parking and race markers use shared lot/course definitions. The China Basin Rocket Dome and soccer ball visuals follow shared capsule and ball state; do not move the floor, goals, walls or ceiling independently of their authoritative geometry. Any new terrain, elevated road or ramp must update shared height, support identity and collision before its mesh is introduced. Distant hills, bridge furniture and water are scenery; do not imply unsupported traversable surfaces.

## UI alternatives

Automatically enter the shared Bay room or the room in an invite link. A failed connection must not silently start local play. Preserve room link sharing, joining feedback, full-room alternatives, explicit reconnect, a visible return-to-menu, drive/jump/flip/roll/boost/brake/enter-exit/recovery controls and station refill feedback. Preserve access to the Mars fund, clear cash deduction and persistence rules, boarding location and victory acknowledgement on desktop and touch. Preserve Vault purchase and owner collection at physical workshops, with clear pending and failure states; these wallet-backed flows are still in progress. `FREMONT_SPACEPORT` owns the factory, pad, tower and boarding positions; decorative rocket meshes must not imply collision beyond those envelopes. Touch must permit steering plus a one-tap jump or flip without impossible finger placement. Menus neutralize input; release/cancel clears held controls. UI may use a framework if replacing the current HUD reduces complexity; do not introduce one only for a visual variant.

## Delivery format

For each supplied asset, provide source file and optimized export, author/source link, license/permission, dimensions, triangles, texture memory estimate and attachment names in `public/assets/manifest.md`. Current procedural assets are original project code; no remote artwork is bundled. Do not copy GTA, Tesla promotional models, music, trademarks-as-logos or third-party assets without usable permission. Referencing real location names is distinct from distributing third-party assets.

Include screenshots at desktop/phone portrait/phone landscape and demonstrate the asset in the actual playable route. An isolated model viewer is supplemental. Deliver alternatives in isolated scoped work; the lead selects/integrates one coherent default.

## Vehicle detail direction

Keep the environment low-poly and spend geometry on vehicles. `src/coachwork.ts` owns curved body cross-sections, wheel openings, and per-platform cabin landmarks. `src/vehicles.ts` owns assembly, specialized truck/pod shapes, wheels, sensors, lights and cached templates. Templates clone transforms but share geometry/materials; static meshes are combined by material. Do not change simulation dimensions to accommodate artwork.

Passenger cars use clearcoat paint and raked dark glass; rounded pods keep their contrasting glass belt; Cybertruck retains deliberate planar surfaces. Catalog and road use the same factory. Studio reflections are generated locally, without remote textures. These are stylized interpretations, not manufacturer CAD or photoreal replicas. More triangles alone are not acceptance: review silhouette, glazing visibility and lamp placement from front, side and chase-camera views.

Rocket nozzle reference: [Tesla reveal](https://www.youtube.com/live/qt5p-_tE8d0) and [Jalopnik event report](https://www.jalopnik.com/2288450/tesla-roadster-rereveal-new-design-production-plans-for-flying-car/) describe four rear nozzles, four upward-lift corner nozzles, and two lateral front-fender nozzles. Geometry, vapor shape and firing patterns are original, approximate game art; they are not a measured prototype model. Suction fans are separate from gas effects.

## Audio

The original procedural soundtrack and sound effects are synthesized locally and MIT licensed. See [AUDIO.md](AUDIO.md) for the cue contract, mix and replacement guidance. Do not add recordings or music without documenting their origin and license.

The clips and posters in `public/blog/recording-webgl-playtests/` are original captures of Tesland's own procedural game assets, made in an isolated local room with the checked-in `scripts/playtests/blog-drive.json` scenario. The audio-enabled clip contains the game’s original synthesized soundtrack and effects, not third-party audio. The capture and publication procedure is in [HEADLESS_PLAYTESTING.md](HEADLESS_PLAYTESTING.md#record-a-video-for-the-dev-blog).

## Vehicle detail budget · 2026-10-18

The controlled car, police, motorcycles and vehicles with custom finishes retain
the full model. Other cars switch to one shared, vertex-colored mesh beyond
125 m from the camera and return to full detail within 100 m. The hysteresis
prevents repeated switching at a boundary.
Standard fleet distant bodies use the same platform proportions and silhouette
sections, fewer loft segments and eight-sided tires. Distant luxury cars merge
their model geometry into one mesh. Sensors, wheel articulation, rocket hardware
and exhaust animation are omitted at that distance. The inactive model is
detached from the scene graph and retained for reuse, so it incurs no scene
matrix traversal. Entity-level incident warnings remain attached. Hidden
retrofit, effect and finish updates still address the cached detailed model.
Geometry/materials are catalog-owned; never dispose them on entity removal.
Detail selection is purely visual and changes neither simulation nor collisions.
DOM/HUD resolution remains native; the WebGL drawing buffer is capped at one
pixel per CSS pixel on both desktop and touch devices.
