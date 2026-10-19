# Rocket-pad scan: exact-base paired observation

2026-10-18 Pacific. Base `a3bde952ace2bff9ff11771e5b728c5a48f6d7aa`; runtime candidate `2376ce12e61530df9c6a68119cf32357cb492dd3`. The candidate changes the rocket-pad distance scan only; later evidence-only commits do not change runtime code.

This is deterministic **shared simulation**, not an end-to-end room throughput, network, Worker CPU, rendering, mobile or driving-continuity test. It uses 64 generated drivers, fixed inputs, a 30-tick warm-up, and two artificial placements. In 250 measured 50 ms ticks, 63/64 city and 64/64 open-lane entities moved at least one metre; total substeps were 1,273 and 1,314 respectively. Each checked world matched exactly after every tick, and all six alternating timing pairs ended at matching world hashes. The city and open-lane results are different scenarios, not representative capacity estimates.

| Scenario | Base median process CPU | Candidate median process CPU | Difference |
| --- | ---: | ---: | ---: |
| City | 706.0 ms | 509.7 ms | -27.8% |
| Open lanes | 544.2 ms | 268.3 ms | -50.7% |

Medians are from six samples per revision; pairs alternate order. The first pair includes warm-up/JIT effects, and the CPU profiler samples are separate, sequential observations with profiling overhead. See `evidence/*.jsonl` and `*.cpuprofile` for raw results. The 18-logical-CPU desktop had 1-minute load about 10.2–11.1 during the run; Cursor, WindowServer, Beeper and Chrome were among active desktop processes. No other known local benchmark overlapped the reserved window. Available disk was 430 MiB before and 427 MiB after. These host effects and synthetic inputs limit the comparison.

To reproduce from a checkout with dependencies installed, copy this directory into a scratch directory, create `base` and `candidate`, then extract `shared` at the two SHAs with `git archive <sha> shared | tar -x -C <directory>`. Make the repository's `node_modules` available to the scratch directory. Run these commands sequentially, without other heavy measurements:

```sh
PICKUP_TICKS=250 PICKUP_PAIRS=6 pnpm exec tsx simulation.ts parity > evidence/parity-250.jsonl
PICKUP_TICKS=250 PICKUP_PAIRS=6 pnpm exec tsx simulation.ts bench > evidence/bench-250.jsonl
PICKUP_TICKS=250 PICKUP_PAIRS=6 pnpm exec tsx simulation.ts profile > evidence/profile-250.jsonl
```

`parity` compares complete worlds after every tick. `bench` verifies each final hash, reports movement, substeps, process CPU and wall time, and records load averages and logical CPU count. `profile` produces four CPU profiles. The deterministic lane poses are in `lanes.json`. Timing does not include full startup, networking, client drawing or normal player behavior. The room throughput and driving-continuity gates remain open.
