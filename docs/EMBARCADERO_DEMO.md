# Embarcadero visual experiment

This separate, offline scene explores the golden-hour concept; it is not the multiplayer map. Run `pnpm dev`, then open `/experiments/embarcadero/?autodrive=1`. The self-drive route stops at the end; Reset and Start self-drive replay it. WASD drives, Space flies, Shift boosts, B brakes, Q/E roll and H hides the HUD. Touch controls are available. Compare concept keeps the car running beside the illustration; Performance shows browser frame intervals and renderer counts.

## Comparison with the illustration

The illustration depicts a dense, sunlit waterfront with a strongly modeled car, busy traffic, detailed palms, textured façades, long broken shadows, a Ferry Building clock tower, ferryboats, and shimmering water below the Bay Bridge. It is an AI-generated target, not a screenshot of the game or a promise of exact geography.

The demo uses a licensed [Tesla Roadster 2020](https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8) by metarex.4d, CC BY 4.0, with fictional rocket nozzles. Its silhouette is a closer starting point than the ordinary fleet car, but it is not an official 2026 model. The waterfront has a modeled Ferry Building and piers, simplified ferries and railings, procedural asphalt and water, a three-dimensional far shoreline, and a single warm directional light with shadow mapping. Repeated details share geometry; the water uses one shader rather than a reflection render pass.

The result remains stylized: palms and buildings are simplified and repetitive, the water and sky are procedural, traffic is sparse and static, and the car's surfaces do not have the concept's photographic lighting or reflections. The shadows are still hard and blue in places. The next substantial visual gains would require higher-quality palm and architectural assets, more varied materials, denser dressing, and carefully budgeted lighting and water reflections—not just increasing polygon counts. The scene's collision envelopes and approximate shoreline are for an arcade prototype, not a surveyed model.

## Local comparison, 19 October 2026

Sequential Chrome 155 traces on one Apple M5 Pro used a 1440 × 900 viewport at DPR 1, the same car asset, a 2.5-second warmup and the same short drive, turns, flight and brake inputs. One-minute host load was 5.86 before and 5.10 after. Both traces ran at roughly 30 callbacks per second; the reason is unconfirmed. The user had a separate demo tab open. These are requestAnimationFrame intervals and renderer counters; they are not GPU-completion times, physical-device results, or multiplayer performance. This short pair does not establish a speedup or rule out a rendering regression.

| Measurement | Before | After |
| --- | ---: | ---: |
| Frame interval median / p95 | 33.3 / 34.2 ms | 33.3 / 34.1 ms |
| Median draw calls | 481 | 547 |
| Median triangles | 867,514 | 903,466 |

[Before image](benchmarks/2026-10-19-embarcadero/final-before-start.png) · [After image](benchmarks/2026-10-19-embarcadero/final-after-start.png) · [Before trace](benchmarks/2026-10-19-embarcadero/final-before.json) · [After trace](benchmarks/2026-10-19-embarcadero/final-after.json)

Reproduce with `node scripts/embarcadero-perf.mjs <local-demo-url> <output.json>`. Use distinct servers for the two builds, close other heavy browser work, and compare the resulting traces and images. The main game's motion, multiplayer and release gates still apply separately.
