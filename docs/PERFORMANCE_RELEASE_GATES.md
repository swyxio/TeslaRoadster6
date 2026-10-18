# Performance release gates

2026-10-18 Pacific. After the verified 0.0.15 / protocol v32 production release,
the user lifted the global feature hold and resumed the paused development
chats. Performance now receives periodic checks and focused review when a
change affects driving, rendering, networking or persistence. Existing gaps
are tracked below; they do not freeze unrelated feature releases. See
[the audit](PERFORMANCE_AUDIT.md) and [verification](VERIFICATION.md) for evidence.

## Driving continuity comes first

The reported production diagnostic separated two problems: drawing disabled
improved median frame intervals from 40.5 ms to 8.3 ms, but rendered speed still
varied from 0.28× to 1.79× simulated speed (5th–95th percentiles). These are short,
busy-host observations, not controlled capacity measurements. Higher FPS alone
does not fix packet-shaped motion.

The previous v31 path replayed a 50 ms step per pending submission and often
disabled prediction near traffic or in flight. Its input acknowledgements did
not identify which room ticks held or replaced controls. A camera-only correction
did not fix that mismatch.

The v32 release schedules bounded inputs against authoritative ticks, replays
the local car with nearby simulation, and separates the predicted simulation
from display correction. Other vehicles use snapshot interpolation, with nearby
vehicles presented on the predicted timeline when the path is safe. Collisions,
rewards and money remain server-authoritative. Room incarnation, connection and
controlled-pose relocation have distinct identifiers or revisions; reconnecting
one player must not invalidate everyone else's history. See the wire definition
in [contracts](CONTRACTS.md). This implementation does not by itself establish
that the acceptance targets below are met.

Keep the existing 20 Hz world step until measurements justify a change. Its
adaptive substep count currently depends on the fastest entity in the world;
simulating one car alone does not reproduce that policy. Unknown remote contacts
also prevent exact replay. Make those approximations explicit and test them.

## Acceptance targets, not achieved claims

Run identical scripted controls and starting states before and after a change.
Record commit, protocol, viewport/DPR, hardware, active clients, simulation
progress, input timestamps, authoritative and displayed poses, camera pose,
snapshot gaps, and frame intervals. Preserve raw traces. Separate startup,
acceleration, steady travel, contacts and intentional relocation in analysis.

| Gate | Required evidence |
| --- | --- |
| Input response | Controls visibly affect local motion within one 50 ms simulation step plus one rendered frame, without waiting for a round trip. Test press **and release**, steering reversals, touch, jump and flight controls. |
| Continuous motion | In contact-free steady travel above 10 m/s, target rendered/reference speed ratio 0.9–1.1 for the central 90% of samples, with no recurring pauses or yaw surges aligned to packets. Measure rather than infer from FPS; retain the full trace so percentiles cannot hide periodic defects. |
| Latency and jitter | Repeat sustained W, W+D, braking and steering reversal at zero added latency, 150 ms added RTT, and documented jitter/bunched delivery. Include a 250 ms delivery gap. Label injected delay separately from actual RTT. |
| Recovery and contacts | Flight/takeoff/landing, walls, traffic, player collisions, ramps, ferry transitions, blocked edges, pose reset, takeover, reconnect, tab suspension and focus loss. No repeated jump, stale throttle, movement through solid walls, or repeated camera reset on ordinary support changes. A genuine relocation must remain explicit. |
| Room throughput | After warm-up, a 60-second sustained sample should advance at least 57 seconds of simulation with bounded queues/history. Target p95 tick work below 40 ms at the existing 50 ms tick; report outbound bytes, acknowledgement delays and snapshot gaps. Repeat at the intended capacity with an isolated load generator before claiming that capacity. |
| Rendering | Target 60 FPS on the recorded desktop configuration (p95 frame interval at most 20 ms) in representative city, traffic and flight scenes. Verify mobile separately; desktop or emulation results are not physical-device evidence. Report CPU submission and GPU/frame timing separately. |
| Startup and tooling | Record initial/repeat transferred JS, build/typecheck/test wall times, and asset-cache behavior on the same revision and environment. No bundle-budget changes merely to silence a warning. |
| Persistence isolation | A deliberately delayed or failed personal-state write must not pause unrelated input processing or the world tick. Paid changes publish only after durable commit; retries cannot duplicate rewards or debits. A persistence feature must demonstrate this for its own release. |

These are initial engineering acceptance targets, not measured service promises.
If a target needs revision, record the evidence and tradeoff; do not silently
lower it to pass a failing candidate. A socket connection count is not a playable
capacity result, and a microbenchmark win is not an end-to-end win.

## Feature integration and periodic checks

Client prediction and server tick semantics land together with one protocol bump,
contract changes, deterministic network-trace tests and live Wrangler integration.
Use one integration branch with exclusive file ownership. Preserve persisted room
Mars funds. Review and remove obsolete prediction paths after the new path works
end to end; do not retain competing prediction engines.

Feature branches must incorporate main at `6e6067c` or later before integration.
Keep the v32 tick/action/relocation contract, reduced traffic, vehicle LOD and
provisional eight-player cap unless measurements justify changing them.

Use ordinary focused tests/build and the relevant room or UI checks for each
feature. Run matching motion, scene or persistence checks when those paths
change; do not rerun every historical benchmark for unrelated content changes.
Review performance daily while development continues. If the deployed runtime
has not changed and there is no new symptom, skip repeat benchmarking. Compare
changed builds with the recorded baseline using the same scenario and device;
serialize heavy load/browser measurements to avoid host contention. A confirmed
regression blocks the responsible change, not all independent development.

The wallet/showroom chat owns the shared persistent wallet, identity and income
contract. Progression, Cybercab/market, global Starship and saved-driver awards
must reuse that contract and coordinate shared-file and protocol merges with
its owner. Resume complete layers in dependency order; avoid competing ledgers
or speculative rewrites. The Bay landmarks article can proceed independently.

Long-outage display cuts, late inputs in short WAN samples, sustained playable
capacity, physical-device validation and the crowded landscape HUD remain
follow-ups. Preserve their evidence and distinguish new regressions from these
known limitations. See the production entry in [VERIFICATION.md](VERIFICATION.md).
