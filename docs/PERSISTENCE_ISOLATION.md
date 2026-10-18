# Responsive saved-driver economy

The saved-driver prototype is held at `a1eeee3` on `codex/persistent-property`. In a six-driver local Wrangler sample, one 1,200 ms profile delay held another driver's input acknowledgement for 1,228 ms and paused room time for most of a 1,316 ms snapshot gap. One lost reply disconnected all six drivers. Reproduce on that branch with `pnpm exec tsx scripts/persistent-load-sample.ts`; this short synthetic sample does not measure deployed capacity.

The underlying problem is the room queue: it waits for profile RPCs during input, ticks, authentication and purchases. A slow or failed profile therefore affects every driver. The Mars alarm follow-up at `60d964f` recovers an abandoned debit and lets the room continue during a delayed retry, but the initial donation still waits on that queue.

## Transaction boundary

1. Keep the room's physics, input acknowledgements and ordinary snapshots moving independently of profile RPCs. Give each driver an ordered queue with at most one economy transaction in flight.
2. Simulation emits server-validated economy events. The public world retains the last committed wallet, delivery and achievement state, property, and paid vehicle capabilities until each event commits. Timer checkpoints may be coalesced; debits, credits and one-time awards need durable outcomes.
3. Persist an intent in a room-economy authority before sending an idempotent event to the driver's authority. The driver transaction checks its fence and expected revision, records the event ID and payload, and atomically applies the result and any eligible-income outbox update. Repeating the same event returns its prior receipt; a conflicting payload fails. Keeping reservation storage outside the physics room avoids putting its output gate on room snapshots; measure the actual effect in the fixture.
4. A completion re-enters the room, publishes the committed result and responds to the owner. Failed or superseded drivers are isolated from the other sessions. A lost or timed-out reply remains uncertain until its receipt is checked; the request must not be retried as a new event.
5. A `sync` barrier for an action waits for that driver's preceding transaction sequence to settle. Ordinary input acknowledgements continue. This keeps client prediction from treating a pending purchase as complete.

This boundary needs every economic mutation, including delivery transitions, research awards, tickets, OTA renewals, Dome awards, supply pickups, vehicle purchases and property actions. Merely hiding wallet snapshots leaves speculative vehicle upgrades or other shared effects in the physics simulation.

## Shared objects and recovery

Reserve a pickup generation before sending its reward: record the pickup ID, generation, driver and event ID, and prevent another claim until the receipt resolves. Every claim, including one after a room restart, goes through the same authority's generation-aware compare-and-set. This prevents an in-flight old request from racing a new claimant. On restart, restore reservations and retry reconciliation; a failed or fenced transaction releases its reservation only after the result is known.

A floor purchase similarly reserves its construction footprint after checking clearance, records the expected story and event ID, and withholds both the charge result and the new floor until commit. Publish a confirmed floor even if its owner disconnected; visitors must not enter a pending footprint. A restarted instance reloads and reconciles its reservations before allowing construction or entry.

Acquiring a saved identity in another room fences the prior owner. Receipt lookup precedes rejection of an old fenced transaction: a transaction committed before the switch still needs to be finalized, while a transaction rejected by the fence cannot be applied later. Persisted room intents and reservations remain until reconciliation finishes.

Each Durable Object has one alarm. Any Mars contributions and pending intents assigned to the same authority must share an earliest-deadline retry scheduler; completing one operation must not cancel another's alarm. The global income outbox also needs to share its profile object's alarm with any other profile retries. Guest income needs a durable server-issued identity before its first credit and an attachment rule that counts pre-attachment earnings once.

## Acceptance checks

Run the existing local fixture when the performance team has a quiet window:

- `pnpm exec tsx scripts/persistent-load-sample.ts` measures six saved drivers, snapshots, input acknowledgement and room-time progression with normal, delayed and lost profile replies.
- `pnpm exec tsx tests/persistent-room.integration.ts` checks identity fencing, reconnects, property and uncertain writes.
- `pnpm exec tsx tests/mars-alarm.integration.ts` checks a delayed retry while another driver continues.
- `pnpm exec tsx tests/isolated-economy.integration.ts` exercises the fixture-only redesign at `beba738` on `codex/persistent-property`: ordered delivery credits, independent driver activity, sync barriers, retries and fencing. It has not yet run; its shared clock is not the production physics step.

Extend the fixture to cover delayed authentication, a slow first donation, same-pickup contention, floor reservations with visitors, room switches during pending writes, and restart before and after commit. Compare acknowledgement latency, snapshot gaps and world-time advance with a no-delay baseline; unrelated sockets must remain active during a profile failure. Then run the repository's test/build checks and the normal two-client room integration. Record actual sample conditions and avoid extrapolating to the 64-player room limit.
