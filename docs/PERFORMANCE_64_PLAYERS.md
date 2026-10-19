# 64-player investigation · 2026-10-18 Pacific

The 64-seat setting is a room limit, not a demonstrated smooth-play capacity.
The prior distributed normal-room test held 64 sessions online and advanced at
approximately real time, but rejected inputs and did not establish sustained
movement for most drivers. See [verification](VERIFICATION.md) and the
[performance release gates](PERFORMANCE_RELEASE_GATES.md).

## State and transport

One synthetic v47 world with 64 drivers after 30 simulation steps produced a
130,132-byte decoded snapshot for one recipient: 55,490 bytes of players,
69,474 bytes of entities and 4,247 bytes of pickups. These are application
bytes, not WebSocket wire bytes or a representative traffic distribution.

A separate raw TLS/WebSocket probe connected to a disposable room on the
immutable `6238845` PR #109 preview. It requested `permessage-deflate` and the
server negotiated `permessage-deflate; client_max_window_bits=15`, with the
RSV1 compression bit set on the sampled text frames. A connection without the
extension negotiated none. This was a short one- or two-connection idle sample,
not a measurement of 64-player wire traffic, another Cloudflare route, or every
browser. In particular, the large decoded totals in load-generator reports
must not be described as transferred bytes.

The candidate reuses an entity-array serialization for recipients with the
same visibility set, for one broadcast only. Owners' cars, ferry passengers,
all player-controlled vehicles, player collection privacy, controls and
ordering retain their existing projections. It changes neither payload nor
protocol and does not itself address late input or presentation jitter.
The companion `pnpm exec tsx scripts/bench-snapshot-assembly.ts` measures
assembly and UTF-8 sizing for clustered and synthetically spread drivers;
it does not run physics, send WebSockets or measure Cloudflare.

In a small local six-pair experiment, alternating the current and candidate
serializer for 100 broadcasts of 64 recipients, median process CPU was
147.22 → 97.45 ms for a clustered fixture, 139.71 → 109.74 ms for a synthetic
spread fixture and 151.62 → 152.37 ms for a stress fixture with 64 distinct
distant owner cars. Every recipient's strings and byte totals matched. The
18-logical-CPU host was contended (one-minute load around 21); wall-time and
production gains are unproven. This is a candidate, not a 64-player pass.

A separate [hosted comparison and room diagnostic](https://github.com/swyxio/TeslaRoadster6/actions/runs/39185379789)
used candidate `e8560ab` and base `8be55d4`. Three alternating, same-runner
samples of 50 broadcasts had median process CPU 169.34 → 140.00 ms clustered,
118.85 → 104.80 ms spread and 143.75 → 136.96 ms with 64 distant owned cars.
This remains an in-process synthetic comparison; it does not establish a room
or network speedup.

Four separate hosted runners staged 64 sessions in a sandbox room on the exact
candidate preview. All observed 64 drivers; the 65th connection was rejected
as full. During approximately 60 overlapping wall seconds, all 64 drivers
completed the sampled moving blocks and each runner observed at least 59.8
simulation seconds. The combined measured window recorded 374 late rejections
among 84,367 sent inputs, with a one-second response drain; additional delayed
responses may be missing. Runner snapshot-gap p95 ranged from 109.16 to
113.70 ms. Sandbox upgrades, straight corridors and headless sessions do not
test normal economy, contacts, rendered motion, wire bytes or server tick work.

The workflow failed: three groups recorded late inputs, and main advanced from
`8be55d4` to `c5bd893` before the post-run identity check. That main change
only altered performance-workflow and documentation files, but the run does not
pass the exact-base release gate. The original movement tracker also failed to
count gaps spanning two ten-second blocks; its regression test now covers that
case. The recorded maximum snapshot gaps were under one second per runner, but
this sample is not a full continuity or playable-capacity pass.

The corrected gap check was used for two further historical research samples
against the same `c5bd893` game base. The [candidate run](https://github.com/swyxio/TeslaRoadster6/actions/runs/39186107476)
observed all 64 drivers moving for the measured minute, at least 59.9 simulated
seconds per runner, and 798 late replies among 87,444 measured inputs. The
[unchanged-runtime baseline run](https://github.com/swyxio/TeslaRoadster6/actions/runs/39186168542)
recorded 396 late replies among 74,543 measured inputs before one client closed
with code 1006 after about 51 seconds. Its runner then disconnected the other
15 clients, and the remaining runners stopped when their snapshots saw 48
players. These are different hosts and connections, with a shorter incomplete
baseline; their rejection counts cannot establish causation or a relative
speedup. Both were pinned preview research after main had advanced, not
current-main release checks. Temporary baseline PR #117 was closed afterward.

For that candidate's hosted assembly job, the three-pair median process CPU
for 50 broadcasts was 182.26 → 132.63 ms clustered, 133.12 → 114.61 ms
spread, and 145.53 → 155.09 ms for distinct distant owned cars. The last case
was slower in this small sample; these timings are not end-to-end room results.

In the first hosted sample, 148 of 374 measured late inputs already targeted
the maximum eight ticks beyond the latest snapshot. The observations cannot
separate uplink, Worker handling, downlink and generator callback delays.
Raising a minimum lead alone therefore cannot explain all misses, and changing
the shared prediction clock requires its own motion and contact regression
tests. This candidate does not change that clock.

In the corrected historical candidate, 334 of 798 measured late inputs were
already targeted eight ticks past the last received snapshot; in the incomplete
baseline, 123 of 396 were. A candidate driver had 41 consecutive late command
sequences sent over 1.81 seconds; a baseline driver had 21 over 0.91 seconds.
The sampled straight-line motion can continue on held input or momentum, so it
does not establish that steering and braking stayed responsive. These traces do
not contain the authoritative tick at command receipt for accepted and rejected
inputs. A bounded preview trace correlating receipt tick, target tick, last
snapshot, held controls and rendered response is needed to distinguish an
exhausted scheduling margin from other causes; unsynchronized clocks cannot
individually resolve uplink and downlink delays.

The [v48 candidate run](https://github.com/swyxio/TeslaRoadster6/actions/runs/39187526596)
used candidate `4dfd261` based on then-current main `e07f0be`, with identity checks before
and after the sample. All 64 staged drivers stayed connected and completed all
384 sampled movement blocks; each runner saw at least 59.8 simulated seconds
in approximately one minute. It recorded 263 late replies among 83,883 measured
inputs, so the diagnostic failed its input-rejection gate. The 65th connection
was rejected as full. The same-runner three-pair assembly medians were
101.29 → 88.50 ms clustered, 94.87 → 80.83 ms spread, and 101.29 → 100.26 ms
for distinct distant owned cars. These short synthetic measurements do not
establish end-to-end speed or responsiveness.

The [unchanged-runtime v48 baseline](https://github.com/swyxio/TeslaRoadster6/actions/runs/39187590890)
used the same base and diagnostic source on separate hosts. All 64 stayed
connected for approximately a minute and each runner observed at least 59.7
simulated seconds. It recorded 403 late replies among 84,723 measured inputs;
one of 384 movement blocks fell below the sustained-motion thresholds. The 65th
connection was rejected. Both runs failed their diagnostic gates, and separate
hosts and network paths make the rejection counts descriptive, not proof of a
regression or improvement. The temporary baseline PR was closed afterward.

## Local input receipt trace

`pnpm exec tsx tests/input-trace.integration.ts` runs one real `Session` against
the real room in an isolated local Wrangler worker. Its fixture denies persistent
services, binds to loopback, and has no deployment configuration. It records
bounded client and server event rings with explicit drop counts, without raw
messages or player identifiers. It observes snapshot delivery, client sends and
buffered bytes, handler entry, scheduler receipt and rejection, held controls,
post-physics edge results and successful snapshot sends. The test checks that a
second input waits behind an artificially held dispatch; other message types
are outside that simulation. The server and client clocks have independent
origins and are not subtracted to infer one-way latency.
Scheduler rejections still advance `receivedSeq`, and `appliedSeq` can skip a
superseded input; neither is a count of successfully executed commands.

In one controlled v48 run, a normal jump was accepted and processed. Holding
snapshots until tick 6 made a command based on snapshot tick 2 and target tick 5
arrive late. Holding an actual queued flip for 82 ms made its target tick 7
arrive at tick 8; the edge was rescheduled to tick 9 and then processed. A
fixture-only gate held a timely input after callback entry at tick 10 until tick
12, past its target tick 11; a second input queued behind it was received in
sequence. A future target was rejected by the scheduler, and a wrong epoch before
it. Both event rings reported zero drops. The [sanitized trace](benchmarks/2026-10-18-input-trace-v48.json.gz)
records the observations; these injected scenarios validate the fixture, not
the cause of hosted late inputs or any capacity claim. The current production input
handler calls the scheduler synchronously after callback entry; the artificial
dispatch delay does not represent measured production CPU time. Runtime queueing
before callback entry remains unobserved. A separately secured, non-production
preview overlay and a fresh timing reservation would be needed for a matched
64-player investigation. This fixture is not configured for preview and must
not be deployed; its hostname check is not a deployment security boundary.

An additional sequential local pair used the same trace overlay and runner on
the `e07f0be` runtime (baseline checkout `abaf712`) and candidate `837789f`,
whose only runtime difference was the serializer. Each used one real Session
and one room: 12 steady commands, five during a roughly 255 ms ordered incoming
frame hold, ten with a roughly 75 ms outgoing delay, and 27 during recovery.
All 54 commands reached the scheduler in order and were accepted on both
sides; the queued jump and flip were processed. No event-ring or queued-edge
drops were recorded. After the outgoing delay ended, recovery command targets
were initially six to eight ticks ahead of server receipt, versus two to four
in the earlier phases; by the final seven recovery sends they were six to
seven ticks ahead on baseline and four to five on candidate. Those values are
scheduler tick distances, not measured network or visible control latency.
The capture stopped sending afterward, so the watchdog's eventual neutral
controls are expected. The traces do not reproduce the hosted rejection bursts,
prove a difference between versions, or cover a slow room, contacts or rendered
motion. The test runs used an 18-logical-CPU Mac with one-minute load roughly
12–13; source identities, intervals and the sanitized event rings are retained
in the [paired trace](benchmarks/2026-10-18-paired-input-trace-v48.json.gz).

The reproducible `scripts/compare-snapshot-serialization.ts` correctness check
compared complete baseline and candidate wire strings across 84 synthetic
recipient/tick cases, including privacy, owner visibility, shared vehicles,
interest boundaries and changed next-tick state. All matched; the
[result](benchmarks/2026-10-18-snapshot-correctness-v48.json) records the
source hashes and digest. This comparison is not a performance measurement.
The serializer can be reviewed separately from any scheduling fix, but a
current-main matched assembly comparison and room regression checks still
need to pass on the exact release candidate.

## External experience and implications

- [Glenn Fiedler's snapshot compression experiments](https://gafferongames.com/post/snapshot_compression/)
  show why changes should be driven by captured state distributions and why
  lower update rates trade bandwidth for interpolation delay. His
  [interpolation examples](https://gafferongames.com/post/snapshot_interpolation/)
  use UDP; their loss and buffer settings are not proof for ordered WebSockets.
- The [Teardown multiplayer developer](https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html)
  describes prioritizing state to fit a bandwidth budget, alongside visible
  snapping when active physics updates become sparse. A
  [vehicle-game developer discussion](https://forums.unrealengine.com/t/per-connection-replication-frequency/2598155)
  suggests lower update frequency for distant cars. Tesland's whole-Bay map
  and nearby collisions require explicit continuity and re-entry tests before
  adopting such a design.
- [SnapNet's interpolation discussion](https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/)
  explains the tradeoff between smoothing jitter and showing older remote
  objects, including consequences for player-to-player collisions. A
  [game developer forum discussion](https://www.reddit.com/r/gamedev/comments/1jcwfyi/how_does_a_server_handle_late_inputs_from_a_client/)
  proposes input buffering and tick-based scheduling, but that advice does not
  identify this game's cause or justify changing its prediction clock.
- [Cloudflare's WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#batch-messages-to-reduce-overhead)
  discusses batching frequent messages. Delaying steering, braking or button
  edges has a responsiveness cost; do not infer that batching input is safe
  without measuring it against the motion gates.
- [Cloudflare's timer documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/)
  says deployed Worker timers do not advance during CPU-only execution. Use
  appropriate local or Cloudflare CPU profiling rather than subtracting
  deployed callback timestamps and calling the result tick CPU time.
- A [game developer's input-backlog discussion](https://gamedev.net/forums/topic/665916-catching-up-when-a-clients-input-stream-is-interrupted/)
  illustrates how replaying every stale command can perpetuate delay, while
  discarding commands can lose a jump. Tesland's discrete edge outcomes must be
  evaluated separately from held steering and throttle before changing policy.
- A [WebSocket discussion](https://gamedev.net/forums/topic/700489-using-concurrent-tcpwebsockets-to-mitigate-head-of-line-blocking/)
  cautions that burst loss can stall multiple connections together. It does not
  show that packet loss caused Tesland's misses or justify adding sockets.
  The browser's [bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount)
  measures bytes queued locally for transmission, not server receipt or RTT.
- A [Three.js developer's profiling report](https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196)
  found animation and matrix-update CPU costs in a different, animated-character
  scene. Profile Tesland's update, draw submission and device rendering separately;
  that report is not evidence of Tesland's bottleneck.

The isolated [64-driver diagnostic](../scripts/room-64-README.md) is designed
to collect synchronized sustained movement and input observations from four
separate runners on an exact preview. Sandbox staging and headless clients have
important limits: normal economy, contacts, rendered motion, tick work, real
wire bytes and physical touch still require separate evidence.
