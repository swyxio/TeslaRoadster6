Tesland runs in a browser, so it is tempting to think a browser session replay is enough to show someone a playtest. It isn't: the street, cars and sky are drawn into a WebGL canvas. A replay of the page's HTML and clicks can faithfully reproduce the surrounding buttons while leaving the game itself blank.

We built a small runner that opens the actual game in Chromium, drives it with timed inputs and records the rendered pixels. It can prepare a video and poster for this blog without a person driving or editing the clip. Here's a real run, captured in a fresh local room:

<video controls playsinline preload="none" width="1280" poster="/blog/recording-webgl-playtests/playtest-audio-poster.jpg" style="max-width:100%;height:auto" aria-label="A scripted Tesland playtest: a red Roadster accelerates and turns through a local Bay Area street">
  <source src="https://raw.githubusercontent.com/swyxio/TeslaRoadster6/e66b677bcb82d54cdfc1e6f9d85f6defab59c4a4/public/blog/recording-webgl-playtests/playtest-audio.mp4" type="video/mp4">
  <a href="/blog/recording-webgl-playtests/playtest-audio.mp4">Download the playtest video</a>.
</video>

*A nine-second capture of version 0.0.32-alpha, with the game’s own synthesized music and driving sounds, driven by the checked-in scenario. The car accelerates, turns and slows near a museum. This is an automated local run, not footage of a human player.*

The point is not to replace a human's judgment. It is to make the thing we are judging visible, repeatable enough to investigate, and easy to share next to the explanation.

## A recording needs the pixels {#record-the-pixels}

Tesland draws its Three.js world into a canvas. The browser knows there is a canvas element, but the positions of the cars and the colored pixels on the road are not ordinary HTML elements. [Cloudflare Browser Run's session recording](https://developers.cloudflare.com/browser-run/features/session-recording/#rrweb-limitations), for example, records DOM changes and input events; its documented replay does not capture WebGL or canvas contents.

That kind of replay is useful for many websites. For a driving game, we need the browser's actual image. The runner uses [Playwright's screencast](https://playwright.dev/docs/api/class-screencast) to save the rendered page as WebM. The runner also records the game’s Web Audio output; FFmpeg combines the sound and pixels into a browser-friendly MP4 and creates a still poster. The separate podcast player, microphone and system audio are outside this capture. The video above plays in the page without an account. Its bytes come from an immutable copy in the public repository: our site's static host currently ignores byte-range requests, which prevents reliable seeking.

<picture>
  <source media="(max-width: 600px)" srcset="/blog/recording-webgl-playtests/capture-flow-mobile.svg">
  <img src="/blog/recording-webgl-playtests/capture-flow.svg" alt="A scenario drives a fresh local game room. Chromium records the WebGL page and game audio; FFmpeg creates an MP4 and poster. The repository serves the video and the site publishes the post. The recorder also keeps a private manifest of the run and inputs.">
</picture>

*The game’s pixels and audio take one path to the article; the run manifest stays with the private playtest artifacts.*

## Give the browser a route to drive {#give-the-browser-a-route}

A scenario is a short list of actions. This one waits for the local room to connect and the staged starting position to arrive, sends a key press to unlock audio, starts recording, holds the accelerator, checks that the speed display rises, then holds right briefly. The [scenario file](https://github.com/swyxio/TeslaRoadster6/blob/main/scripts/playtests/blog-drive.json) is small enough to read alongside the result.

The browser receives keyboard events through the same page controls a player uses. For touch layouts the runner can hold and release multiple simulated touches. A local test fixture can place a car at a known starting point, but it still runs the room's normal physics, inputs and clock. We bind that fixture to loopback and give each run fresh storage; it is not a production control endpoint.

Each run also saves a manifest: the scenario hash, target revision label, browser and graphics renderer, viewport, and timing of the commands. An optional trajectory records the player's positions from room snapshots. For this clip, a headless Chromium run on an Apple M5 Pro reported an ANGLE Metal renderer, requested 30 frames per second and received 151 trajectory samples. The source game was at [commit `1f722dd`](https://github.com/swyxio/TeslaRoadster6/tree/1f722ddc8fe9e2950b2af8d866691d78af49bf4a); the audio capture changes were uncommitted when the recording was made.

Those numbers describe this run, not a promise of smoothness. A requested video frame rate is an encoding setting; it does not prove that the game rendered that many distinct frames. Snapshot positions describe what the room sent, not necessarily what appeared on each display frame. Recording itself adds work.

## The same inputs are not the same drive {#same-inputs}

Even with the same starting point and keys, another car can cross the route, a collision can happen at a different moment, or the room and browser can advance on slightly different schedules. A replay is an instruction to try the route again, not a deterministic movie of the previous run.

For comparisons, we keep the starting conditions, input timeline, video and relevant measurements together, then check whether the routes actually stayed comparable. In [our driving-smoothness investigation](/blog/making-driving-feel-smooth/), we separated real captures from a modeled slalom rather than presenting two different drives as a controlled performance test. The [performance playtest work](https://github.com/swyxio/TeslaRoadster6/pull/93) likewise holds a comparison when endpoints diverge too far.

## From a local run to a public clip {#publish-the-video}

The [publishing helper](https://github.com/swyxio/TeslaRoadster6/blob/main/scripts/playtest-to-blog.mjs) builds the current checkout, starts an isolated local room, runs a scenario, checks that the recording and trajectory completed, combines video with audible game audio, and creates an MP4 and poster under `public/blog/`. The site deployment publishes the poster and download; the player uses the immutable repository copy so seeking works. The original video and audio WebMs, manifest and trajectory remain in the local `playtest-runs/` directory.

```sh
pnpm playtest:blog-video --slug my-playtest --gpu metal
```

The [full guide](https://github.com/swyxio/TeslaRoadster6/blob/main/docs/HEADLESS_PLAYTESTING.md) covers browser installation, other graphics options and custom scenarios. An agent can run the command, inspect the resulting frames and include the generated paths in a post. The helper uses a fresh local profile and room so it does not record other players or their chat. A different recording setup still needs the same care: a video can expose whatever was on screen.

The practical payoff is a tight loop. Ask the browser to drive, look at what it actually drew, keep the conditions with the clip, and put that clip where another person can see it. Then use measurements and human playtests to answer the questions a video cannot.
