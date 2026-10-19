# Economy rebalance · paired local performance observation

On 2026-10-18 Pacific, a candidate-first pair compared clean checkouts of main `e07f0bec4e62737fedcfc72ab9714f4dd4e7a1bf` and candidate `a9e86751d67a6e8cb934cdb557b648616ba71c6f`. The candidate ran 02:12:36–02:14:02 UTC, then main ran 02:14:11–02:15:37 UTC. The local pair used Chromium with ANGLE Metal on an Apple M5 Pro, 18 logical CPUs, 1280×720 at DPR 1. Both used the same installed dependencies and lockfile, isolated local rooms, fixture, scripted Street Pilot delivery and flight. No video was captured.

| Observation | Main | Candidate |
| --- | ---: | ---: |
| Animation callback interval p95 | 16.8 ms | 16.8 ms |
| Observed room simulation / wall | 0.955 | 0.954 |
| Maximum snapshot gap | 185 ms | 195 ms |

All three route legs aligned; trajectory separation was 1.550 m p95 and 2.064 m maximum. One-minute host load was 11.5 → 9.9 for the candidate and 9.0 → 9.5 for main. At the start, Codex and Chrome renderers, a Node process and WindowServer were active; Chrome and WindowServer remained active at the end. Longer-window load reflected earlier activity. This one local pair did not reproduce the hosted slowdown, but does not establish a general performance or capacity guarantee.

The [main traces](base-traces.tar.gz) and [candidate traces](candidate-traces.tar.gz) contain the reports, browser manifests, input events, trajectories and synthetic motion traces. Reproduce sequentially with `node scripts/performance-report.mjs --target-root CHECKOUT --out NEW_DIRECTORY --gpu metal`, then run `node scripts/performance-compare.mjs BASE/report.json CANDIDATE/report.json --require-comparable`. The runner rebuilds the selected checkout. Browser intervals measure callback timing, not GPU completion; the motion series are synthetic, and room progress uses received snapshots from one local client.
