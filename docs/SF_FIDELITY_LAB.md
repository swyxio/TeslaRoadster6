# San Francisco fidelity lab

2026-10-19 · A visual experiment, not a replacement for the current game.

Open `/?room=sandbox-sf-fidelity&visual=sf-hi` to drive the experiment and
`/visual-lab/` for three AI-generated *concept illustrations*. The illustrations
are not screenshots. The experiment overlays two generated facade images on 17
existing, ordinary San Francisco building envelopes, textures the existing
streets, and presents an original Roadster-inspired model. It does not reproduce
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
short warmup the existing view and the lab each showed 16.8 ms p95 frame
interval at spawn; after the same 3.5-second W input they showed 16.8 ms and
16.7 ms respectively. Draw calls were 286/306 at spawn and 149/166 after the
drive (current/lab). These are short, sequential, single-driver browser
observations on an active host; paths differed slightly. Frame callbacks and CPU
submission are not GPU completion, physical display or input-continuity proof.
The screenshot, scenario, manifest and authoritative trajectories are in
[`benchmarks/2026-10-19-sf-fidelity-lab`](benchmarks/2026-10-19-sf-fidelity-lab/).
Mobile screenshots are Chrome touch emulation, not real-device results. The
normal performance and crowded-room gates remain open.

The lab's visual result is intentionally limited: only 17 generic buildings
receive the flat facade overlays, while many landmarks and street surfaces keep
the original style. It is useful for comparing the idea and transport cost, not
as proof of a high-fidelity city. The next meaningful experiment is one coherent
walkable/drivable SF block with real kit geometry, correctly modeled curbs and
roofs, matched collisions, lighting and a measured mobile run. Decide whether
to expand after comparing its appearance and costs with this lab.
