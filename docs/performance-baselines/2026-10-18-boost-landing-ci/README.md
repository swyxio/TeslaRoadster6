# Boost and landing: paired no-video CI observation · 2026-10-18

[Workflow run 39170698413](https://github.com/swyxio/TeslaRoadster6/actions/runs/39170698413)
measured clean builds of 0.0.28-alpha base
`009af539404082d5d5da4c3947bd013a6c2e3209` and candidate
`68e62aa6c24029e22e0686744cdc860a567fc388`, in sequence, using the same
seeded route and harness with video disabled. This pair does not measure later
commits. Both completed two deliveries, two jumps and powered flight. All five
sampled path legs met the comparison tolerances: overall p95 separation was
3.688 m and maximum separation was 5.186 m. Per-leg differences and all four
metrics are in [comparison.md](comparison.md).

The hosted `macos-15` runner reported three logical CPUs, Apple M1 (Virtual),
headless Chromium 156.0.8078.4, and ANGLE Metal's Apple Paravirtual renderer at
1280 × 720, DPR 1. One-minute host load averages were 10.79 before and 5.87
after the base, and 5.18 before and 2.38 after the candidate. This is one pair
with differing host load, not a regression verdict or performance budget.
Browser callback intervals do not measure GPU completion or display
presentation; synthetic motion and steering are not player input-to-photon
latency. The room ratio describes one local room with one player, not production
capacity, and the virtual renderer is not a physical desktop or mobile device.
Both bunched-delay synthetic runs also reported a 0.936–1.151× speed range
and 39 rejected inputs; that upper range exceeds the existing aspirational
smoothness target.

The reports and compressed trajectories, browser manifests, input events,
synthetic results and traces are retained here independently of the expiring
CI artifact. [SHA256SUMS](SHA256SUMS) covers the reports, comparison and
compressed files. The reports
include full fixture hashes, environment, load, metric definitions, and
milestone and route evidence.
