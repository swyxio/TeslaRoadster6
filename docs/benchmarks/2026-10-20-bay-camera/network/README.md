# Synthetic camera replay

These traces compare the released 0.0.51 chase framing with candidate camera code `12d5cf06` against the same simulated vehicle pose. The experiment uses 20 Hz physics, 120 Hz presentation, a 1280 × 720 camera and three simulated transport profiles. It does not run a browser, a GPU, a real network or a physical device.

Run from the repository root with dependencies installed:

```sh
node --import tsx docs/benchmarks/2026-10-20-bay-camera/network/camera-network.ts /tmp/tesland-camera-net-replay
```

The output includes six full JSON traces and `summary.json`. The summary reproduced byte-for-byte on the candidate used for the measurement; individual floating-point values in the traces varied at the last decimal place. The two counterfactual summaries are exploratory replays of focus-rate and orientation-smoothing variants; they are not release candidates. See `docs/VERIFICATION.md` for the landing finding and limits.
