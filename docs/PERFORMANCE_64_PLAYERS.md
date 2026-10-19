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
