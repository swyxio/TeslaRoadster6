# Structure collision audit — 2026-10-18

User report: visible collisions in the published WebGL playtest, including building roofs and curved surfaces. Production baseline: `1f722dd` (0.0.32, protocol 46). Work is isolated on `codex/structure-collision-audit`, initially layered on corrected landmark candidate `15d23f3`. This document describes an unreleased candidate until a dated production verification says otherwise.

## Evidence

The published v0.0.27 video has a matching local 151-sample trajectory (`blog-1792357921095-b45c34e1`). At ticks 144→146, the Roadster goes from **53.6448 m/s to −10.3333 m/s** near `(-260.351, -31.239)`. Sutro Tower is centered at `(-270, -30)`: the old physics used its entire 14×14×32 m envelope, although the visible structure has two narrow posts and elevated crossbars. The impact occurred before the visible post. A second impact near de Young must be judged against its real lower building and tower, rather than assumed erroneous because it slows the car.

Independent pure-simulation drops also landed on empty Salesforce and San Jose rotunda corners. Exact Three.js constructor rays found no surface there. Analytic curved-roof heights were above the rendered faceted caps by up to **1.106 m** for the rotunda, **0.473 m** for Salesforce and **0.215 m** for Coit in a bounded 41×41 grid. These are geometry observations, not browser frame-time or production incident-rate measurements.

The Oakland stunt ramp could be crossed sideways at ground height even where its visible wedge was 2.857 m high. The Dome's airborne containment used only the pivot: a rising Roadster could have its top at 51.063 m before contacting the 50 m ceiling. Bridge tower legs and the stadium brick frontage were visible but non-colliding.

## Generalized finding

This is a repeated mismatch between three descriptions of the same object: the visible mesh, the collision volume, and the landing/support surface. The fix is to share authored structural parts, while keeping a cheap surrounding envelope only for candidate lookup. It is not a reason to replace the physics engine or make every visual detail solid.

| Mechanism | Verified examples | Shared repair |
| --- | --- | --- |
| An enclosing rectangle treated as solid | Sutro's open frame; round-tower corners; open landmark columns/decks | Explicit occupied parts, including their bottom heights and open gaps |
| Different roof math or transforms | Faceted tower caps; pitched house roofs; concave dish; tilted slide | Match facet/ring counts, taper and transform order in the shared sampler |
| Visible mass absent from physics | Bridge legs/crossbeams, stadium frontage, launch-tower arms | Render and collide from the same static part list; index overhangs |
| Vehicle pivot used instead of its body | Rotunda roof edge, NASA tube underside, airborne Dome ceiling/wall | Bounded footprint-height extrema and whole-body Dome containment; landing and continued support use the same contact |

These are verified mechanisms, not a count of player incidents. The 393 profiled building records below are audit coverage, not a claim that every one was broken. The 37 remaining simple-box records are the Vault, hospital, fourteen station venues, twenty tech-campus blocks and the monument plinth; their structural boxes match their rendered main masses. Decorative facades, charger furniture and monument details have the explicit limits listed below.

A second pass reproduced an airborne Roadster at rotunda-local x=8.5, y=18: its center cleared the 16.925 m roof, while the inner edge met an 18.933 m facet. At NASA-local x=5.7, y=11.6, the center cleared the 13.892 m underside, while its inner edge intersected the 11.842 m underside. The variable-height contact now clips the upright footprint against the structural silhouette and finds top/bottom extrema at vertices and facet-ridge crossings. Fourteen independent mesh-ray/contact tests cover these misses, clear near misses, sustained support, tapered cylinders, pitched/diamond roofs, dishes and tilted slabs. Flat boxes and untapered upright cylinders keep constant-height fast paths.

The smallest durable prevention is two complementary checks: compare the sampler to actual geometry constructors, and test representative whole rendered models and real simulation contacts. Merely asserting that a rendered object fits inside a large hitbox would accept the original bug. A general triangle-collision engine would carry much more runtime and integration risk without being necessary for these verified causes.

## Candidate repairs

- Northern and all 49 solid Southern legacy landmark structural masses are authored once for rendering and physics. Posts, roofs, domes and raised decks have separate occupied volumes; empty gaps remain empty. Window paint, thin trim and amphitheater rings remain decorative. Mission Peak remains shared terrain.
- Chabot, Oakland Zoo, NASA Ames' horizontal faceted barrel and Levi's Stadium have explicit matching profiles. Stanford's dish is a visible double-sided concave shell; the tilted Aqua Adventure slide retains its slope.
- Houses use their actual pitched roofs; flat roofs include their visible coping slab. Rooftop delivery elevations come from the same support sampler.
- Transamerica's tapered pyramid, stepped clock towers, SFO's tapered shaft/cab and mission bell towers have distinct volumes. Round buildings use their rendered polygon counts, taper and cap rings rather than a rectangular tower and analytic sphere.
- Bridge tower legs/crossbeams and stadium masonry consume the same box descriptions in rendering and simulation. Roads and the stadium entrance retain their openings.
- Fremont's factory roof panels, static launch-tower arms/cap and pad use shared structural descriptions. Tribune's upper tower and pitched spire are included. The spatial index includes overhangs without enlarging the rendered building body.
- The old Oakland ramp reuses the oriented sweep already used by island ramps, including lateral and airborne approach.
- Airborne Dome containment considers the whole yaw/pitch/roll vehicle box before attaching or bouncing it. Existing grounded, gate and adhered driving semantics remain separate.

## Static geometry and runtime budget

`Building.parts` stores immutable local structural primitives, built once when the map is initialized. The spatial grid remains the broad phase. A broad-phase envelope is never itself evidence of a solid wall when parts exist. There is no runtime mesh raycast, catalog scan or Three.js dependency in shared simulation. Polygon footprints, primitive extents and dome rings are cached. No structural metadata is added to multiplayer snapshots.

A part's `y` is its center except for a dome, where it is the rim/base. Its `w/d` are full extents (diameters for round primitives). The roof primitive distinguishes a cone rotated before nonuniform scale from the original house/mission cone scaled before yaw; those operations produce different roof footprints. Optional facet/ring counts, taper and supported rotations match existing models. Inverted dish surfaces are thin shells, not invisible flat disks across the open bowl. Part identity is `roof:<building-index>:<part-index>` for precise roof support and edges. New-landmark profiles remain limited to eight parts/site; legacy sites have an explicit sixteen-part cap because some have eight independent columns plus roof/base. Those counts are bounds, not performance acceptance.

Route planning and off-road recovery retain their conservative main-building clearance, which includes turning room. Newly indexed bridge/arena beams check vertical clearance so overhead architecture does not block a ground route. Physical collision uses the actual parts. An attempted simultaneous tightening of route/recovery clearance caused an Opera House approach to stall; the change was removed and the regression case retained.

## Remaining boundaries and audit disposition

- The Rocket Dome still has a pre-existing, test-enforced side/end fly-in policy that differs from its transparent shell. This pass fixes body containment and solid surrounding masonry; it does not silently change arena admission rules.
- Car/structure contact remains a bounded arcade approximation: it combines an upright horizontal footprint with pitch/roll-aware vertical bounds, not a full oriented rigid body against each triangle. Roof contact is held while the body overlaps an edge. Normal 80 m/s flight and at most eight substeps limit translational increments to about 0.5 m, but endpoint collision checks can still miss a small diagonal corner graze (a source-derived post example has about 5 cm midpoint overlap with clear endpoints). No large normal-speed straight-through post tunneling was established. Tire suspension and Dome presentation smoothing remain separate.
- Cable strands, paint, small lamps, signage, foliage and statue detail remain decorative. Massive buildings, bridge legs, decks and roofs must not use that exemption.
- Overpass top/underside, island bank, banked oval and island cliff already share their authored geometry. No material mismatch was reproduced. The oval's 0.1 m visual offset and the loop's roughly 6.4 mm maximum chord approximation are distinct from the metre-scale defects above.
- Tech-campus main bodies already match their shared boxes, including the stepped Apple Park courtyard; roof color panels are at most centimetres thick. The First Delivery monument deliberately collides only at its plinth: its tilted display car and support remain decorative. Dynamic Starship construction/launch, construction-yard props, rocket fins, thin gantry rods and tower facade trim remain visual. They must not be described as audited drivable surfaces.
- Dome analytic shell contact differs from the rendered facets by up to roughly 5 cm. Presentation orientation smoothing can briefly intersect a shell during an adhesion transition; physical containment tests do not establish rendered transition quality.

## Verification status

Focused source tests and actual-render rays are required together. New cases cover the recorded Sutro approach, empty corners, roof rims, post/gate openings, bridge-road clearance, ramp sides/launch and Dome body containment. The first full run passed 1,042/1,052; failures exposed obsolete envelope/height fixtures and a real self-drive clearance regression. Corrections are documented above. The pre-footprint-extrema fast path passed 1,053 tests. After the body-edge repair, four existing tests still expected pivot-only roof heights or started embedded in the now-correct body contact. Their fixtures were corrected against sampled/rendered footprints, preserving the rising-roof catch case. The resulting **1,067/1,067 tests and build/typechecks passed** on provisional 0.0.34 / protocol 48. Local protocol 48 Wrangler room/prediction integrations and a final provisional-0.0.34 desktop Sutro pass also succeeded; the earlier emulated-touch captures precede the footprint-extrema repair, with unchanged flat Sutro geometry.

The expanded `pnpm exec tsx scripts/audit-landmark-surfaces.ts` samples all **1,338 parts on 393 of 430 indexed building records**, across ten shape/transform variants. All **590,058 samples** had matching occupied footprints and no missing spatial-index entry; the largest sampled top/bottom difference was **0.000022 m** (Float32 constructor geometry versus the double-precision sampler). It checks undersides for closed shapes. Convex dome interiors and the dish's explicit 20 cm shell are authored collision policies, not a claim that an open hemisphere mesh is a closed solid. This finite sample is not an exhaustive proof of contacts or coverage of decorative objects.

Actual local Chrome desktop 1280×720, emulated portrait 390×844 and landscape 844×390 captures all drove through Sutro's open center, with positive authoritative speed and no captured page/console errors. Browser evidence, traces, full-test/build logs and raw sampled geometry are under [the evidence directory](benchmarks/2026-10-18-structure-audit/). No physical-device or displayed-motion timing claim follows.

Final client asset versus dependency `15d23f3`: **+9,383 raw bytes / +3,904 Python-gzip bytes**. Both short simulation-cost pairs predate the final footprint-extrema change and are deliberately not a performance pass: host variance was high, and four of five drivers slowed at contacts. Initial timings before the box fast path were median 0.591/0.808 ms and mean 0.792/0.966 ms (base/candidate), with reservation-boundary contention unresolved. The later pair was median 1.607/1.644 ms, p95 7.086/6.327 ms and mean 2.600/2.436 ms; final driver poses matched. These results do not establish a causal speed change or room capacity. Both raw observations are retained; no benchmark repeated merely to seek a pass.

Final integrated motion/throughput evidence, hosted checks, release version/protocol assignment and actual production revision verification remain pending. The driving-performance owner explicitly relinquished its slot while draftPR109 remains on HOLD for its own failed gates. CorrectedPR92 deploys first; this audit follows as0.0.34/protocol48, subject to actual main and independent checks. No experimental clock change is included.

Hosted run `39179651113` compared `8b3d6fe` with `d1d405b` (including the separate landmark dependency). The three routes aligned within 0.989 m p95. Browser callback p95 was 66.7 ms on both, and room simulated/wall ratios were 0.935 / 0.933, both below the 0.95 target. Synthetic steady and bunched motion ranges were identical. This is a descriptive, single-client virtual-Mac observation, not a smoothness, GPU, physical-device or capacity pass. The runner was heavily loaded; exact conditions and raw traces are retained in the evidence directory. It does not isolate the cost of this audit from its landmark dependency.

Final combined candidate `f9087ca` integrates landmark head `ff86a1e` and the already-merged overflow and recording changes. It assigns 0.0.35 / protocol 48 and passes all 1,071 tests, build/typechecks, and local room/prediction integrations. Audited geometry is unchanged from `d1d405b`. Production readback remains a separate release step.

## Final performance follow-up


A final hosted pair (`39180779509`, actual main `dacde0c` versus `65fbecd`) aligned within 0.832 m p95, but callback p95 increased 66.7→116.7 ms and room progress declined 0.932→0.911. The three-CPU VM's load moved 20.9→6.7 for baseline and 6.4→20.3 for candidate. This is an **unconfirmed performance signal**, not acceptance or an established causal regression. Both source traces and conditions are retained. A short local pure-step diagnostic then saw identical end poses, process CPU 3.039/2.605 ms per step and wall mean 5.245/5.602 ms; host load climbed 126.6→132.8. Four cars slowed at contacts. It cannot establish a performance change; browser timing was deferred because the Mac remained heavily contended.

Source review identified avoidable ascent work. The final follow-up rejects vertically unreachable underside parts before footprint clipping, reuses current/previous body bounds and skips police roof samples that cannot change the floor. It preserves the existing contact criteria; bounds are recomputed after an actual hit. A catalog test also guards all 104 legacy coordinate keys against aliases. **1,072 tests and the local build/typechecks passed** after this follow-up. The existing chunk warning remains; no timing improvement is claimed. These last changes alter rejection work, not authored geometry, networking or render assets; earlier mesh audits and room checks retain that limited scope.


### Repeated hosted signal and aggregate rejection

Hosted run `39184296226` compared actual main `dacde0c` with `b594a18`. The three route legs aligned within 0.845 m p95. Callback p95 again changed **66.7→116.7 ms**, and room progress **0.930→0.912**. The three-CPU virtual Mac remained contended (baseline load 30.54→10.54; candidate 15.19→16.64). Final renderer samples were 365/367 calls and 214898/214904 triangles; sampled CPU p95 was 15.5/15.2 ms. These samples neither establish the cause nor dismiss the repeated slower result. **PR111 is held for performance investigation; green completeness checks are not acceptance.** Other independent releases continue.

The spatial index previously computed each building's aggregate bounds, then discarded them. A subsequent shared fix caches that enclosure and rejects clear buildings before detailed part collision, landing and presentation sweep checks. Overhanging roofs and rotated parts are included in the same enclosure used by the index. It does not narrow `nearbyBuildings` for other callers. More than 8,000 catalog poses agree with exhaustive part contact; a separate overhang fixture covers contact and sweep rejection beyond the main facade. All **1,074 tests and build/typechecks passed**. This is a reduction in unnecessary work, not yet a measured end-to-end improvement. Release numbering will follow actual main after this hold resolves.
