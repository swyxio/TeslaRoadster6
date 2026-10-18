# Headless playtesting and recording

Research date: 2026-10-18. This guide distinguishes a repeatable browser run
from a real player's experience. See [performance release gates](PERFORMANCE_RELEASE_GATES.md)
for the motion, latency, rendering and evidence requirements, and
[verification](VERIFICATION.md) for observations actually made.

## Runner

Install the project and the matching Playwright browser once:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
```

Start an isolated local game. Use a fresh persistence directory for a new run;
the game automatically joins its room **and global chat** when opened.

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
for an appropriately configured Linux host. Neither flag proves hardware
acceleration: inspect `runner.webgl.renderer` in the manifest. The default
browser is the Playwright-pinned Chromium headless shell; `--browser chrome`
uses installed Chrome and `--headed` opens a visible browser. Output uses the
viewport's CSS dimensions, defaults to 1280 × 720 and 30 fps, and can be set
with `--width`, `--height` and `--fps` (1–60). `--mobile` enables touch and a
mobile viewport; use `scripts/playtests/touch-drive.json` for a held touch.
These are browser emulations, not physical-device tests.

Each new output directory contains `manifest.json`, named screenshots and
silent `segment-NNN.webm` files. The manifest contains a hash of the scenario,
operator-supplied target ref, origin/path (query omitted), browser/OS/renderer,
viewport, command start/duration intervals, safe HUD/performance samples and
capture settings. Command intervals are not the instant a browser dispatched an
input event.
`--trajectory` additionally writes `trajectory.json` with the player's pose
from received authoritative room snapshots. It does not record player IDs or
raw messages, nor does it measure the displayed position, GPU completion, or
input-to-display latency. It depends on the target version's snapshot shape; a
zero sample count means unavailable, not zero movement. Capturing and parsing
snapshots also has overhead. Use `--no-video` with the same scenario for a
separate control run; do not infer an overhead percentage from one contended
pair.

Scenarios are local JSON files containing an ordered `steps` array; the checked
in examples are starting points. Actions include `waitFor`, `wait`, `keyDown`,
`keyUp`, `keyPress`, `click`, `tap`, `touchDown`, `touchUp`, `pointerDown`,
`pointerUp`, `releaseAll`, `fill`, `sample`, `assertNumberAbove`, `screenshot`, `recordStart`
and `recordStop`. Hold controls across a wait by pairing down/up actions.
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

The coordinates must be finite, on supported terrain and clear of solid map
geometry. The fixture checks the game's spawn rules and waits up to five
seconds for moving traffic to clear the position; it fails if it remains
blocked. It moves only the first driver in a fresh room, using the normal room, clock, physics and
inputs; it is not a production endpoint and must never be deployed. Run
`scripts/playtests/staged-drive.json` with `--trajectory`: it waits for the
authoritative pose revision before recording. Check the resulting first pose;
terrain, collisions and traffic can shift it. Other revisions may need their
own matching fixture because internal room contracts can change.

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
and inspect `manifest.json`. `replay.json` saves successful commands for reuse;
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
