# Performance observations by version

The [smooth-driving post](../content/posts/2026-10-18-making-driving-feel-smooth.md)
explains why frame cadence, displayed movement and room progress need separate
measurements. The performance workflow records four recurring observations:

| Measurement | What it captures | Limits |
| --- | --- | --- |
| Browser animation interval p95 (ms) | The 95th percentile of `requestAnimationFrame` intervals during the scripted drive, with movement, live render telemetry and no recorded browser errors. | A render-activity guard is not proof of correct pixels. Callback timing is not GPU completion or actual display presentation. Lower is better for this matched scenario. |
| Modeled display/body speed p05–p95 (×) | Frame-to-frame modeled visual speed divided by predicted-body speed, when the latter exceeds 10 m/s. Ideally near 1. | Synthetic 120 Hz slalom and simulated network, not a live rendered car. Retain max movement per sample and traces too. |
| Modeled steering onset (ms) | Left/right first modeled yaw response relative to a no-steer counterfactual. | Synthetic 120 Hz samples quantize response to 8.333 ms; not human input-to-photon latency. |
| Room simulation / wall time (×) | Authoritative world-time advance divided by elapsed snapshot-arrival time during the route. Requires at least 58 seconds and 200 snapshots with no gap over two seconds. | One local player; browser and Worker share a host. It is not a production capacity or WAN-latency measurement. |

The motion model reports both steady 150 ms simulated round-trip delay and a
bunched-delivery profile. They are separate scenarios. Browser runs use a
fresh local room, staged start, 1280 × 720 viewport at DPR 1, and no video.
The local fixture seeds the traffic cohort and pauses the room until the guest
and recorder are ready, then resumes the normal room clock. A generated per-run
secret protects its local status and start endpoints. The scenario opts
out of automatically saving the disposable driver using `freshGuest`. The player uses
Street Pilot to reach four authoritative milestones: pickup and drop-off for
each of two deliveries. Two observed jump bursts, a landing between jumps, and
sustained airborne thrust with forward power follow. Keyboard presses are retried a bounded number
of times if the room does not process them. The report requires the delivery
milestones, two separate upward bursts and sustained flight; a keypress by
itself does not prove a jump or delivery occurred. A respawn holds the route.

The report saves four delivery legs and a flight leg from received room poses.
Each three-dimensional path is sampled at 41 evenly spaced fractions of its own
traveled distance, including flight altitude.
The pair must have every leg, differ in leg length by at most the greater of
20 m or 25% of the base leg. Each leg must have p95 sampled-point separation
at most 25 m and maximum separation at most 50 m. Missing or
divergent paths hold frame and room deltas. These are comparability tolerances,
not gameplay or performance targets; traffic, contacts, network scheduling and
changed simulation may still make a run diverge. Artifacts retain the scenario,
paths, browser, WebGL renderer, revisions and host load. A hosted runner's
paravirtual renderer describes that VM, not a phone or physical desktop device.

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
for a meaningful comparison. The optional `record_video` input also records
each revision in a separate run after the no-video measurements.

Draft pull requests use the same selection. Marking a draft ready does not
start another measurement; if the selected run failed or was cancelled,
re-run it in Actions or use manual dispatch.

Keep the workflow's path filter in sync with `performance-select.mjs`. GitHub's
[path-filter limit](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons)
can omit matches beyond the first 3,000 changed files; use manual dispatch for
such diffs. Do not make this filtered workflow a required branch-protection
check: GitHub may leave a skipped required check pending.

The job builds both revisions and runs the candidate's harness against each in
sequence on `macos-15`, using headless Chromium with the observed Apple
paravirtual Metal renderer. Its summary and
artifact include the paired observations and raw traces; artifacts expire after
90 days, including when the comparison is held. An incomplete measurement,
different environment or fixture, or divergent route fails the job and is
shown as `HOLD`, never as zero. If video was requested, both recordings must
complete and their routes must also be comparable to each other; their summary
is separate from the no-video measurements. Timing differences are
descriptive: one shared-host pair is noisy, and no automatic performance
threshold is inferred from it. Hosted VM and named local machine results must
not be compared directly.

For local runs, install the
candidate's matching Playwright Chromium browser. Then use a new output
directory for each target:

```sh
node scripts/performance-report.mjs --target-root /path/to/base --out /tmp/perf-base --gpu metal
node scripts/performance-report.mjs --target-root /path/to/candidate --out /tmp/perf-candidate --gpu metal
node scripts/performance-compare.mjs /tmp/perf-base/report.json /tmp/perf-candidate/report.json
```

For separately recorded evidence, run the same commands with new output
directories and `--video`, for example `--out /tmp/perf-base-video --video`.
The comparison uses the no-video reports: recording and encoding change the
workload. Review the WebM files and trajectories together.
Every report builds its selected checkout before capture so an old ignored
`dist` directory cannot be attributed to the wrong revision.

Run sequentially on an otherwise quiet, named machine, and verify the actual
renderer in the report. `metal` is appropriate only where available; the
runner accepts `default`, `metal`, `vulkan` or `swiftshader`. The target must
support the candidate's local staging fixture and motion benchmark;
incompatibility is a missing observation, not a zero. See
[headless playtesting](HEADLESS_PLAYTESTING.md) for the isolated fixture and
recording controls.

## Version log

For each notable release, append a row after reviewing and retaining its
report and raw artifacts in durable storage. Include the date, full revision,
profile, machine/renderer and all four metrics; use `HOLD` for unavailable
values and state why. Link to the evidence, not just an expiring CI artifact.
Keep software-rendered CI and physical-device or named-GPU observations in
separate rows. Repeated, comparable paired runs are needed before treating a
change as a regression or proposing a numerical budget. Existing aspirational
targets and additional coverage remain in [performance release gates](PERFORMANCE_RELEASE_GATES.md).

The earlier local M5 Pro rows below used the short drive and idle room scenario,
not the two-delivery route. Compare new observations by rerunning both versions
with the same current harness rather than treating these rows as matched pairs.

The [0.0.25/0.0.28 paired video proof](performance-baselines/2026-10-18-paired-video-route/)
confirms delivery, jump and flight coverage with closely aligned paths. Video
encoding and concurrent host work make its timings unsuitable as a no-video
baseline; its raw evidence is retained separately.

The [matched no-video CI pair](performance-baselines/2026-10-18-paired-ci-route/)
also completed both routes. Its hosted virtual runner was heavily loaded; the
pair is a first observation to repeat, not a regression verdict or budget.

| Date · version · commit | Scenario · environment | Frame p95 (ms) | Modeled speed p05–p95 (×) | Modeled steer L/R (ms) | Room sim/wall (×) | Evidence / limitations |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 2026-10-18 · 0.0.25-alpha · `15b0a500bad046a95e87abd01e7c07090386d684` | Two deliveries and flight; CI Apple M1 virtual / paravirtual Metal | 66.7 | 0.983–1.052 | 8.333 / 16.667 | 0.937 | [Paired CI evidence](performance-baselines/2026-10-18-paired-ci-route/); single contended run. |
| 2026-10-18 · 0.0.28-alpha · `5c1a7c61b6d19ca9168c2327fa889326507b9b7c` | Same paired scenario and runner | 116.7 | 0.983–1.052 | 8.333 / 16.667 | 0.934 | [Paired CI evidence](performance-baselines/2026-10-18-paired-ci-route/); single contended run. |
| 2026-10-18 · 0.0.24-alpha · `aeb5704c62edde147ff3441b9f82d35ec3d3a63f` | Steady 150 ms model; staged desktop drive, Apple M5 Pro / ANGLE Metal | 16.8 | 0.983–1.052 | 8.333 / 16.667 | 0.956 | [Report and compressed raw traces](performance-baselines/2026-10-18-v0.0.24-aeb5704/); one busy-host observation, before the later economy merge. |
| 2026-10-18 · same version and commit, repeat | Same scenario and machine | 16.8 | 0.983–1.052 | 8.333 / 16.667 | 0.956 | [Repeat report](performance-baselines/2026-10-18-v0.0.24-aeb5704/repeat-report.json) and browser traces in the same directory; same synthetic traces as the first run. |
| 2026-10-18 · 0.0.25-alpha · `1a5a0479570f1bde7d33ed6218c0c0df670767d2` | Steady 150 ms model; staged desktop drive, Apple M5 Pro / ANGLE Metal | 16.7 | 0.983–1.052 | 8.333 / 16.667 | 0.952 | [Report and compressed raw traces](performance-baselines/2026-10-18-v0.0.25-1a5a047/); one busy-host observation. |
| 2026-10-18 · 0.0.27-alpha · `00f8ffeeaefa7a184816244c26b515cf19585539` | Steady 150 ms model; staged desktop drive, Apple M5 Pro / ANGLE Metal | 16.7 | 0.983–1.052 | 8.333 / 16.667 | 0.914 | [Report and compressed raw traces](performance-baselines/2026-10-18-v0.0.27-00f8ffe/); one busy-host observation. |

That browser run observed 360 intervals across six seconds of driving, and
59.2 simulated seconds across 61.912 seconds of received room snapshots. The
host's one-minute load average was 9.00 before and 10.09 after on 18 logical
CPUs; other workloads were active. The repeat had load averages 7.95 before and
10.02 after, with 59.2 simulated seconds over 61.928 seconds of observations.
Two busy-host runs do not establish a regression budget.
For the separate bunched 150 ms model, the speed ratio was 0.898–1.171× and
46 inputs were rejected. That range falls outside the existing aspirational
0.9–1.1× smoothness target; recording it is not a pass. The compressed browser
manifest includes the raw frame intervals, and the trajectory is the received
authoritative pose rather than the displayed pose. The synthetic traces are
retained separately. No physical device or GPU-completion timing was measured.
The adapter hash was added to the saved report after capture by hashing the file
from the recorded commit; subsequent runs record it automatically. The first
report predates reporter-method hashing. The repeat predates the continuous
snapshot coverage guard; rechecking the saved streams found 593 snapshots each,
with maximum gaps of 122 ms and 110 ms. Deltas against a later reporter are
`HOLD`; rerun both versions with the same current harness for a paired result.

The 0.0.25 run observed 360 intervals in six seconds and 59 simulated seconds
over 61.963 seconds of snapshots, with a maximum snapshot gap of 137 ms.
One-minute load averages were 20.15 before and 13.66 after on 18 logical CPUs.
The report predates the final reporter-method edit, so use the current harness
for both sides of a new comparison.

The 0.0.27 run observed 360 intervals in six seconds and 57 simulated seconds
over 62.353 seconds of snapshots, with a maximum gap of 430 ms. One-minute
load rose from 16.15 to 34.72 on 18 logical CPUs, so its room ratio is not a
regression verdict. Its bunched 150 ms modeled speed range was 0.936–1.151×,
with 39 rejected inputs; the upper end remains outside the aspirational range.
