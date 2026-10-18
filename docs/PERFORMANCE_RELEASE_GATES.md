# Performance release gates

2026-10-18 Pacific. Performance takes priority over feature development. Economy,
fleet, map and other feature releases remain held while this work is active.
Small, independently verified performance fixes may ship; they do not by
themselves satisfy the gates below. See [the audit](PERFORMANCE_AUDIT.md) for
measurements and [verification](VERIFICATION.md) for build-specific evidence.

## Driving continuity comes first

The reported production diagnostic separated two problems: drawing disabled
improved median frame intervals from 40.5 ms to 8.3 ms, but rendered speed still
varied from 0.28× to 1.79× simulated speed (5th–95th percentiles). These are short,
busy-host observations, not controlled capacity measurements. Higher FPS alone
does not fix packet-shaped motion.

The current v31 path replays one 50 ms step per pending input submission and
frequently disables prediction during flight or near traffic. Input sequence
acknowledgement does not identify which server ticks held or replaced controls.
Do not tune blend constants to conceal that mismatch or declare the camera-only
correction a complete driving fix.

The replacement must advance local motion independently of packet submission,
reconcile against an explicit authoritative tick and bounded input history, and
separate simulation correction from visual correction. Remote actors use their
own snapshot interpolation. Server authority over collisions, rewards and money
remains intact. A room incarnation, a player's connection and a controlled pose
relocation are different lifetimes; reconnecting one player must not invalidate
everyone's history. The wire definition belongs in [contracts](CONTRACTS.md).

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
| Persistence isolation | A deliberately delayed or failed personal-state write must not pause unrelated input processing or the world tick. Paid changes publish only after durable commit; retries cannot duplicate rewards or debits. The currently held persistence prototype has not met this gate. |

These are initial engineering acceptance targets, not measured service promises.
If a target needs revision, record the evidence and tradeoff; do not silently
lower it to pass a failing candidate. A socket connection count is not a playable
capacity result, and a microbenchmark win is not an end-to-end win.

## Integration and reopening feature work

Client prediction and server tick semantics land together with one protocol bump,
contract changes, deterministic network-trace tests and live Wrangler integration.
Use one integration branch with exclusive file ownership. Preserve persisted room
Mars funds. Review and remove obsolete prediction paths after the new path works
end to end; do not retain competing prediction engines.

Before reopening features, record the motion, render and room results on the
integrated commit, verify the deployed asset revision, and play the actual game.
List any unverified devices/capacities and remaining defects plainly. Feature
branches must incorporate the performance baseline before integration.
