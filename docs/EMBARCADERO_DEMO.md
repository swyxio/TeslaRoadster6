# Embarcadero visual experiment

This separate, offline scene explores the golden-hour concept; it is not the multiplayer map. Run `pnpm dev`, then open `/experiments/embarcadero/?autodrive=1`. The self-drive route stops at the end; Reset and Start self-drive replay it. WASD drives, Space flies, Shift boosts, B brakes, Q/E roll and H hides the HUD. Touch controls are available. Compare concept keeps the car running beside the illustration; Performance shows browser frame intervals and renderer counts.

## Comparison with the illustration

The illustration depicts a dense, sunlit waterfront with a strongly modeled car, busy traffic, detailed palms, textured façades, long broken shadows, a Ferry Building clock tower, ferryboats, and shimmering water below the Bay Bridge. It is an AI-generated target, not a screenshot of the game or a promise of exact geography.

The demo uses a licensed [Tesla Roadster 2020](https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8) by metarex.4d, CC BY 4.0, with fictional rocket nozzles. Its silhouette is a closer starting point than the ordinary fleet car, but it is not an official 2026 model. A single low sun casts shadows; a locally packaged, graded [CC0 sunset panorama](../public/embarcadero/environment/ATTRIBUTION.md) supplies the sky and car reflections. The water uses one animated shader rather than a reflection render pass.

The street has textured façades, modeled storefronts and a Ferry Building arcade. Generated asphalt, paving, masonry, shoreline and transparent palm fronds are applied to world-space geometry; their [prompts and processing](../public/embarcadero/textures/ATTRIBUTION.md) are recorded. Palm crowns switch detail by street segment. The braced bridge, ferries, piers and hills are spatial objects, so their perspective changes during flight. Repeated pieces share instanced meshes. The static, collidable traffic leaves the self-drive lane clear.

The result is still visibly stylized, not the photorealistic illustration: buildings and ferries are simplified, traffic and people are static, the water is patterned rather than a real reflection, and the sky has much less detail. Shadows and material response are still less rich than the concept. The collision footprint stays axis-aligned when the car turns, so its nose can clip into nearby scenery. The collision envelopes and approximate shoreline are for an arcade prototype, not a surveyed model.

## Golden-hour pass, 19 October 2026

The three HUD-free views below lock both car and camera at the same coordinates in each build. They show the concrete changes and also how much visual work remains compared with the illustration:

| View | Before | Revised |
| --- | --- | --- |
| Start | [Image](benchmarks/2026-10-19-embarcadero-golden/1-A-start.png) | [Image](benchmarks/2026-10-19-embarcadero-golden/2-B-start.png) |
| Ferry Building | [Image](benchmarks/2026-10-19-embarcadero-golden/1-A-ferry.png) | [Image](benchmarks/2026-10-19-embarcadero-golden/2-B-ferry.png) |
| Above the bay | [Image](benchmarks/2026-10-19-embarcadero-golden/1-A-aerial.png) | [Image](benchmarks/2026-10-19-embarcadero-golden/2-B-aerial.png) |

An alternating baseline/revised/revised/baseline run used Chrome 155 on an Apple M5 Pro at 1440 × 900, DPR 1. In an approximately 8.8-second scripted drive including turns and flight, browser frame-interval p95 was **9.6–9.7 ms baseline and 9.7–9.9 ms revised**. The fixed start view drew 586/615 calls and 972,178/837,992 triangles. The fixed ferry view drew 485/501 calls; the aerial view drew 437/446. One candidate driving run had five intervals over 20 ms, including two over 50 ms; neither baseline nor the other candidate run had any. Two of those followed long `renderer.render` CPU submissions, but their cause is not established. Host one-minute load ranged from 7.0 to 8.7; these short local traces do not establish a causal long-frame regression, device behavior or multiplayer performance.

The asynchronous GPU timer extension was available. Its sampled moving-render p95 was 3.68–3.74 ms baseline and 3.66–4.80 ms revised; this is GPU work for queried render commands, not presentation latency. In cache-disabled **local Vite development** startup, encoded transfer increased from 3,703,419 to 6,067,493 bytes, including the locally packaged textures and HDR; these are not production CDN or WAN measurements. Ready times were 169–198 ms and 165–207 ms respectively and are too short and variable to claim a startup improvement. Moving paths were similar but not identical, while all three fixed poses matched. Both instrumented source/asset sets stayed identical within their own pair.

The full self-drive reached the end of the street. Desktop drive, flight, landing and concept panel worked; emulated 390 × 844 portrait and 844 × 390 landscape both registered drive and lift with the canvas capped at DPR 1. No physical phone was tested. The [raw final trace](benchmarks/2026-10-19-embarcadero-golden/final-abba.json.gz), [playtest samples](benchmarks/2026-10-19-embarcadero-golden/local-playtest.json), [earlier trace](benchmarks/2026-10-19-embarcadero-golden/first-abba.json.gz) and [interrupted intermediate run](benchmarks/2026-10-19-embarcadero-golden/) are retained. The intermediate comparison was stopped after an aerial screenshot exposed a remaining shoreline edge; it is not used as a final result. The measurement used the then-current 0.0.49 label; the 0.0.50 release label and notes changed afterward, without changing the measured scene.

## Local comparison, 19 October 2026

Sequential Chrome 155 traces on one Apple M5 Pro used a 1440 × 900 viewport at DPR 1, the same car asset, a 2.5-second warmup and the same short drive, turns, flight and brake inputs. The trajectories diverged during flight: the before car stopped near z = -99 m, while the after car reached z = -115 m, ending about 16 m apart. The cameras also differ. These counts describe two observations, not a controlled estimate of the new scene's rendering cost. One-minute host load was 5.86 before and 5.10 after. Both traces ran at roughly 30 callbacks per second; the reason is unconfirmed. The user had a separate demo tab open. These are requestAnimationFrame intervals and renderer counters; they are not GPU-completion times, physical-device results, or multiplayer performance. This short pair does not establish a speedup or rule out a rendering regression.

| Measurement | Before | After |
| --- | ---: | ---: |
| Frame interval median / p95 | 33.3 / 34.2 ms | 33.3 / 34.1 ms |
| Median draw calls | 481 | 547 |
| Median triangles | 867,514 | 903,466 |

[Before image](benchmarks/2026-10-19-embarcadero/final-before-start.png) · [After image](benchmarks/2026-10-19-embarcadero/final-after-start.png) · [Before trace](benchmarks/2026-10-19-embarcadero/final-before.json) · [After trace](benchmarks/2026-10-19-embarcadero/final-after.json)

Collect a trace with `node scripts/embarcadero-perf.mjs <baseline-local-vite-url> <candidate-local-vite-url> <empty-output-directory>`. Use distinct servers for the two builds and close other heavy browser work. Compare trajectories and camera poses before treating their frame timings or renderer counts as a matched performance comparison. The main game's motion, multiplayer and release gates still apply separately.
