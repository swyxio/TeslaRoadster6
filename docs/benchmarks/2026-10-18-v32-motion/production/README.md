# Production release checks · 2026-10-18 Pacific

PR #65 merged as `74c2255379a248ff9cf2afd97b35e8f22aeea666`; its runtime source
is `e646b0377cc64f69de48b33b800508c3be8ced46`. Native Workers Build
`daa8e1ff-a18a-410c-8377-dba70de4f09f` succeeded. At approximately 11:42 UTC,
`https://tesland.swyx.io/api/health` advertised protocol 32 and capacity 8,
the changelog served 0.0.15 Alpha, and the HTML referenced `index-DQSL1AOa.js`.
The downloaded production JavaScript matched the local build SHA-256:
`4576af3ac3888d97377b8cf3f45c8f500a4c3d9bf8253f1851f65341ef98dafc`.

The two-client `synthetic-smoke.json` observed the same 89.487 m displacement
on both clients and applied input sequence 65, with no unexpected disconnect.
The simplified `RoomInputClient` sender received 26 and 25 late rejections.
This establishes basic synchronization, not a clean responsiveness pass.

The follow-up `session-diagnostic.json` used two actual `Session`/`MotionClock`
instances with Node browser adapters, frame-cadenced controls and clock calls.
It deliberately excluded prediction replay and rendering. Both clients stayed
online, saw each other and applied input; 801 measured inputs produced five
late rejections, with none in warm-up or drain. The first-to-last measured
snapshots advanced 19.9 simulated seconds in a 20.001-second window. Snapshot
gaps were 229 ms p95 and 297 ms maximum. This one short sample is not evidence
of sustained room capacity or browser smoothness. The five late inputs remain
an input-timing concern; the two tests do not isolate its network cause.

The `.mts` files are the exact one-off harnesses. Their absolute imports record
the release checkout used; change those paths to an equivalent checkout to
repeat the test. Both use disposable production rooms and send no persistence
actions. All sockets were closed afterward. Run them sequentially to avoid
mixing their load with a rendering benchmark.

A separate Chrome check at 1272×845 reached 202 km/h with turning and reversal,
then 251 km/h at 5 m altitude after reset. No warnings/errors were captured.
An opt-in rolling 240-frame sample immediately after the ground maneuver had
p95 animation interval 17 ms and callback CPU 3.9 ms, with 107 draw calls and
178,548 triangles. It includes maneuver/end frames and excludes GPU timing;
it is not sustained FPS or physical-device evidence. Before release, the final
preview also exercised cockpit view and citation acknowledgment; its mixed
240-frame sample was slower (25.2 ms interval p95, 5.3 ms callback CPU p95).
These differently situated samples must not be treated as a controlled speedup.
