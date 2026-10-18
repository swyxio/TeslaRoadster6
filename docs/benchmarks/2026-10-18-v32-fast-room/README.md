# Local v32 high-speed room comparison · 2026-10-18 Pacific

These are short single-driver local Wrangler samples, not capacity, production, WAN or device measurements. The baseline was the v32 server patch in this directory on commit `146d90a94ccb3539be5b249fe7b980a7427b0f62`; the candidate added only the population and room-seed changes from `9210951`. The recorded patches were applied in sequence to that base and reproduce every candidate `shared/` and `worker/` file byte for byte. The source manifests hash those directories, the package metadata, input helper, and fixture files. Their aggregate is SHA-256 over sorted `hash␠␠path\n` lines.

| Source | Aggregate SHA-256 | Runs |
| --- | --- | --- |
| Baseline, first fixture | `648b83007ebd5106761946020b6b742e74a89e3a7febe41f334c07defecb8bce` | `baseline-straight.json`, `baseline-turn.json` |
| Baseline, roster-reporting fixture | `0007285fd301e58f6be21bbe4c30656af982a0dcb342af15255fd14069e904c8` | `baseline-straight-2.json`, `baseline-turn-2.json` |
| Candidate, roster-reporting fixture | `e5564ec739e741aec571a4b429d83c28340a42c9797092cd6d80dbb1963e09f1` | `candidate-straight.json`, `candidate-turn.json` |

The first fixture differed only in reporting: its stop response and script did not enumerate the ambient roster. The roster is collected after measurement. The exact later fixture and scripts are archived under `fixture/`; `fixture-first/` contains the two earlier variants. The lockfile at the base commit is Git blob `2e70396450fb7442dbf6462fdfa2f92cfc1fbc21`; the isolated copies used the same installed dependencies. Node was v22.22.2, pnpm 10.33.1 and Wrangler 4.151.1 on an 18-logical-CPU Apple M5 Pro host. One-minute host load during the paired runs ranged roughly 8.3–13.9; other development activity and fixture instrumentation were present.

Each run staged one Roadster at 56 m/s on a clear straight and used real v32 input scheduling, room ticks, physics and snapshots with the normal ambient world. The turn scheduled steer 0.35 for ticks 50–89 and zero otherwise. The baseline had 68 entities and the candidate 23; candidate room seeds selected different vehicle rosters between runs. All ticks used six global substeps and all runs had zero input rejections. All 17 common fixed-tick turn checkpoints through tick 200 matched at the reported x/z, yaw, speed and held-control precision. Wall-end positions are not comparable when tick progress differs.

| Scenario | Baseline 1 | Baseline 2 | Candidate |
| --- | --- | --- | --- |
| Straight, simulation seconds per ~10 wall seconds | 9.30 | 9.05 | 9.40 |
| Straight, callback elapsed wall p50/p95 ms | 2/3 | 3/8 | 1/2 |
| Straight, whole workerd process CPU seconds | 0.49 | 0.93 | 0.42 |
| Turn, simulation seconds per ~10 wall seconds | 9.05 | 9.15 | 9.45 |
| Turn, callback elapsed wall p50/p95 ms | 3/6 | 3/4 | 1/2 |
| Turn, whole workerd process CPU seconds | 0.83 | 0.63 | 0.38 |

Callback measurements use the local integer-millisecond clock and include snapshot construction and sends, but not scheduling before the callback or network flush. The `ps` CPU windows were slightly wider, approximately 10.2–10.3 seconds, and include the entire local isolate process and instrumentation; they are not per-tick CPU. Changing host load and random cohorts prevent a causal speedup claim. Every run advanced slower than real time; these samples do not identify why.

The separate `baseline-sampled.cpuprofile` covers 13 seconds including startup and warmup with a requested 1 ms V8 Inspector interval. Of 649 samples, 541 had `GameRoom.tick` in their ancestry, an approximate 541 ms at the requested interval rather than exact tick CPU. Sampling, descheduling and GC attribution limit the estimate. That profile was a separate run and is not one of the six paired results.

To reproduce, create an isolated checkout of the base, apply `baseline-server.patch`, and copy `fixture/` files into their corresponding repository paths. For the candidate apply `candidate-fleet.patch` as well. The fixture is diagnostic and must never be deployed:

```sh
pnpm exec wrangler dev --config tests/fixtures/wrangler.fast-room-profile.jsonc --local --ip 127.0.0.1 --port 8795 --inspector-port 9317 --persist-to /private/tmp/tesland-fast-profile
pnpm exec tsx scripts/profile-fast-room.ts http://127.0.0.1:8795 10
TESLAND_FAST_PROFILE_MODE=turn pnpm exec tsx scripts/profile-fast-room.ts http://127.0.0.1:8795 10
```

For process CPU, append the PID of the local Wrangler workerd isolate child to the driver command; its observation covers the whole isolate, not just the room. The archived inspector driver can capture a separate CPU sample. Use isolated local state and alternate builds and scenarios; collect more samples on a quiet host before drawing conclusions.
