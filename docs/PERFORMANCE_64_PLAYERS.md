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

In the first hosted sample, 148 of 374 measured late inputs already targeted
the maximum eight ticks beyond the latest snapshot. The observations cannot
separate uplink, Worker handling, downlink and generator callback delays.
Raising a minimum lead alone therefore cannot explain all misses, and changing
the shared prediction clock requires its own motion and contact regression
tests. This candidate does not change that clock.

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
- [Cloudflare's WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#batch-messages-to-reduce-overhead)
  discusses batching frequent messages. Delaying steering, braking or button
  edges has a responsiveness cost; do not infer that batching input is safe
  without measuring it against the motion gates.

The isolated [64-driver diagnostic](../scripts/room-64-README.md) is designed
to collect synchronized sustained movement and input observations from four
separate runners on an exact preview. Sandbox staging and headless clients have
important limits: normal economy, contacts, rendered motion, tick work, real
wire bytes and physical touch still require separate evidence.
