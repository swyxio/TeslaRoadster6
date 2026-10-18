# Paired video route · 2026-10-18

Both reports use the same seeded, synchronized fixture, scenario and recorder
against clean, separately built checkouts. The 0.0.25 revision is
`15b0a500bad046a95e87abd01e7c07090386d684`; the 0.0.28 revision is
`5c1a7c61b6d19ca9168c2327fa889326507b9b7c`. They ran concurrently on an
18-logical-CPU Apple M5 Pro using Chromium 156 and ANGLE Metal, with one-minute
load average 21.50 before and 17.77 after. These recorded runs are evidence of
route coverage, not a performance budget or no-video comparison.

Each run has two delivered orders, two actual jump bursts, a landing between
them, and sustained airborne thrust with forward power. Maximum height was
6.069/6.075 m; horizontal travel during the flight leg was 24.340/23.129 m.
The five paths were compared at 41 distance-normalized points per leg. Overall
p95 separation was 0.846 m and maximum separation 3.205 m. The detailed per-leg
result is in [comparison.md](comparison.md). Input acknowledgments show one
expired 0.0.28 jump and a subsequent successful retry.

The reports, compressed browser manifests, authoritative trajectories, jump
acknowledgments, and synthetic-motion traces are retained here. The local WebM
files are intentionally not checked into Git. Their SHA-256 hashes are:

- 0.0.25, 168.5 s: `7860cec2ccd568dd0d812d4fae0ee17940945905e6cda29aa187b18be6afa7b6`
- 0.0.28, 169.9 s: `e904893a0528025a779b1c3134415ecc9d3e527525614878757e12aadd96b4f7`

The local copies are under `playtest-runs/paired-proof-2026-10-18/`. Frames
near the first delivery and second flight were inspected in both recordings.
The video pair cannot establish GPU completion, actual display presentation,
physical-device behavior, or production capacity.
