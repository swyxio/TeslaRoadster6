# Performance observations by version

The [smooth-driving post](../content/posts/2026-10-18-making-driving-feel-smooth.md)
explains why frame cadence, displayed movement and room progress need separate
measurements. The performance workflow records four recurring observations:

| Measurement | What it captures | Limits |
| --- | --- | --- |
| Browser animation interval p95 (ms) | The 95th percentile of `requestAnimationFrame` intervals during the scripted drive. | Browser callback timing, not GPU completion or actual display presentation. Lower is better for this matched scenario. |
| Modeled display/body speed p05–p95 (×) | Frame-to-frame modeled visual speed divided by predicted-body speed, when the latter exceeds 10 m/s. Ideally near 1. | Synthetic 120 Hz slalom and simulated network, not a live rendered car. Retain max movement per sample and traces too. |
| Modeled steering onset (ms) | Left/right first modeled yaw response relative to a no-steer counterfactual. | Synthetic 120 Hz samples quantize response to 8.333 ms; not human input-to-photon latency. |
| Room simulation / wall time (×) | Tick advance × 0.05 s divided by elapsed snapshot-arrival time in a roughly 60-second local run. | One player and a shared browser/Worker host; not sustained production capacity or WAN latency. |

The motion model reports both steady 150 ms simulated round-trip delay and a
bunched-delivery profile. They are separate scenarios. Browser runs use a
fresh local room, staged start, 1280 × 720 viewport at DPR 1, and no video.
Traffic and collisions still affect the route. Artifacts record the scenario,
endpoint, browser, WebGL renderer, revisions and host load; inspect these
before comparing. A SwiftShader run describes software rendering on that CI
runner, not a phone or hardware GPU.

## When CI runs

Pull requests changing runtime, assets, dependencies or performance tooling
receive a cheap file-and-size selection. The browser job runs when at least
100 relevant lines change; a binary relevant asset counts as 100. Blog- and
docs-only changes do not start this workflow. Other label events skip selection;
for a small relevant change that could affect performance, add the
`performance-required` label. Maintainers can instead use
**Actions → Performance observations → Run workflow**, choosing a workflow
branch and optionally explicit base and candidate refs. The default base is
`main`; a blank candidate means the selected workflow ref. Choose distinct refs
for a meaningful comparison.

Keep the workflow's path filter in sync with `performance-select.mjs`. GitHub's
[path-filter limit](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons)
can omit matches beyond the first 3,000 changed files; use manual dispatch for
such diffs. Do not make this filtered workflow a required branch-protection
check: GitHub may leave a skipped required check pending.

The job builds both revisions and runs the candidate's harness against each in
sequence on `ubuntu-24.04`, using Chromium with SwiftShader. Its summary and
artifact include the paired observations and raw traces; artifacts expire after
90 days. An incomplete measurement fails the job and is shown as `HOLD`, never
as zero. Timing differences are descriptive: one shared-host pair is noisy,
and no automatic performance threshold is inferred from it. Different renderer,
viewport, fixture or route endpoints can make a comparison `HOLD`. Review the
raw paths for divergence even when endpoints happen to be close.

For local runs, build the candidate and target revisions and install the
candidate's matching Playwright Chromium browser. Then use a new output
directory for each target:

```sh
node scripts/performance-report.mjs --target-root /path/to/base --out /tmp/perf-base --gpu metal
node scripts/performance-report.mjs --target-root /path/to/candidate --out /tmp/perf-candidate --gpu metal
node scripts/performance-compare.mjs /tmp/perf-base/report.json /tmp/perf-candidate/report.json
```

Run sequentially on an otherwise quiet, named machine, and verify the actual
renderer in the report. `metal` is appropriate only where available; the
runner accepts `default`, `metal`, `vulkan` or `swiftshader`. The target must
support the local staging fixture and motion benchmark; incompatibility is a
missing observation, not a zero. Use [headless playtesting](HEADLESS_PLAYTESTING.md)
for separate video evidence. Capturing video changes the workload.

## Version log

For each notable release, append a row after reviewing and retaining its
report and raw artifacts in durable storage. Include the date, full revision,
profile, machine/renderer and all four metrics; use `HOLD` for unavailable
values and state why. Link to the evidence, not just an expiring CI artifact.
Keep software-rendered CI and physical-device or named-GPU observations in
separate rows. Repeated, comparable paired runs are needed before treating a
change as a regression or proposing a numerical budget. Existing aspirational
targets and additional coverage remain in [performance release gates](PERFORMANCE_RELEASE_GATES.md).

| Date · version · commit | Scenario · environment | Frame p95 (ms) | Modeled speed p05–p95 (×) | Modeled steer L/R (ms) | Room sim/wall (×) | Evidence / limitations |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 2026-10-18 · 0.0.24-alpha · `aeb5704c62edde147ff3441b9f82d35ec3d3a63f` | Steady 150 ms model; staged desktop drive, Apple M5 Pro / ANGLE Metal | 16.8 | 0.983–1.052 | 8.333 / 16.667 | 0.956 | [Report and compressed raw traces](performance-baselines/2026-10-18-v0.0.24-aeb5704/); one busy-host observation, before the later economy merge. |

That browser run observed 360 intervals across six seconds of driving, and
59.2 simulated seconds across 61.912 seconds of received room snapshots. The
host's one-minute load average was 9.00 before and 10.09 after on 18 logical
CPUs; other workloads were active. It does not establish a regression budget.
For the separate bunched 150 ms model, the speed ratio was 0.898–1.171× and
46 inputs were rejected. That range falls outside the existing aspirational
0.9–1.1× smoothness target; recording it is not a pass. The compressed browser
manifest includes the raw frame intervals, and the trajectory is the received
authoritative pose rather than the displayed pose. The synthetic traces are
retained separately. No physical device or GPU-completion timing was measured.
