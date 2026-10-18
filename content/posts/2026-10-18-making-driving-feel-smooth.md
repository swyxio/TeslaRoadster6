I wanted driving in [Tesland](/) to feel smooth. Instead, the car would surge and hesitate as I steered around the Bay. That is a problem for any driving game, but especially one where the fun is taking a turn at speed, jumping over traffic and flying away.

Over a few hours we worked on the Three.js scene, the shared room and the way the browser presents motion. The surprising part was that a faster frame alone could not fix the drive. The browser also needed a believable position to draw in that frame, even when the next update from the server had not arrived yet.

The result is a better local prediction and correction system, less work for distant vehicles, and a smaller provisional room limit. It is an improvement with known limits, not a claim that every connection or crowded room is now smooth.

## The frame rate was only one clock

Tesland is a browser game on Cloudflare Workers. Each multiplayer room runs a shared simulation in a Durable Object. The browser sends steering and throttle over a WebSocket; the room simulates the cars and sends back snapshots of the world. A *snapshot* is a picture of the game state at a particular simulation step: positions, velocities and other information the browser needs.

The room normally advances physics 20 times a second, one **tick** every 50 milliseconds, and sends snapshots about 10 times a second. The browser can draw many more frames than that. If it simply waits for the next snapshot and moves the car when one arrives, it can draw the same position repeatedly and then show a jump. A high frame rate would faithfully redraw the pause.

One early diagnostic reported that turning drawing off reduced the median frame interval from 40.5 ms to 8.3 ms, while the car's tracked position still advanced unevenly. That short observation was not independently repeated in the audit, but it was a useful clue: there were [rendering and motion problems to investigate separately](https://github.com/swyxio/TeslaRoadster6/blob/80dc6aa/docs/PERFORMANCE_RELEASE_GATES.md#driving-continuity-comes-first).

The old client already tried to predict the driver's car, but its model did not match the room's clock closely enough. It replayed a full 50 ms of motion for each pending input submission, while the room could use only the latest controls for a tick. For example, three pending submissions could make the client replay 150 ms of motion when the room advanced only 50 ms. It also switched prediction off in common situations, including near traffic and during flight. Correcting the camera helped some transitions; it could not make those two timelines agree.

## Predict the drive, then reconcile it

Suppose you press right while driving at 100 km/h. You should see the car begin turning without waiting for a round trip to the server. But the room still needs to decide what happened if you hit another car or finish a delivery.

The revised client sends an input with a sequence number and a target room tick. It also runs the shared simulation code locally to predict the controlled car's motion, with approximations for things it cannot know, such as another driver's next input. A snapshot carries the server's tick, acknowledged inputs and queued controls. The client starts from that confirmed state and replays the remaining relevant inputs against their ticks, rather than adding a full physics step for each submission. It then adjusts the displayed car toward the resulting prediction. This correction is called *reconciliation*.

The client also maintains a presentation clock between those ticks. For example, halfway through a 50 ms step, it can draw a position halfway between the two predicted poses; the next animation frame draws a later position. The clock moves gradually toward the observed room clock instead of jumping forward every time a batch of snapshots arrives.

<picture>
  <source media="(max-width: 600px)" srcset="/blog/smooth-driving/motion-flow-mobile.svg">
  <img src="/blog/smooth-driving/motion-flow.svg" alt="Steering immediately drives a local prediction. The same input goes to the authoritative room; its snapshots reconcile the local prediction and supply a buffer for displaying other cars.">
</picture>

*Your own car can react before the room replies. The room still determines the shared outcome, and its snapshots correct the local prediction and feed the display of other cars.*

The room remains authoritative for collisions, rewards and money. Prediction is a presentation of what is likely to happen, not permission for the browser to award itself a delivery. The code also bounds how much history it keeps and how far it will predict ahead. On a stale connection or an unsafe correction it can hold or cut to a confirmed position instead of inventing a long journey through a wall.

This is a familiar game-networking pattern, not a new invention. Glenn Fiedler's [explanation of client-side prediction](https://gafferongames.com/post/networked_physics_2004/) describes the same basic exchange: predict locally, accept the server's correction and replay what has happened since. Tesland uses WebSockets and its own tick scheduler; his article describes a different transport and simulation, so its measurements and network assumptions are not ours.

## The other cars have their own timing problem

We know what the local driver just pressed. We do not know what another human will press next. For other cars, the browser keeps a short history of snapshots and normally draws a position between two known samples. This *interpolation* adds some visual delay, but makes movement less dependent on the exact arrival time of each message. Fiedler's [snapshot-interpolation walkthrough](https://www.gafferongames.com/post/snapshot_interpolation/) shows the same tradeoff.

Nearby cars complicate this. If my predicted car is moving ahead while a car beside me is drawn from an older snapshot, they can appear to overlap or pass through one another even when the room does something else. Tesland now estimates a nearby driver's short-term motion from recent observations and tries to show that car on the local predicted timeline. For example, it checks the path against shared buildings and terrain before displaying the forecast; if the path is unsafe it falls back to buffered playback. It does not know the other driver's future input. More distant cars use buffered playback and bounded extrapolation.

The guardrails matter. We had to keep a car on the shared ground height when smoothing over a hill, and keep ferry passengers aligned with the moving deck. A review also caught a recovery case where the local car returned to the latest room state while a nearby car was still drawn from an older one. The fix puts both on the confirmed frame in that case. These checks reduce bad guesses; they do not make the visual simulation identical to the authoritative one during every collision.

## What the replay showed

We kept the same scripted steering inputs and starting conditions for a synthetic slalom, with 150 ms of simulated round-trip delay. The test sampled modeled display positions 120 times a second using a simulation and scene-transform emulation; it did not exercise a browser, GPU, live network or remote-player contacts. It compared the earlier client with the tick-based candidate; the versions also had different background traffic, so this is not an isolated rendering or bandwidth experiment.

<video controls preload="none" width="1280" poster="/blog/smooth-driving/slalom-poster.png" style="max-width:100%;height:auto" aria-label="Side-by-side replay of the earlier and revised Tesland slalom on a shared clock">
  <source src="/blog/smooth-driving/slalom-comparison.mp4" type="video/mp4">
  <a href="/blog/smooth-driving/slalom-comparison.mp4">Download the before-and-after replay</a>.
</video>

*Both sides replay the recorded simulation traces in warmed game scenes on one clock. Decorative trees are hidden to make the cars easier to compare. This is not a live-network capture or an FPS measurement.*

In that fixture, the largest modeled display step between samples fell from about **6.98 m to 0.48 m**. Across the middle 90% of samples above 10 m/s, displayed speed relative to the predicted body's speed went from **0–6.96× to 0.98–1.05×**: the earlier display could stop or move nearly seven times as fast as the underlying prediction. The first measured response to left steering moved from 75 ms to 8.3 ms, using the fixture's threshold against a no-steer comparison. At 120 Hz, 8.3 ms is one sample interval; it is not a measured human reaction time or real-world input latency. The [raw traces, method and source revisions](https://github.com/swyxio/TeslaRoadster6/blob/6e6067c/docs/benchmarks/2026-10-18-v32-motion/README.md) are available if you want to inspect the details.

The result is encouraging because the fixture measures modeled display motion, rather than frame rate alone. It does not establish smoothness in live production. In a separate synthetic test, an 800 ms interruption in incoming updates still produced a roughly 15.7 m recovery step. Unknown inputs from another driver and genuine relocations can also require a visible correction.

## Spend less on what is far away

The timing fix was only part of the work. The scene still had to draw the Bay and its cars.

We grouped repeated bridge and landmark geometry into regional batches. In a fixed six-view scene fixture, the Golden Gate view went from 110 draw calls to 58, and the Bay Bridge from 199 to 96. A draw call is a request to the graphics API to render a batch of objects. Fewer calls can reduce submission work, but the timings in this particular fixture were noisy: we did **not** establish a full-game FPS improvement from those counts. The [rendering notes](https://github.com/swyxio/TeslaRoadster6/blob/74c2255/docs/BAY_RENDERING.md) include the measurements and the unfavorable timing results.

We also reduced the default background fleet from 67 vehicles to 22. A distant non-player, non-police car switches to a simplified model beyond 125 m and restores its detailed model inside 100 m; the gap avoids flickering back and forth at one distance. The detailed tree is detached while inactive, so Three.js does not keep traversing all of its children for world transforms. The player's car and police keep their detail. We capped the WebGL drawing buffer at one pixel per CSS pixel, while keeping the HUD at native resolution.

That is distance-based detail, not a promise that only nearby things exist. Room snapshots already filter distant ambient entities, but retain players and occupied cars. The room still simulates the shared world and decides collisions. We chose to spend detail and background traffic where they were most likely to matter for the drive; the individual cuts have not each been proven to produce a particular FPS gain.

## A room limit needs more than a socket count

The server has a separate performance budget: it must advance the shared simulation quickly enough for everyone in the room. In one local 60-second test with 64 synthetic clients, the room advanced only 44.2 seconds of simulation. The load generator and server shared a busy machine, so that result cannot be used as a production capacity number. It did tell us that a socket limit was not enough evidence to promise a playable 64-driver room. We reduced the default room cap to eight while gathering better measurements.

After [the 0.0.15 release](https://github.com/swyxio/TeslaRoadster6/pull/65), a short production test using two real game input clocks advanced 19.9 seconds of simulation in a 20-second sample. Both stayed connected, but five of 801 measured inputs were rejected as late. Those clients used synthetic controls and did not render or replay prediction, so the test cannot tell us how smooth the game looked. A separate desktop Chrome playtest drove and flew the deployed build without captured console errors. The [production report](https://github.com/swyxio/TeslaRoadster6/blob/6e6067c/docs/benchmarks/2026-10-18-v32-motion/production/README.md) keeps those observations separate.

For another browser game, the reusable exercise is to measure three things independently: **how often you draw, how the displayed object moves, and how quickly the server advances**. Record input times, snapshots and displayed positions under repeatable latency and jitter; then test the awkward transitions—contacts, flight, ferries, resets and reconnection. A faster scene is valuable, but a driving game earns its feel in the space between the input, the next frame and the server's eventual answer.
