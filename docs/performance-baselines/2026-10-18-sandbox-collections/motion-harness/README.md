# Disposable Tesland motion observation

Local-only prototype. Nothing here is part of a feature worktree or deployed.
Do not use credentials, real chat, a public origin, or production data.
The runner requires a clean target revision and creates a fresh output directory.
It builds an instrumented Vite app into that directory and starts only a local
Wrangler fixture on 127.0.0.1. The matching app/worker revision is used on each
side. The fixture removes ambient entities, verifies a stationary Roadster at
(-300, -2050), yaw pi, ground support and no other vehicles; this makes a
repeatable starting scenario, not a representative traffic/render load.
It does not prove the route avoids static obstacles.

First validate both source revisions. Replace the placeholder paths with clean,
separate worktrees at the intended baseline and candidate commits:

```sh
node /private/tmp/tesland-motion-gate/run.mjs --check /PATH/BASE
node /private/tmp/tesland-motion-gate/run.mjs --check /PATH/CANDIDATE
```

When the shared machine is quiet, run the following sequentially, with distinct
new directories. Each invocation builds first, so account for build heat and
host load; the resulting report records load before/after. Do not run these
in parallel. On Apple Metal use `--gpu metal`; select `default`, `vulkan`, or
`swiftshader` only where appropriate and inspect the recorded actual renderer.

```sh
for profile in zero steady150 bunched150 gap250; do
  node /private/tmp/tesland-motion-gate/run.mjs --run /PATH/BASE \
    --out "/private/tmp/motion-base-$profile" --profile "$profile" --gpu metal || break
done
for profile in zero steady150 bunched150 gap250; do
  node /private/tmp/tesland-motion-gate/run.mjs --run /PATH/CANDIDATE \
    --out "/private/tmp/motion-candidate-$profile" --profile "$profile" --gpu metal || break
done
```

A run uses Playwright 1.64.1's `page.routeWebSocket` for the exact local room
socket, before navigation, with `connectToServer()` and explicit message
handlers on both sides. FIFO queues relay original text/binary messages without
modification. The profiles describe scheduled *additional application-message*
delay; actual scheduling and transit may differ:

- `zero`: zero requested delay in both directions; the relay itself has overhead.
- `steady150`: request 75 ms in each direction, 150 ms nominal added RTT.
- `bunched150`: request 75 ms in each direction plus the repeating per-direction
  jitter sequence [0, 0, 125, -16.667, -16.667] ms. FIFO is enforced, so a
  delayed message can bunch following messages. Sequence indices reset at the
  start of driving; already queued traffic keeps its previous schedule.
- `gap250`: zero base delay; after three seconds of W, arm one hold. On the
  next forwarded authoritative state begin a 250 ms downlink delivery embargo.
  All subsequent downlink messages are held and then forwarded in order. The
  run fails closed if the gap did not start, did not hold a message, or a
  downlink forward occurred before the intended end.

Each drive holds W for four seconds, W+D for one, W+A for one, W for two,
then releases W and brakes for one and releases brake for one. Actual event
and control times are recorded; timer waits are not assumed exact. Each run
requires trusted press/releases for W/A/D/Space, observed throttle/left/right/
brake, movement, a live room and fresh snapshots at the end. A missing event,
queue overflow, rejected trace, truncated recording, failed relay, missing
turnaround sample or invalid start causes an incomplete observation.

Output:

- `trace.json`: bounded browser `performance.now()` samples for scene-submitted
  vehicle mesh and camera transforms, predicted body, input event/control
  changes, sent input seq/target tick, received authoritative positions/tick/
  acknowledgement/revision, and the game's observed input turnaround.
- `network-trace.json`: bounded Node `performance.now()` records for each
  enqueue and forward invocation; includes one-way target, requested base,
  jitter, FIFO adjustment, actual queue dwell, seq/tick where applicable,
  gap arming/start/end, and dropped/queue counters. No raw messages or private
  fields are saved. The original payload exists only in the transient bounded
  queues so it can be relayed.
- `metadata.json`: target SHA, protocol health, harness hashes, environment,
  renderer, initial state, profile, gap outcome, frame and snapshot timings,
  and before/after browser-to-Node clock-calibration brackets. The midpoint
  offset is an estimate with at least the recorded half-roundtrip uncertainty.
  Game observed turnaround includes server processing and snapshot cadence;
  it is not a pure network RTT.

A proxy forward time is the invocation of Playwright's `send`, not confirmed
server/browser delivery. Pair proxy seq/tick records with browser-side sent and
received timestamps using clock brackets; inspect full traces for late release,
input rejection, gaps, contacts, support changes and route divergence. The
frame timestamps measure render callback and scene transforms submitted for
drawing, not GPU completion, scanout or human input-to-photon latency. The
10 Hz authoritative pose is not an exact same-instant reference speed at
every frame. This fixture does not represent traffic, real WAN/TCP loss, chat,
physical mobile touch, flight, wall/contact/recovery cases, or a full playable
capacity gate. Bunched message counts may differ between revisions. Run a
separate uninstrumented rendering/throughput comparison; this prototype alone
cannot establish the full release gate.

Lightweight development checks:

```sh
node /private/tmp/tesland-motion-gate/test-network.mjs
node --check /private/tmp/tesland-motion-gate/run.mjs
```

The scheduler has virtual-clock coverage for FIFO, all four profiles, bounds
and privacy projection. A complete Vite/Wrangler/Playwright browser run has
not yet been tested.

## Offline analysis

Run without starting a browser, server, or benchmark:

```sh
node /private/tmp/tesland-motion-gate/analyze.mjs /private/tmp/motion-base-zero \
  --out /private/tmp/motion-base-zero-analysis.json
node /private/tmp/tesland-motion-gate/analyze.mjs /private/tmp/motion-candidate-zero \
  --out /private/tmp/motion-candidate-zero-analysis.json
node /private/tmp/tesland-motion-gate/test-analyze.mjs
```

Repeat for each profile and use distinct output filenames. Omit `--out` for
stdout. The analyzer does not overwrite files and emits only allowlisted data;
raw messages, identifiers, recovery codes, chat text, arbitrary fields and
untrusted rejection reasons are excluded. Missing or incomplete capture data
is reported as unavailable rather than treated as a zero measurement.

The report shows actual browser event/control/send timestamps, press/release
and matching control observations, scene-submitted frame intervals, vehicle
and camera yaw steps/rates, browser state-arrival gaps, routed enqueue/forward
and requested-versus-actual delays, and motion observations during the largest
browser arrival gaps. Browser and Node clocks are different; the analysis
interpolates midpoint clock offsets only to select an approximate routed-message
window and reports uncertainty. A forward invocation is not browser delivery.
Time association does not prove causality.

The diagnostic speed ratio is horizontal submitted mesh displacement divided
by elapsed time and mean horizontal predicted-body speed. It uses adjacent
predicted, unsnapped, non-menu ground frames above 10 m/s with frame interval
no more than 250 ms; full-throttle straight input with no brake/boost/hover
unchanged for at least 500 ms; valid prior 500 ms frames with no gap over
100 ms, unchanged health, and speed span no greater than the larger of 1 m/s
and 5% of mean; and bracketing snapshots no more than 500 ms apart, no other
entities, ground support, unchanged health and pose revision, and push
magnitude below 0.01. It reports sample counts and every exclusion category;
the separate full frame distribution retains long frame gaps. A zero ratio
is included if the mesh does not move. This filter selects observations with
no *recorded* contact indicators, not proven contact-free intervals: static
scenery contacts can occur between snapshots without a persistent push or
health change. The predicted body is not a same-instant authoritative reference.
The ratio is always explicitly diagnostic and never constitutes the full gate.
For a literal contact-free gate, add validated collision telemetry and an
independent same-instant reference, and separately test actual contacts.

Deterministic synthetic tests exercise sample filters, exact ratios, yaw wrap,
input matching, gaps, incomplete and missing data, clock handling and privacy.
They do not validate the game hooks, local server, real network, GPU or a
physical device. The complete browser/worker observation has not yet been run.
