# San Francisco fidelity lab

2026-10-19 · A visual experiment, not a replacement for the current game.

Open `/?room=sandbox-sf-fidelity&visual=sf-hi` to drive the experiment and
`/visual-lab/` for three AI-generated *concept illustrations*. The illustrations
are not screenshots. The experiment overlays two generated facade images on 25
existing San Francisco building envelopes, textures the existing streets, and
adds sidewalk tiles and trees. The Roadster-inspired model has a closer chase
camera and revised bodywork. It does not reproduce
the real buildings or the concepts' quality. Landmark geometry, the compressed
map, roofs, collisions, simulation and multiplayer remain the existing game.
In the menu, **Visual lab** switches back to the ordinary rendering. Textures and
the experiment's module are requested only when it is selected; the gallery's
illustrations are not game textures. If a facade image cannot load, the game
uses a procedural fallback and labels it. The sandbox is disposable and unsaved.

## How real games build cities

Epic describes generating the city in [The Matrix Awakens](https://www.unrealengine.com/blog/introducing-the-matrix-awakens-an-unreal-engine-5-experience)
using procedural rules, thousands of modular building pieces, and world
partitioning. Its Nanite and Lumen console rendering are not available to this
Three.js game. The transferable idea is the **authoring pipeline**, not a
promise that the browser will render a console city. We have no evidence about
GTA's proprietary asset pipeline.

For Tesland, combine reusable 3D kits with selectively hand-authored hero
assets and build the static map offline:

1. **Map first.** Trial [Overture building footprints](https://docs.overturemaps.org/guides/buildings/)
   and its optional heights, floors, roof shapes and source metadata in a single
   SF neighborhood. Check actual coverage: buildings may have only outlines, not
   elevations or facade information. [USGS 3DEP](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services)
   offers free, public-domain elevation data; verify the available SF resolution
   before choosing it. The terrain DEM is bare earth, not a building model.
   Transform geographic data into Tesland's compressed coordinates. Roads,
   terrain, building envelopes and roof support must be generated together in
   the authoritative shared map; never move graphics alone. Review Overture's
   per-source licensing and give required attribution, including OSM's ODbL.
2. **Make a small building kit.** In Blender, model a few reusable Victorian bay
   windows, cornices, stoops, storefronts and modern glass modules, each with
   consistent scale and materials. Use Geometry Nodes or an offline script to
   place them on footprints and pick bounded, seeded variations. The result is
   real shallow geometry near the driver, not a single photograph stretched
   over every wall. Keep important landmarks and the Roadster as separately
   authored assets. [Blender instances](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances.html)
   make reuse practical while editing. AI can propose generic material art and
   concepts, but a generated facade is not evidence of a real address or a
   collision surface.
3. **Bake reusable detail.** Bake materials, normals and ambient occlusion
   offline, then share a small atlas across many buildings. [Blender's baking
   workflow](https://docs.blender.org/manual/en/latest/render/cycles/baking.html)
   supports these maps. Keep the game's changing sun separate from baked contact
   shading; a single baked noon shadow would look wrong at night. Prefer a few
   carefully placed decals, trees and curb details over real-time global
   illumination everywhere.
4. **Export and stream.** Divide the neighborhood into spatial chunks; use
   nearby detailed meshes, simpler distant meshes and a distant horizon. Load
   ahead of a fast flying car and evict bounded chunks behind it; do not stream a
   separate asset for every window. Reuse geometry and material with Three.js
   [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), with
   cells small enough to cull. [glTF/GLB in Three.js](https://threejs.org/docs/pages/GLTFLoader)
   supports Meshopt/Draco and KTX2/Basis; test download, decode stalls and GPU
   memory together before choosing formats. WebP reduces transfer but generally
   expands to an uncompressed texture on the GPU. Avoid claiming the console's
   virtualized geometry or lighting capabilities for this path.
5. **Measure the complete drive.** Compare the same revision with this layer
   on and off, identical starting poses and scripted inputs, in representative
   street and flight views. Record cold/repeat transfer, total decoded texture
   memory, draw calls, CPU submission, frame intervals, GPU timing where
   supported, driving continuity and room progress. Repeat on a real iPhone or
   other intended mobile device and with the intended room occupancy before
   making performance claims. See [performance gates](PERFORMANCE_RELEASE_GATES.md).

Open map data plus project-owned kits avoid a per-view mapping API request, but
art creation, downloads, image generation, build time and hosting still cost
money. No vendor bill or labor estimate has been measured. Google's
[Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies)
limit storage, extraction and derived objects; Google photorealistic tiles are
not an unrestricted source for an offline, distributable game map. Check the
specific license and attribution for every acquired model, texture and dataset.

## What the first experiment tells us

On one Apple M5 Pro, local headless Chrome at 1280 × 720 and DPR 1, after a
short warmup the existing view and the lab showed 16.8 / 16.7 ms p95 frame
interval at spawn; after the same 3.5-second W input both showed 16.8 ms.
Draw calls were 286/306 at spawn and 149/173 after the drive (current/lab). These are short, sequential, single-driver browser
observations on an active host; driving speeds and paths differed. An earlier
run before the distant-car fix is retained separately in the same folder. Frame callbacks and CPU
submission are not GPU completion, physical display or input-continuity proof.
The screenshot, scenario, manifest and authoritative trajectories are in
[`benchmarks/2026-10-19-sf-fidelity-lab`](benchmarks/2026-10-19-sf-fidelity-lab/).
Mobile screenshots are Chrome touch emulation, not real-device results. The
normal performance and crowded-room gates remain open.

## Second visual pass

The concepts fill the frame with a large car, distinctive buildings, street
details and a distant skyline. The first lab view made the car small and exposed
large blank building faces and pavement. This pass brings the car closer,
reshapes its rear and canopy, adds shallow house trim and facade sides to eight
more buildings, and places instanced sidewalks and trees around existing roads.
It changes presentation only; the closer camera is specific to the lab's
Roadster chase view. The shared collision geometry and driving are unchanged.

[Before](benchmarks/2026-10-19-sf-fidelity-round-2/before/start.png) and
[after](benchmarks/2026-10-19-sf-fidelity-round-2/after/start.png) show the
same spawn view, not the illustrations. On one Apple M5 Pro, local headless
Chrome at 1280 × 720 / DPR 1 showed 16.7 / 16.8 ms p95 frame intervals at
spawn and 16.8 / 16.8 ms after the same short drive (0.0.48 / candidate).
Spawn draw calls were 305 / 308 and triangles 272,288 / 295,658. Host load,
camera view, vehicle positions and traffic varied; this is a bounded visual
check, not proof of equivalent GPU cost, motion continuity or mobile
performance. The [scenario and raw captures](benchmarks/2026-10-19-sf-fidelity-round-2/)
are retained for review. Mobile views were checked with Chrome touch emulation,
not a physical phone.

The result remains far from the concepts: the map still has blank buildings,
flat ground and simplified landmarks, and its generated facades are not real
addresses. A coherent SF block with real kit geometry, matched collision and
roofs, and measured mobile performance is the next meaningful step.

## Next: a halfway-to-the-concept street

This is a proposal, not a shipped feature or a claim that visual quality can be
measured as an exact percentage. Make one continuous 100–200 m drivable slice
near the SF spawn before improving the rest of the Bay. Match a street-level
view, a fast turning view and an airborne view against the same places in the
current game. The concept illustrations are inspirational, not geometrically
accurate references for those camera poses.

1. **A real Roadster asset.** Author a properly proportioned hero car with
   smooth body panels, wheel arches, glass, light bar, underbody and materials;
   preserve separate animated wheels, rocket effects, paint and the existing
   vehicle dimensions and origin. Its chase framing needs to be legible at speed
   as well as parked, without sacrificing road visibility or continuity.
2. **A coherent block.** Make four to six reusable SF building modules: bay
   windows, stoops, cornices, storefronts, roof edges and modern offices. Use
   actual shallow geometry where it changes the silhouette, and baked material
   detail elsewhere. Add one recognizable landmark and a simple layered
   skyline. Assemble against shared building footprints; if a solid wall, roof
   or terrain must change, update its authoritative surface and collisions with
   the visual mesh. Trees and other non-solid decorations must remain clearly
   separated from those collision contracts.
3. **Street scale and grounding.** Use repeatable asphalt, sidewalk and curb
   materials, road markings, a few poles and parked props, and several tree
   variants. Favor reusable meshes and atlases over one draw per window. Keep
   flight views and the car's clearance over roofs in the test, so visual detail
   does not introduce misleading invisible obstacles.
4. **Lighting and materials.** Try an outdoor reflection environment, tuned
   directional sun and hemisphere light, subtle baked ambient occlusion and a
   grounded car contact shadow that follows the car and fades with altitude.
   Keep the existing day/night cycle; do not bake a fixed sunny shadow into every
   surface. Test one bounded real-time shadow separately before adopting it:
   each shadow-casting light entails an additional render pass.
5. **Cheap production.** Author the small kit in Blender, use an offline seeded
   layout and export shared glTF/GLB meshes, materials and lightweight LODs.
   Batch repeated parts by spatial cell and preload the next cell ahead of fast
   cars; avoid loading or drawing a separate asset per window. Original or
   [Poly Haven CC0](https://polyhaven.com/license) materials and HDRIs are
   candidates, subject to per-asset quality and resolution review. See
   [Epic's City Sample](https://dev.epicgames.com/documentation/unreal-engine/city-sample-project-unreal-engine-demonstration)
   for the modular offline-generation pattern, [Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html),
   and [glTF loader support](https://threejs.org/docs/pages/GLTFLoader.html).
   These do not bring Unreal's Nanite or global illumination into WebGL.

As initial experiment sizes, not proven budgets, try 50–100k additional
visible triangles, one or two 1024-pixel material atlases and a 2–4 MB optional
download. A 1024² uncompressed RGBA texture plus mipmaps is approximately
5.3 MiB in memory; a small WebP download does not imply equally small GPU
residency. Test KTX2/Basis compression and decoder/upload cost before choosing a
format. The current spawn observation already has roughly 308 draw calls and
296k triangles, so measure the *whole* scene instead of treating the new block
in isolation.

Compare cold/warm transfer, decoded texture memory, draw calls, triangles,
CPU submission, frame p95/p99, GPU timing where available, input/motion
continuity and simulation progress. Run the same route on desktop and on a real
phone, including fast turns, flight and collision/roof checks. Browser touch
emulation and a single smooth-looking screenshot are not physical-device or
driving-continuity acceptance. Keep the existing lab optional until the new
slice is playable and the responsible changes have no confirmed regression.
