# Integrated boost and landing functional captures · 2026-10-18

Captured revision: `664e1406e7f6d37d0afd28048fb6eb93d5ed517e` (0.0.31 Alpha). The source was extracted with `git archive` at that exact revision and built with Vite in a separate temporary directory; the running Worker used that archive's staged fixture and served its build. The manifest target ref is operator supplied and does not itself attest the assets.

The seed-0 fixture used one fresh guest per local room, starting at x = -190, z = 120, yaw = -π/2, with the room paused until the scripted inputs began. The existing verifier observed grounded rear thrust during boost, an upward jump burst and a subsequent supported landing with unchanged pose revision 1. It completed successfully for all three captures. There were zero recorded page errors and zero console errors in each.

| Capture | Viewport | Input | Evidence |
| --- | --- | --- | --- |
| Desktop | 1280 × 720 | Keyboard | [manifest](desktop/manifest.json.gz), [trajectory](desktop/trajectory.json.gz), [inputs](desktop/input-events.json.gz), [verifier](desktop/verification.json.gz) |
| Portrait | 390 × 844 | Emulated touch | [manifest](portrait/manifest.json.gz), [trajectory](portrait/trajectory.json.gz), [inputs](portrait/input-events.json.gz), [verifier](portrait/verification.json.gz) |
| Landscape | 844 × 390 | Emulated touch | [manifest](landscape/manifest.json.gz), [trajectory](landscape/trajectory.json.gz), [inputs](landscape/input-events.json.gz), [verifier](landscape/verification.json.gz) |

The boost, jump and landing screenshots were visually reviewed in all three views. BOOST HELD, LIFT OFF and TOUCHDOWN were visible; both emulated touch views showed FLY during the jump and DRIVE after landing. Runs used headless Chromium 156.0.8078.4, ANGLE Metal and an Apple M5 Pro. Portrait and landscape are touch emulation, not physical-device checks. Audio, production behavior and device performance were not verified; video capture was enabled and these are functional observations, not timing or performance measurements. Trajectories contain received authoritative room snapshots rather than displayed-frame positions.

The desktop scenario SHA-256 is `63d8e1b4601daae226f209ca82901637d48209b397554a74ccc6369daaf8b0e5`; both touch scenarios are `f7a96bdc2926807f3698fdb2b74b77692c0df239f1dade5be5a5cc93844dde95`. The original WebM recordings and boost/jump/landing PNGs are retained locally under `/Users/swyx/Work/TeslaRoadster6/playtest-runs/boost-landing-2026-10-18/integrated-664e140/` and are not committed.

Run `shasum -a 256 -c SHA256SUMS` from this directory to verify the archive. To verify the local recordings, run `shasum -a 256 -c /absolute/path/to/docs/benchmarks/2026-10-18-boost-integrated-664e140/recordings.sha256` from the local recording directory.
