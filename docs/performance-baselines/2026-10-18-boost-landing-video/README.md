# Boost and landing video evidence · 2026-10-18

## Two-delivery visual pair

The separately built baseline was `009af539404082d5d5da4c3947bd013a6c2e3209` and the candidate was `68e62aa6c24029e22e0686744cdc860a567fc388`. The candidate checkout was clean. The baseline report recorded a dirty checkout; the operator identified the untracked `node_modules` symlink as the cause. Both used the same current recorder, seeded staged fixture and [`performance-drive.json`](../../../scripts/playtests/performance-drive.json), with scenario SHA-256 `eaeb7d04b955f2d2e8b8ab8fce2fcb02814afbaf4da4f19ebb38b7818d081f28`. The matching fixture, recorder and reporter hashes are in the reports.

Each local run recorded one driver using Street Pilot for two deliveries, then keyboard control for two upward jump bursts, a landing between them and sustained forward-powered flight. Both ended with pose revision 1 and had zero page and console errors. Peak observed altitude was 6.069 m on baseline and 6.075 m on candidate. Delivery and powered-flight frames were visually inspected in both recordings.

The [`performance-compare.mjs`](../../../scripts/performance-compare.mjs) `--require-route` comparison passed: all five route legs aligned with 0.369 m p95 and 0.475 m maximum three-dimensional separation across the 41 distance-normalized samples per leg. These are comparisons of received authoritative snapshots, not displayed-frame positions or proof of identical input timing. The [baseline](base-video/) and [candidate](candidate-video/) directories retain compressed reports, manifests, room trajectories and input traces.

The source WebMs and screenshots remain in the ignored local `playtest-runs/boost-landing-2026-10-18/` directory rather than the repository. The recordings were made with headless Chromium at 1280 × 720 on an Apple M5 Pro reporting ANGLE Metal. The candidate briefly overlapped a roughly 20-second local actionlint attempt. Both recordings had video capture enabled, so frame and room timing deltas are held; these are visual and route evidence, not a performance or GPU regression measurement.

The local `full-route-comparison.mp4` labels the two recordings side by side. It is silent H.264, 2560 × 784, 30 fps and 162.633 seconds, ending with the shorter source. Each source was trimmed by 8 ms, the manifest interval between `recordStart` and `beginRoom`; no time warp was applied. This approximates the staged-start alignment because those are command timestamps, not per-frame timestamps. The rendered delivery and flight milestone frames were inspected. Do not use the encoded video for timing measurements.

## Integrated smoke

After merging flight baseline `0b27e97`, the integrated candidate `a53ca5caa88ebf4fe47b0fa34650cfb89fafb8d7` built successfully and passed the short boost–jump–landing verifier in three fresh local rooms: [1280 × 720 desktop](integrated-a53ca5c-desktop/), [390 × 844 portrait](integrated-a53ca5c-portrait/) and [844 × 390 landscape](integrated-a53ca5c-landscape/). All observed grounded boost, upward jump and subsequent landing at unchanged pose revision 1, with zero page or console errors. Boost and landing frames were reviewed. The phone layouts used Chromium touch emulation, not physical devices.

The desktop scenario SHA-256 was `63d8e1b4601daae226f209ca82901637d48209b397554a74ccc6369daaf8b0e5`; both touch runs used `f7a96bdc2926807f3698fdb2b74b77692c0df239f1dade5be5a5cc93844dde95`. Each directory contains the compressed manifest, pose and input traces, and verifier output. The manifest target ref is operator supplied; it does not independently attest the built assets. These checks do not replace the [performance release gates](../../PERFORMANCE_RELEASE_GATES.md).

From the local `playtest-runs/boost-landing-2026-10-18/` directory, run `shasum -a 256 -c /absolute/path/to/docs/performance-baselines/2026-10-18-boost-landing-video/recordings.sha256` to verify the retained recordings. The [checksum list](recordings.sha256) records the original videos and the local comparison render.
