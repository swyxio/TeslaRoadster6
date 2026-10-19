# Headless playtesting and recording

Research date: 2026-10-18. This guide distinguishes a repeatable browser run
from a real player's experience. See [performance release gates](PERFORMANCE_RELEASE_GATES.md)
for the motion, latency, rendering and evidence requirements, and
[verification](VERIFICATION.md) for observations actually made.

## Record a video for the dev blog

With dependencies and the Playwright Chromium browser installed, plus `ffmpeg`
and `ffprobe` on the path, an agent can capture and prepare a public clip:

```sh
pnpm playtest:blog-video --slug my-playtest --gpu metal
```

This builds the checkout, starts the staged fixture bound to loopback with
fresh temporary storage, opens a fresh browser profile, drives the checked-in
`scripts/playtests/blog-drive.json` scenario, and records WebGL pixels. A
successful run must have exactly one finalized segment and an available room
trajectory. It records the game’s synthesized music and effects, combines them
with H.264 video as an MP4, creates a poster, checks for audible audio and
valid output, and writes both to `public/blog/my-playtest/`. Use `--scenario PATH` for a
different staged scenario, `--name NAME` for another clip, and `--gpu default`,
`metal`, `vulkan` or `swiftshader` as supported. Existing files are never
overwritten; choose a different `--name` for another clip. Video files are limited to 25,000,000 bytes,
below the [Workers static asset limit](https://developers.cloudflare.com/workers/platform/limits/#static-assets).

The original video and audio WebMs, manifest and trajectory stay in the gitignored
`playtest-runs/` directory. The helper labels a dirty checkout in the manifest;
the revision is otherwise the local Git HEAD, not a remotely verified build.
Review the captured frames and scenario for sensitive content before including
the generated paths in a post. The fixture uses local chat and storage; do not
put real credentials or third-party content in a scenario. A normal blog build
and the authorized GitHub/Cloudflare release workflow publish the MP4 and post
together. The helper itself does not push or deploy. For seekable playback,
commit and push the video first, then embed its immutable GitHub raw commit URL
and preserve that commit when merging; Tesland's static asset host currently
ignores byte-range requests. Keep the local asset as a download and verify the
deployed player can seek. The agent can perform this workflow without a human
driving or editing the clip.

For the fuller recording and interactive-control API, use the runner directly.

## Runner

Install the project and the matching Playwright browser once:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
```

Start an isolated local game. Use a fresh persistence directory for a new run;
the game automatically joins its room **and global chat** when opened. A remote
target can include other players and their chat in the captured artifacts.

```sh
pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8787 --persist-to /tmp/tesland-playtest-state
```

In a second terminal, record an ordinary driving scenario. Use a new room and
output directory for each run. `--target-ref` is an operator-supplied label,
not a remotely verified build identifier; independently verify the deployed
revision or local checkout and retain that evidence. Use the same scenario file
against each separately built and served revision.

```sh
pnpm playtest:record --url 'http://127.0.0.1:8787/?room=playtest-1&perf' \
  --target-ref YOUR_COMMIT_SHA --scenario scripts/playtests/drive.json \
  --out playtest-runs/drive-1 --fps 60 --trajectory
```

On Apple Silicon, `--gpu metal` requests Metal. `--gpu vulkan` requests Vulkan
for an appropriately configured Linux host. `--gpu swiftshader` forces a
software WebGL implementation for isolated, trusted CI runs. None of these
flags proves hardware acceleration: inspect `runner.webgl.renderer` in the manifest. The default
browser is the Playwright-pinned Chromium headless shell; `--browser chrome`
uses installed Chrome and `--headed` opens a visible browser. Output uses the
viewport's CSS dimensions, defaults to 1280 × 720 and 30 fps, and can be set
with `--width`, `--height` and `--fps` (1–60). `--mobile` enables touch and a
mobile viewport; use `scripts/playtests/touch-drive.json` for a held touch.
These are browser emulations, not physical-device tests.

For an experimental alternative to Playwright's JPEG screencast, add
`--video-source tab --fps 60`. This launches the full Chromium browser in an
isolated test profile, selects only the uniquely titled test tab, and uses
Chromium tab capture plus MediaRecorder. It records the game canvas and HTML
HUD together. Chunks are written incrementally, with a bounded pending queue;
start/stop and file integrity are checked separately from screencast frame
timestamps. The matching `--no-video` control must also specify
`--video-source tab` to use the same browser mode. Both modes still require
real-game inspection and on/off timing on representative hardware: encoded
packet cadence does not prove unique visual frames or player-visible fidelity.
The manual performance workflow can select `tab` for its optional video pair.

Each new output directory contains `manifest.json`, named screenshots and
`segment-NNN.webm` files. Video is silent by default to keep performance
experiments unchanged. Add `--audio` to also record each segment’s Web Audio
graph as `segment-NNN-audio.webm`. The scenario must send a game input before
`recordStart` to unlock the graph. The manifest records an approximate audio
offset based on the command times; it is not a frame-accurate synchronization
measurement. The blog helper uses this offset when muxing. Run
`node tests/playtest-audio.integration.mjs` to check the capture path against a
simultaneous synthetic visual and audio cue. Audio capture does
not include microphone, system sounds or the separate podcast radio player. The manifest contains a hash of the scenario,
operator-supplied target ref, origin/path (query omitted), browser/OS/renderer,
viewport, command start/duration intervals, safe HUD/performance samples and
capture settings. Command intervals are not the instant a browser dispatched an
input event.
Requested video fps is an encoder setting, not proof that the game rendered
that many distinct frames or that playback resembles a player's device. Inspect
the actual recording, frame intervals, renderer and host load. The hosted
[two-delivery pair](performance-baselines/2026-10-18-two-delivery-cross-version/video-summary.md)
shows real route completion but substantial capture-environment jitter, and is
not suitable for judging player smoothness or the boost effect. Use the focused
boost scenario on a representative GPU for that visual check.
`--trajectory` additionally writes `trajectory.json` with the player's pose,
delivery milestones and flight indicators from received authoritative room
snapshots. It does not record player IDs or raw messages, nor does it measure
the displayed position, GPU completion, or input-to-display latency. It depends
on the target version's snapshot shape; a
zero sample count means unavailable, not zero movement. Capturing and parsing
snapshots also has overhead. Use `--no-video` with the same scenario for a
separate control run; do not infer an overhead percentage from one contended
pair. `input-events.json` contains only jump counter/hover fields and the room's
jump acknowledgments, for diagnosing expired or processed controls.

Scenarios are local JSON files containing an ordered `steps` array; the checked
in examples are starting points. Actions include `waitFor`, `wait`, `keyDown`,
`keyUp`, `keyPress`, `click`, `tap`, `touchDown`, `touchUp`, `pointerDown`,
`pointerUp`, `releaseAll`, `fill`, `sample`, `assertNumberAbove`, `screenshot`, `recordStart`
and `recordStop`. `waitForDelivery`, `waitForTicks`, `waitForGround`, and
`jumpUntilAirborne` use authoritative snapshots and require `--trajectory`.
The jump action retries a keyboard press at most five times and fails if no
real lift is observed; `hold: true` retains E for flight. The tick, ground and
jump actions are scripted only, to keep the interactive API responsive.
`waitForRoomReady`, `beginRoom` and `stageRepeatDelivery` operate only
on the loopback fixture described below. `frameStart` and `frameStop` capture raw requestAnimationFrame
callback intervals without recording video; these are not GPU completion or
display presentation times. Hold controls across a wait by pairing down/up actions.
See [performance baselines](PERFORMANCE_BASELINES.md) for the fixed driving
scenario and selective performance reports.
Use distinct `id` values (0–9) on touch down/up to hold multiple controls.
Place setup actions before `recordStart` to skip recording setup, or record
multiple segments. A screenshot captured **before** `recordStop` represents
the end of that segment more closely: finalizing video can block for seconds
while the live game continues. Command intervals are in the manifest. Failed
runs retain finalized video where possible and are marked failed. Secrets and
private chat can be visible in the video or screenshots; never enter a real
recovery code in a run.

### Staged start

For a local-only shortcut to a location, build the game and start the test
fixture instead of the ordinary server, with a fresh persistence directory:

```sh
pnpm exec wrangler dev --config tests/fixtures/wrangler.playtest-stage.jsonc \
  --local --ip 127.0.0.1 --port 8787 --var PLAYTEST_X:-180 \
  --var PLAYTEST_Z:0 --var PLAYTEST_YAW:1.2 --persist-to /tmp/tesland-stage-state
```

The loopback bind is required: the fixture's hostname check is not peer
authentication and cannot prevent access if the server is exposed on a network.
The coordinates must be finite, on supported terrain and clear of solid map
geometry. The fixture checks the game's spawn rules and waits up to five
seconds for moving traffic to clear the position; it fails if it remains
blocked. It moves only the first driver in a fresh room, using the normal room, clock, physics and
inputs; it is not a production endpoint and must never be deployed. Run
`scripts/playtests/staged-drive.json` with `--trajectory`: it waits for the
authoritative pose revision before recording. Check the resulting first pose;
terrain, collisions and traffic can shift it. Other revisions may need their
own matching fixture because internal room contracts can change.

### Repeatable delivery and flight route

The performance scenario uses a seeded room and a synchronized start to reduce
route variation. The performance report automatically creates a per-run secret
in a private temporary file and removes it when the fixture stops. To run the
fixture directly with video, create a fresh private secret file and state
directory, then start the local-only fixture:

```sh
umask 077
stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/tesland-stage.XXXXXX")"
openssl rand -hex 32 | sed 's/^/PLAYTEST_STAGE_SECRET=/' > "$stage_dir/stage.env"
printf 'Secret file: %s\n' "$stage_dir/stage.env"
pnpm exec wrangler dev --config tests/fixtures/wrangler.playtest-stage.jsonc \
  --env-file "$stage_dir/stage.env" \
  --local --ip 127.0.0.1 --port 8787 --var PLAYTEST_X:-190 \
  --var PLAYTEST_Z:120 --var PLAYTEST_YAW:-1.5707963267948966 \
  --var PLAYTEST_SEED:0 --var PLAYTEST_PAUSE:1 --persist-to "$stage_dir/state"
```

In another terminal, set `stage_env` to the printed file path and use a fresh
room and output directory:

```sh
stage_env=/path/printed/above/stage.env
export PLAYTEST_STAGE_SECRET="$(cut -d = -f 2 "$stage_env")"
pnpm playtest:record --url 'http://127.0.0.1:8787/?room=route-1&perf' \
  --target-ref YOUR_COMMIT_SHA --scenario scripts/playtests/performance-drive.json \
  --out playtest-runs/route-1 --trajectory --gpu metal
unset PLAYTEST_STAGE_SECRET
```

Stop Wrangler when finished and remove the private temporary directory.

For a shorter boost and landing visual check, use the same seeded, paused
fixture and a fresh room for every capture. These scenarios do not replace the
delivery/flight performance route. The desktop scenario holds W and Shift;
the touch scenario holds Drive and Boost together while tapping Jump.

```sh
export PLAYTEST_STAGE_SECRET="$(cut -d = -f 2 "$stage_env")"
pnpm playtest:record --url 'http://127.0.0.1:8787/?room=boost-desktop&perf' \
  --target-ref YOUR_COMMIT_SHA --scenario scripts/playtests/boost-landing.json \
  --out playtest-runs/boost-desktop --trajectory --gpu metal
node scripts/verify-boost-landing.mjs playtest-runs/boost-desktop

pnpm playtest:record --url 'http://127.0.0.1:8787/?room=boost-touch&perf' \
  --target-ref YOUR_COMMIT_SHA --scenario scripts/playtests/boost-landing-touch.json \
  --out playtest-runs/boost-touch --trajectory --gpu metal --mobile --width 390 --height 844
node scripts/verify-boost-landing.mjs playtest-runs/boost-touch
unset PLAYTEST_STAGE_SECRET
```

Repeat the touch capture with a new room and output directory at `--width 844
--height 390` for landscape. The verifier checks that the recorded video and
screenshot paths exist and that the trace shows sustained grounded rear thrust,
an upward jump burst followed by a landing, and an unchanged pose revision.
Its `trace-verified` result does not inspect image or video contents; recording
quality and visual evidence remain `UNVERIFIED`. Run the separate recording
quality checks below and inspect playback. A touch-emulated browser is not a
physical phone. Compare matching viewports and fixtures across revisions, and
measure frame times in separate no-video runs.

### Check recording quality

The older 0.0.31/0.0.32 delivery videos were recorded on a contended virtual
GPU and are evidence of the route, not of smooth player experience. Before
using new footage for visual comparison, run the same scenario once without
video and once with video, on the same machine and browser, against the same
origin and verified build. Use a fresh seeded room for each run. On macOS with
Metal, for example, after starting the staged fixture above:

```sh
export PLAYTEST_STAGE_SECRET="$(cut -d = -f 2 "$stage_env")"
pnpm playtest:record --url 'http://127.0.0.1:8787/?room=quality-control&perf' \
  --target-ref YOUR_FULL_COMMIT_SHA --scenario scripts/playtests/boost-landing.json \
  --out playtest-runs/quality-control --trajectory --browser chrome --gpu metal --fps 60 --no-video
pnpm playtest:record --url 'http://127.0.0.1:8787/?room=quality-video&perf' \
  --target-ref YOUR_FULL_COMMIT_SHA --scenario scripts/playtests/boost-landing.json \
  --out playtest-runs/quality-video --trajectory --browser chrome --gpu metal --fps 60
node scripts/verify-boost-landing.mjs playtest-runs/quality-video
node scripts/recording-quality.mjs playtest-runs/quality-control/manifest.json \
  playtest-runs/quality-video/manifest.json > playtest-runs/quality-report.json
unset PLAYTEST_STAGE_SECRET
```

The quality report requires `ffprobe` on the path and returns `HOLD` when the
run, timestamps, video stream, enabled audio stream or matching configuration are incomplete. It
compares animation callback intervals, describes long screencast gaps, and
reports host load. Recording quality is `HOLD` for those gaps or other warnings;
otherwise it remains `UNVERIFIED`. There is no automated approval path, even
after manual review, so it always reports `qualityAcceptance: HOLD`. The diagnostic CLI exits
1 for detected issues and 2 when its checks are clean but fidelity is still
unverified; neither is an approval. The optional CI video run fails closed for
both `HOLD` and `UNVERIFIED` while retaining the recording and diagnostic
artifacts. Its automated checks do not approve player fidelity.
It checks metadata and video packets, not whether images
are unique or look smooth. The frame callback transfers JPEG data and adds
recording overhead. Capture timestamps are not physical display or GPU timing;
the full commit is an operator label and must be checked against the served
build. Inspect the video and scenario trajectory, compare with real gameplay,
and repeat on quiet representative hardware before drawing performance
conclusions. The comparison currently requires one recording segment enclosing
one `frameStart` / `frameStop` interval; scenarios with other layouts need
their own analysis. Keep the private capture traces with the video.

The fixture selects the same traffic cohort, stages the first driver, runs two
setup ticks and pauses. The scenario's `freshGuest` option disables automatic
driver saving in its disposable browser context. It waits for guest identity and a staged
snapshot before releasing the normal 50 ms timer. While paused, repeated
same-tick snapshots keep the browser connected; they are not advancing game
time. Only one driver may join during this pause, and begin is one-use per room
incarnation. With this option a blocked start fails instead of waiting for
traffic to move. The loopback-only `GET /api/playtest/status/<room>` and
`POST /api/playtest/begin/<room>` and `POST /api/playtest/repeat/<room>` endpoints require this secret as a bearer
token. The recorder sends it directly from its environment; it is not saved in
the recording. These endpoints belong to the fixture, not the deployed game.
Never expose or deploy this fixture.

The script invokes the game's Street Pilot through keyboard input and completes
the first delivery. After the next normal assignment finishes searching, the
fixture replaces only the guest's order using that revision's own initial-order
factory at the car's current position. It verifies the same accessible target
IDs and coordinates and never moves the car. It waits for the local guest's
wallet and assignment queue to settle and commits the replacement through the
normal progress queue, so the room projection, draft and disposable profile
agree. That extra commit is part of the measured workload. This controlled second assignment
is not a test of natural second-job selection. It is allowed once, for the
same connected guest, vehicle and room, without a pose revision change.
The report records the staging command duration, including assignment and
wallet waits and snapshot confirmation. Frame p95 includes this mostly
stationary period; distance-based route matching does not control elapsed time.

The saved trajectory and report must confirm both pickups and both completed
drop-offs at their authoritative targets, with both order IDs and coordinates
matching across the pair, then two separate jump bursts with upward movement
and sustained airborne thrust. The scenario
waits for the first landing, briefly accelerates during the second flight and
waits to land again. A respawn invalidates the route. Identical setup and inputs do not ensure
identical trajectories if contacts or timing change; see the full-path
comparability checks and separate no-video measurements in
[performance baselines](PERFORMANCE_BASELINES.md).

### Local agent control

The optional control server binds only to `127.0.0.1`. It creates one isolated,
fresh browser context and a random run ID. Supply a fresh secret of at least
32 bytes through `TESLAND_PLAYTEST_SECRET`, then start it with `--serve`
instead of `--scenario`:

```sh
export TESLAND_PLAYTEST_SECRET="$(openssl rand -hex 32)"
pnpm playtest:record --url 'http://127.0.0.1:8787/?room=agent-1&perf' \
  --target-ref YOUR_COMMIT_SHA --serve --out playtest-runs/agent-1
```

The runner prints the run endpoint but never prints the secret. Supply the
secret as a bearer token to `GET <endpoint>` for status,
`GET <endpoint>/frame.png` for a rendered frame, or
`POST <endpoint>/actions` with an action object from the scenario format.
`{"type":"finish"}` closes the run; Ctrl-C also finalizes it. Requests are
serialized; interactive waits and wait-for timeouts are limited to one second
per request, and `recordStop` releases held inputs before encoding. `finish`
returns HTTP 202 for acceptance, not completion: wait for the runner to exit
and inspect `manifest.json`. `replay.json` saves successful commands and the
elapsed time between them for reuse; this approximates command timing, not
the exact moment an input reaches the game. A failed action marks it incomplete.
include a `waitFor` command for any readiness needed by a fresh run. Replayed
wait-for timeouts are extended to 30 seconds to allow for fresh startup. Text
passed to `fill` is redacted and marks that replay incomplete. Do not place
credentials in selectors, key names or scenario files. Output directories are
owner-only. Protect the secret and output as private local capabilities. This ID/secret controls only this
temporary browser session; it is not a saved-driver identity and does not
authorize a production agent API. Human piloting through a remote service has
not been verified. Do not reuse a saved driver's recovery credential.

With the disposable local game running, verify the control server, browser
inputs, screenshot and video together with:

```sh
pnpm exec tsx tests/playtest-recorder.integration.ts http://127.0.0.1:8787
```

Set `TESLAND_PLAYTEST_GPU=metal` or `vulkan` for the corresponding local
browser setup when supported.

## What to record

Use a real browser and record rendered pixels, not a reconstructed DOM. A useful
run keeps the video alongside the actual timed inputs and any relevant game
telemetry. Capture screenshots at named checkpoints for visual review.
Preserve a sanitized target and independently verified revision, scenario and start
state, browser and runner versions, viewport and device pixel ratio, OS,
graphics renderer, input timeline, network conditions and player count with
each run. Keep artifacts from both builds when comparing versions.

Timed keyboard input is repeatable only if the game starts in a comparable
state. Identical keys do not guarantee an identical path: collisions, traffic,
simulation timing, room state and networking can differ. Verify checkpoints and
report divergence rather than assuming deterministic replay. Use an isolated
room and controlled network setup for comparative testing.

The video is evidence for appearance and visible behavior, not a substitute for
frame timing, input-to-display latency or authoritative simulation telemetry.
Encoding and screenshots can change the workload; measure comparable runs with
and without capture before attributing differences to the game. Record browser
frame or presentation timestamps where available, and validate the output's
duration and frames. A nominal video frame rate does not establish how many
distinct frames the browser rendered.

## Capture options

### Playwright on a local machine or VM

[Playwright video](https://playwright.dev/docs/videos) records a page to WebM;
explicitly set the viewport and video dimensions, since its default fits inside
800 × 800. Await browser-context closure so the file finishes writing. Its
[screencast API](https://playwright.dev/docs/api/class-screencast) supports
start/stop recording and timestamped frame callbacks; it defaults to 25 fps,
and the optional recording `fps` setting was added in 1.64. A video can contain
only frames the browser produced. Pin the actual Playwright and browser
versions, and verify installed features instead of assuming current docs apply.

[Keyboard down and up](https://playwright.dev/docs/api/class-keyboard) support
held and simultaneous controls. This exercises the browser input path, although
it does not prove physical keyboard or touch-device behavior. Use the full
Chromium browser's newer headless mode when appropriate: Playwright otherwise
uses a separate [headless shell](https://playwright.dev/docs/browsers). A headed
browser on a virtual display is another possible configuration; compare its
renderer and timing before treating results as interchangeable.

For a repeatable graphics benchmark, use an isolated machine with a known GPU,
driver, browser and display configuration. Headless Chrome may silently use
software rendering even on a GPU machine. Check `chrome://gpu` and the WebGL
renderer, and retain that information with the run; Google's
[headless WebGL guide](https://developer.chrome.com/blog/supercharge-web-ai-testing)
illustrates the driver and configuration pitfalls. A GPU VM's measured results
describe that VM, not a physical phone or a player's computer. Verify GPU
quota, regional availability, driver setup and total pricing before deploying
one. Google Cloud's [GPU VM pricing](https://cloud.google.com/products/compute/pricing/accelerator-optimized)
and [GPU quota documentation](https://docs.cloud.google.com/compute/resource-usage)
are starting points; storage and network costs may be additional.

### Cloudflare

Cloudflare [Browser Run](https://developers.cloudflare.com/browser-run/playwright/)
can drive a browser, take screenshots and produce Playwright traces. Its
Playwright documentation currently lists video as not fully supported. Its
[session recording](https://developers.cloudflare.com/browser-run/features/session-recording/)
is an rrweb event/DOM replay, explicitly not video: canvas contents and WebGL
are not captured. Do not use that replay as evidence of game visuals or motion.

[Live View](https://developers.cloudflare.com/browser-run/features/live-view/)
can let a human interact with a remote session. Held-key behavior, input latency,
WebGL rendering and frame capture for this game must be measured before
claiming it supports playable driving. Live View URLs are credentials: anyone
holding a control URL can access the permitted session.

Cloudflare [Containers](https://developers.cloudflare.com/containers/) can run
ordinary Linux browser tooling, so they are a candidate for screenshot and
video experiments. The published [instance types](https://developers.cloudflare.com/containers/platform/limits/)
specify CPU, memory and disk; GPU availability for this workload is unverified.
Do not treat a software-rendered container as a representative GPU performance
device. Containers and Browser Run have separate [container](https://developers.cloudflare.com/containers/platform/pricing/)
and [browser](https://developers.cloudflare.com/browser-run/pricing/) pricing.

### Managed browser services

[Browserless screen recording](https://docs.browserless.io/baas/monitor-sessions/screen-recording)
provides WebM and audio through CDP, with an option to combine recording and
human LiveURL interaction. It requires a paid plan and a particular browser
route; its Playwright example reuses the existing page and context. Check the
[current plans](https://cloud.browserless.io/pricing) and validate actual
rendering, key holds, latency and capture rate on Tesland before adoption.

[Browserbase's recording design](https://www.browserbase.com/blog/session-recordings)
uses timestamped pixel capture and asynchronous encoding rather than DOM
reconstruction. Its [replay API](https://www.browserbase.com/blog/session-replay)
provides seekable HLS and reports 31-day retention. Capture is event-driven,
not a promised constant 60 fps; verify WebGL, distinct-frame cadence and GPU
behavior for this game. Export or retain evidence separately if longer-term
comparisons are needed.

These are options to test, not evidence that a remote game recording, GPU
benchmark or human driving session has already succeeded.

## Seeking, clocks and interaction

Seeking a completed recording is independent of advancing the game. For a
real-time driving or multiplayer performance run, keep browser and server clocks
real and run the inputs in real time. [Playwright's clock](https://playwright.dev/docs/clock)
can override animation frames, timers and `performance`; `fastForward` fires
due timers once rather than simulating all intervening frames. It also does not
advance the authoritative server's clock. A staged visual-state experiment can
use controlled time where appropriate, but label it and do not compare its
timing to real-time performance. A saved starting state or scripted setup can
reach a later scene only if the game provides and validates that state.

Browser-driven agents can inspect rendered frames and issue the same keyboard
and UI inputs as a player. That does not require publishing an unrestricted
game-control endpoint or granting control over another driver's identity.
Remote live piloting, a production identity-bound agent API and task scheduling
are separate capabilities; this document does not claim they are implemented.

## Isolation and privacy

The game can automatically join a public room and chat. For automated runs,
use a fresh browser profile and an isolated local or explicitly designated
test environment. Restrict outbound requests before navigation when appropriate,
including chat and external media, and record the restrictions because they
change the test conditions. Never silently connect a recording run to public
players or reuse a real player's saved driver.

Do not put recovery codes, API keys, cookies or live-control URLs in source,
scenario files, console logs, traces, screenshots or videos. Test identities
and secrets must be scoped to the test environment; recordings should be stored
privately with deliberate retention and access controls. Review artifacts for
chat or other player data before sharing them. If remote identity-bound control
is later implemented, it needs an explicit authentication and authorization
design rather than exposing recovery credentials to the runner.
