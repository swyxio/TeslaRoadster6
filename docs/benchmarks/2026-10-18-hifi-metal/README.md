# Higher-fidelity graphics: local Metal observation

On 2026-10-18 Pacific, the candidate `cc5b750306271d50e7327b6194d483373d1e95ca` ran first, then base `e07f0bec4e62737fedcfc72ab9714f4dd4e7a1bf`, each built separately with matching lockfiles and the candidate's recorder and scenario. These are no-video, headless Chromium, one-delivery-and-flight runs at 1280 × 720 on Apple M5 Pro / ANGLE Metal. The benchmark runs the local Worker and browser on the same host.

The reports, recorded input events, browser manifests and received trajectories are retained as deterministic gzip files. `comparison.md` is the harness comparison with its artifact reference corrected. `scenario.json` is the scenario used. Both tracked worktrees were clean; the untracked `node_modules` dependency symlink alone caused the reports' dirty flags.

Both runs completed, but background load differed substantially and both observed room-progress ratios were below 0.95. Browser callbacks are not GPU timing or physical display presentation. This is a descriptive single pair, not a regression budget, synchronized video, two-delivery route, mobile-device test, or proof of player-perceived smoothness.
