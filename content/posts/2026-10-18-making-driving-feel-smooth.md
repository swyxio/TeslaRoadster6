<picture>
  <source media="(max-width: 600px)" srcset="/blog/smooth-driving/slalom-result-mobile.svg">
  <img src="/blog/smooth-driving/slalom-result.svg" alt="In a synthetic slalom, the largest display step fell from 6.98 to 0.48 meters. When predicted speed exceeded 10 meters per second, the middle 90% of the displayed-to-predicted speed ratio tightened from 0–6.96× to 0.98–1.05×. First left-steering response went from 75 to 8.3 milliseconds.">
</picture>

I wanted driving in [Tesland](/) to feel smooth. Instead, the car would surge and hesitate as I steered around the Bay. That is a problem for any driving game, but especially one where the fun is taking a turn at speed, jumping over traffic and flying away.

Over a few hours we worked on the Three.js scene, the shared room and the way the browser presents motion. The surprising part was that a faster frame alone could not fix the drive. The browser also needed a believable position to draw in that frame, even when the next update from the server had not arrived yet.

The result is a better local prediction and correction system, less work for distant vehicles, and a smaller provisional room limit.

## The frame rate was only one clock {#the-frame-rate-was-only-one-clock}

Tesland is a browser game on Cloudflare Workers. Each multiplayer room runs a shared simulation in a Durable Object. The browser sends steering and throttle over a WebSocket; the room simulates the cars and sends back snapshots of the world. A *snapshot* is a picture of the game state at a particular simulation step: positions, velocities and other information the browser needs.

The room normally advances physics 20 times a second, one **tick** every 50 milliseconds, and sends snapshots about 10 times a second. The browser can draw many more frames than that. If it simply waits for the next snapshot and moves the car when one arrives, it can draw the same position repeatedly and then show a jump. A high frame rate would faithfully redraw the pause.

<picture>
  <source media="(max-width: 600px)" srcset="/blog/smooth-driving/driving-clocks-mobile.svg">
  <img src="/blog/smooth-driving/driving-clocks.svg" alt="A timeline compares physics ticks every 50 milliseconds, snapshots every 100 milliseconds, and a 60-frame-per-second display. If each frame draws only the latest snapshot, six frames repeat the same position before the car jumps to the next one.">
</picture>

*When the browser waits for snapshots, more frames can mean more drawings of the same position.*

In one early, unrepeated diagnostic, turning drawing off reportedly reduced the median frame interval from 40.5 ms to 8.3 ms, while the car's tracked position still advanced unevenly. It was a useful clue: there were [rendering and motion problems to investigate separately](https://github.com/swyxio/TeslaRoadster6/blob/80dc6aa/docs/PERFORMANCE_RELEASE_GATES.md#driving-continuity-comes-first).

The old client already tried to predict the driver's car, but its model did not match the room's clock closely enough. It replayed a full 50 ms of motion for each pending input submission, while the room could use only the latest controls for a tick. For example, three pending submissions could make the client replay 150 ms of motion when the room advanced only 50 ms. It also switched prediction off in common situations, including near traffic and during flight. Correcting the camera helped some transitions; it could not make those two timelines agree.

## Predict the drive, then reconcile it {#predict-the-drive-then-reconcile-it}

Suppose you press right while driving at 100 km/h. You should see the car begin turning without waiting for a round trip to the server. But the room still needs to decide what happened if you hit another car or finish a delivery.

The revised client sends an input with a sequence number and a target room tick. It also runs the shared simulation code locally to predict the controlled car's motion, with approximations for things it cannot know, such as another driver's next input. A snapshot carries the server's tick, acknowledged inputs and queued controls. The client starts from that confirmed state and replays the remaining relevant inputs against their ticks, rather than adding a full physics step for each submission. It then adjusts the displayed car toward the resulting prediction. This correction is called *reconciliation*.

The client also maintains a presentation clock between those ticks. For example, halfway through a 50 ms step, it can draw a position halfway between the two predicted poses; the next animation frame draws a later position. The clock moves gradually toward the observed room clock instead of jumping forward every time a batch of snapshots arrives.

<picture>
  <source media="(max-width: 600px)" srcset="/blog/smooth-driving/motion-flow-mobile.svg">
  <img src="/blog/smooth-driving/motion-flow.svg" alt="Steering immediately drives a local prediction. The same input goes to the authoritative room; its snapshots reconcile the local prediction and supply a buffer for displaying other cars.">
</picture>

*Your own car can react before the room replies. The room still determines the shared outcome, and its snapshots correct the local prediction and feed the display of other cars.*

The room remains authoritative for collisions, rewards and money. Prediction is a presentation of what is likely to happen, not permission for the browser to award itself a delivery. The code also bounds how much history it keeps and how far it will predict ahead. On a stale connection or an unsafe correction it can hold or cut to a confirmed position instead of inventing a long journey through a wall.

Glenn Fiedler's [explanation of client-side prediction](https://gafferongames.com/post/networked_physics_2004/) describes the same basic exchange: predict locally, accept the server's correction and replay what has happened since.

## The other cars have their own timing problem {#the-other-cars-have-their-own-timing-problem}

We know what the local driver just pressed. We do not know what another human will press next. For other cars, the browser keeps a short history of snapshots and normally draws a position between two known samples. This *interpolation* adds some visual delay, but makes movement less dependent on the exact arrival time of each message. Fiedler's [snapshot-interpolation walkthrough](https://www.gafferongames.com/post/snapshot_interpolation/) shows the same tradeoff.

Nearby cars complicate this. If my predicted car is moving ahead while a car beside me is drawn from an older snapshot, they can appear to overlap or pass through one another even when the room does something else. Tesland now estimates a nearby driver's short-term motion from recent observations and tries to show that car on the local predicted timeline. For example, it checks the path against shared buildings and terrain before displaying the forecast; if the path is unsafe it falls back to buffered playback. It does not know the other driver's future input. More distant cars use buffered playback and bounded extrapolation.

The guardrails matter. We had to keep a car on the shared ground height when smoothing over a hill, and keep ferry passengers aligned with the moving deck. A review also caught a recovery case where the local car returned to the latest room state while a nearby car was still drawn from an older one. The fix puts both on the confirmed frame in that case. These checks reduce bad guesses during collisions.

## Two ways to see the drive {#two-ways-to-see-the-drive}

We recorded a manual drive in the older preview and another in the newer build. Both start on the same street, then take different routes.

**Left: older preview · Right: newer build.**

<video controls preload="none" width="1600" poster="/blog/smooth-driving/manual-driving-poster.png" style="max-width:100%;height:auto" aria-label="Two real Tesland playtests side by side: the older preview on the left and the newer build on the right">
  <source src="https://raw.githubusercontent.com/swyxio/TeslaRoadster6/f2a5799092d612b6624e0f00a51d11714f369b77/public/blog/smooth-driving/manual-driving-comparison.mp4" type="video/mp4">
  <a href="/blog/smooth-driving/manual-driving-comparison.mp4">Download the playtest comparison</a>.
</video>

*Two independent drives, shown at their recorded speed with matching crops.*

We later recorded the older radio preview and the live alpha on [a matched street route with game audio](/blog/recording-webgl-playtests/#same-inputs), including a jump and first-person view.

The older recording has a 150 ms gap between captured frames just after acceleration starts. The capture alone cannot tell us whether that gap came from the game or the recorder. The [capture notes](https://github.com/swyxio/TeslaRoadster6/blob/main/docs/benchmarks/2026-10-18-manual-driving/README.md) include the timing audit.

To compare the motion under the same inputs, we replayed the same scripted slalom with 150 ms of simulated round-trip delay, sampling modeled display positions 120 times a second. The test runs the shared simulation and emulates where the scene would draw the car; the two versions also had different background traffic.

<video controls preload="none" width="1280" poster="/blog/smooth-driving/slalom-poster.png" style="max-width:100%;height:auto" aria-label="Side-by-side replay of the earlier and revised Tesland slalom on a shared clock">
  <source src="/blog/smooth-driving/slalom-comparison.mp4" type="video/mp4">
  <a href="/blog/smooth-driving/slalom-comparison.mp4">Download the before-and-after replay</a>.
</video>

*Recorded simulation traces replayed side by side in warmed game scenes. Decorative trees are hidden to make the cars easier to compare.*

In that fixture, the largest modeled display step between samples fell from about **6.98 m to 0.48 m**. Across the middle 90% of samples above 10 m/s, displayed speed relative to the predicted body's speed went from **0–6.96× to 0.98–1.05×**: the earlier display could stop or move nearly seven times as fast as the underlying prediction. The first measured response to left steering moved from 75 ms to the first 8.3 ms sample, using the fixture's threshold against a no-steer comparison. The [raw traces, method and source revisions](https://github.com/swyxio/TeslaRoadster6/blob/6e6067c/docs/benchmarks/2026-10-18-v32-motion/README.md) are available if you want to inspect the details.

An 800 ms interruption in incoming updates still produced a roughly 15.7 m recovery step in a separate synthetic test. Unexpected input from another driver or a genuine relocation can also cause a visible correction.

## Spend less on what is far away {#spend-less-on-what-is-far-away}

The timing fix was only part of the work. The scene still had to draw the Bay and its cars.

We grouped repeated bridge and landmark geometry into regional batches. In a fixed six-view scene fixture, the Golden Gate view went from 110 draw calls to 58, and the Bay Bridge from 199 to 96. A draw call is a request to the graphics API to render a batch of objects. Fewer calls can reduce submission work; measured timings were noisy, so this fixture did not show a reliable frame-time gain. The [rendering notes](https://github.com/swyxio/TeslaRoadster6/blob/74c2255/docs/BAY_RENDERING.md) include the measurements.

We also reduced the default background fleet from 67 vehicles to 22. A distant non-player, non-police car switches to a simplified model beyond 125 m and restores its detailed model inside 100 m; the gap avoids flickering back and forth at one distance. The detailed tree is detached while inactive, so Three.js does not keep traversing all of its children for world transforms. The player's car and police keep their detail. We capped the WebGL drawing buffer at one pixel per CSS pixel, while keeping the HUD at native resolution.

Room snapshots already filter distant ambient entities, but retain players and occupied cars. The room still simulates the shared world and decides collisions. We chose to spend detail and background traffic where they were most likely to matter for the drive.

## A room limit needs more than a socket count {#a-room-limit-needs-more-than-a-socket-count}

The server has a separate performance budget: it must advance the shared simulation quickly enough for everyone in the room. In a 60-second local run with 64 synthetic clients, the room advanced only 44.2 seconds of simulation. The load generator and server shared a busy machine. We reduced the provisional room cap to eight while gathering better measurements.

After [the 0.0.15 release](https://github.com/swyxio/TeslaRoadster6/pull/65), two non-rendering production clients using the game's input clocks and synthetic controls advanced 19.9 seconds of simulation in 20 seconds; five of 801 inputs were rejected as late. A separate desktop Chrome playtest drove and flew the deployed build without captured console errors. The [production report](https://github.com/swyxio/TeslaRoadster6/blob/6e6067c/docs/benchmarks/2026-10-18-v32-motion/production/README.md) has the details.

For another browser game, the reusable exercise is to measure three things independently: **how often you draw, how the displayed object moves, and how quickly the server advances**. Record input times, snapshots and displayed positions under repeatable latency and jitter; then test the awkward transitions—contacts, flight, ferries, resets and reconnection. A faster scene is valuable, but a driving game earns its feel in the space between the input, the next frame and the server's eventual answer.
