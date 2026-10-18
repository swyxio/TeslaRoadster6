# Sandbox and vehicle collection observations — 2026-10-18 Pacific

These are local diagnostics, not a release-gate pass or a capacity measurement.
The paired base is `372716699bbd48eb630beda161ac2fa1613a5948` (protocol 44);
the candidate is `a7861479313e3482f5d3b5d0b5cf88e99b754407` (protocol 46).
The later 45/46 release numbering was provisional. Retain these exact identities
when comparing later revisions. The base throughput worktree contained only the
identical copied test fixture and benchmark; its application runtime was clean.
The candidate worktree was clean. Its runtime includes the flight and region
integration under test. Both sides used Node 22.22.2 on the same Apple M5 Pro,
18 logical CPUs, with the load generator and local Wrangler on that host.

## Room and wallet

The local fixture staged five identical Roadsters and the same 22 initial
traffic entities on both revisions; four drivers had saved profiles. Start
world time was 12.50 s in the base and 12.40 s in the candidate. For the 60 s
measurement, inputs were sent at 20 Hz and 48 paid paint actions at the same
schedule. All actions succeeded, queues drained, there were no input rejections
or disconnects, and all four candidate profiles recorded `roadster`. Server
tick timings are synchronous work time, rounded to milliseconds. Acknowledgement
latency is time to a snapshot whose applied sequence reaches an input; an
intervening later input may have superseded it.

| Observation | Base | Candidate |
| --- | ---: | ---: |
| Simulated / wall seconds | 57.10 / 60.008 | 56.95 / 60.007 |
| Sim / wall | 0.95154 | 0.94906 |
| Ticks | 1,142 | 1,139 |
| Tick work p95 / max | 1 / 6 ms | 2 / 5 ms |
| Snapshot gap p95 | 107.136 ms | 108.007 ms |
| Input acknowledgement p95 | 207.942 ms | 209.146 ms |
| Decoded snapshot bytes | 73,008,088 | 72,547,627 |
| One-minute host load before → after | 5.371 → 5.572 | 5.016 → 7.330 |
| Load-generator event-loop p95 | 21.35 ms | 21.40 ms |

The candidate was below the existing 57-second and 0.95 targets. A single
near-threshold pair with a changing host load does not attribute the 0.15 s
(three-tick) difference to the feature. The raw trace has synchronous tick
samples but no collection-commit timestamps, so the difference cannot be
correlated with those commits. The staged cars all reached a map boundary and
were stationary by about 20 s, remaining near zero speed for the final 30 s;
their recorded displacements were identical across revisions, about 867–896 m.
Thus this exercised initial collection and ongoing wallet actions, but it is
**not** a 60-second sustained-moving-vehicle benchmark. A future valid sample
needs a controlled drivable route and a measured movement requirement.

For an earlier contended smoke sample see `throughput-candidate-smoke.json.gz`.
The paired raw observations are `throughput-{base,candidate}.json.gz`. The
benchmark and Worker fixture are `tests/luxury-wallet-throughput.bench.ts` and
`tests/fixtures/luxury-wallet-worker.ts` in the candidate revision; their
respective SHA-256 hashes are `9861465eb4005eed7378438aad91cfd3f50c9d4c0b73dd736e65967038029aa4`
and `d217942722310a0b36eb87efdf8936fc05f2d7f3fd9a0f437cd9a2dd918ffbf8`.
`stage-smoke.mjs` records a preparatory fixture probe, not the paired measurement.

## Corrected sustained-moving room pair

A later pair used the same 22 seed-0 traffic entities and five staged Roadsters,
with the same initial traffic and car JSON and world time (12.40 s) on both
sides. Four had saved profiles; per-client throttle feedback used the latest
authoritative speed to stay near 10–12 m/s. There were no repositionings or
collection resets during the run. A pure-simulation preflight on each revision
recorded 114.9 m in the first block and 118.8 m in each subsequent block for
all five cars; see `route-preflight-{base,candidate}.json.gz`. The active room
run required at least 75 m, at least 50 snapshots, and speed above 5 m/s in at
least 80% of snapshots, separately for each of five cars and each 10-second
block. Its minimums were 103.27 m, 89 snapshots and 95.8%, respectively.

The base was `372716699bbd48eb630beda161ac2fa1613a5948` with identical test
fixtures copied into its otherwise unmodified runtime. The candidate was
`0883a8a2e25ca739e4292b954340502242b688f9`, whose application runtime matched
`a786147`. The benchmark, Worker and feedback fixture hashes were identical
on both sides: `26ae4e7f41c234b753eca8567b6ba379fe24ebe2f76a444ae4c3c342867e4ae8`,
`d217942722310a0b36eb87efdf8936fc05f2d7f3fd9a0f437cd9a2dd918ffbf8` and
`2ecac12c65d47401ea8817ea353177e86751486815bd009dfa992d4ffd78ee61`.

| Observation | Base | Candidate |
| --- | ---: | ---: |
| Simulated / wall seconds | 56.65 / 60.006 | 57.20 / 60.009 |
| Sim / wall | 0.94407 | 0.95319 |
| Ticks | 1,133 | 1,144 |
| Tick work p95 / max | 1 / 40 ms | 1 / 8 ms |
| Snapshot gap p95 | 109.048 ms | 107.528 ms |
| Input acknowledgement p95 | 211.502 ms | 208.045 ms |
| Decoded snapshot bytes | 45,868,610 | 46,398,121 |
| One-minute host load before → after | 4.99 → 6.21 | 6.29 → 6.75 |
| Load-generator event-loop p95 | 21.50 ms | 21.46 ms |

The candidate met the existing 57-second / 0.95 throughput target in this
observation; the base missed it. Both completed 48 paid actions, acknowledged
all inputs, had no rejections or disconnects, drained queues (maximum one),
and left no pending journals. All four candidate wallets recorded the Roadster
collection. This single same-host pair does not establish a causal improvement
or playable capacity. It does not erase the earlier candidate's failed sample.

The local readiness probe initially reached a stale protocol-43 service on port
8797, so the baseline benchmark aborted before warmup. The pair was then run
once on a fresh port after validating each worker's protocol. Raw results and
runner output are `corrected-throughput-{base,candidate}.json.gz` and
`corrected-run-{base,candidate}.log.gz`; `run-corrected-wallet-pair.sh` retains
the local orchestration. Its absolute `/private/tmp` paths require adaptation.

## Recipient snapshot microbenchmark

A same-process synthetic world with 64 players each holding all 13 collection
badges serialized 64 recipient-specific snapshots. Over 30 samples after five
warmups, decoded bytes per broadcast fell from 8,487,936 to 7,330,752; p50/p95
serialization plus UTF-8 counting was 1.668/2.245 ms versus 0.977/1.344 ms.
The reported one-minute load was 4.45 throughout. This is neither transport nor
room throughput, and does not establish playable 64-player capacity. See
`snapshot-{base,candidate}.json.gz` and `snapshot-bench.mts`.

## Isolated desktop motion diagnostic

A fresh local one-player room removed ambient entities and placed a stopped
Roadster at (-300, -2050), yaw π. The actual Chrome renderer was ANGLE Metal
on Apple M5 Pro at 1280×720, DPR 1. Each 10-second script held W, added D,
reversed to A, resumed W, braked, then released. Each profile ran once on each
revision: zero requested delay; 75 ms each way (nominal 150 ms added RTT);
75 ms each way with FIFO bunched jitter; and a 250 ms downlink delivery gap.
Actual routed message timing, browser input and scene frame times are retained.
All eight observations completed without in-window JavaScript errors. The gap
held two messages. Other profile timing and packet counts varied between runs.

During the drive, health remained 100, remote entity count and push vector were
zero, and support changed from ground to island oval. These checks do not prove
the route was free of static contacts. Bunched delivery reported 4 baseline and
15 candidate rejected inputs during the drive; other profiles reported none.
The steady-delay final positions differed by about 11.9 m laterally; the other
paired endpoints were close. The first W keydown preceded the next instrumented
scene frame by 98.7–133.5 ms, with the enclosing recorded scene-frame gap
114.1–151.3 ms in both revisions. Why those frames were absent is unknown;
subsequent control changes were generally sampled within 0–14 ms. This is not
an input-to-photon measurement or proof of a feature-specific regression.

For contact-unverified samples above 10 m/s, the analysis calculated a
**displayed-speed/predicted-body-speed proxy**, not the required same-instant
authoritative reference ratio. Its central 90% was:

| Profile | Base p5–p95 | Candidate p5–p95 |
| --- | --- | --- |
| Zero added delay | 0.945–0.971 | 0.908–0.973 |
| 150 ms nominal added RTT | 0.787–1.065 | 0.928–1.096 |
| Bunched 150 ms nominal added RTT | 0.930–1.002 | 0.919–0.992 |
| 250 ms delivery gap | 0.950–0.993 | 0.813–0.988 |

Scene callback p95 was 17.0–17.6 ms across these isolated captures; callback
interval is not GPU completion, and this is not a representative city, traffic,
flight or mobile rendering test. The observations leave input-response,
contact-free speed, touch, flight and recovery gates unverified. No physical
mobile device was tested.

For each `motion-{base,candidate}-{profile}-*.json.gz`, `trace` contains
allowlisted browser scene/input/authoritative observations, `network-trace`
contains relay timing without message payloads, `metadata` records environment,
clock brackets and starting state, and `analysis` contains derived observations.
`motion-harness/` preserves the exact instrumentation, relay and analysis source;
its README was written before these eight complete runs. `run-motion-pairs.sh`
records the later seven-run sequence (base zero ran immediately before it).
The listed absolute `/private/tmp` paths need adapting when reproducing. The
checksums in `SHA256SUMS` cover the retained artifacts. These fixtures and traces
contain disposable local identities only; no credentials or production data.
