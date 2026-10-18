# Static Bay rendering benchmark

2026-10-18 Pacific, baseline `3307584`, protocol v31. Static bridge, pier, runway
and landmark boxes now share a unit geometry and material batches in 250 m cells.
Buildings keep their existing 700 m batches. This preserves the dimensions,
materials and authoritative map; no geometry detail or world content was removed.

The dev-only [fixture](../tests/fixtures/bay-performance.html) builds the Bay
without players, HUD, networking or a running simulation. It draws only while
measuring or changing view. The six fixed views use Chrome, a 1280×720 render
buffer, DPR 1, 15 warm-up frames and 90 measured frames each. This is a focused
draw-call comparison, **not** a full-game FPS, GPU or mobile benchmark.

| View | Draw calls before → after | Submitted triangles before → after |
| --- | ---: | ---: |
| Golden Gate | 110 → 58 | 143,770 → 143,830 |
| Bay Bridge | 199 → 96 | 167,290 → 167,422 |
| Waterfront | 156 → 92 | 182,728 → 183,436 |
| Oakland port | 149 → 91 | 238,218 → 238,650 |
| SFO | 44 → 37 | 188,690 → 188,798 |
| Stanford | 61 → 60 | 144,902 → 144,902 |

Scene children decreased from 614 to 396. Uploaded geometries after all six
views decreased from 386 to 100. Regional instancing trades slightly coarser
culling for fewer submissions; the largest triangle increase here was 0.39%.
A 700 m detail-batch experiment increased Stanford calls from 61 to 64, so
the final detail batches use 250 m cells.

Per-view raster comparisons changed at most 0.032% of pixels, with mean RGB
channel difference below 0.004 on a 0–255 scale. Tiny raster/depth-order
differences remain; these are not pixel-identical renders. Baseline/candidate
Golden Gate screenshots were visually inspected. The built game was also driven
in Chrome at desktop size and 390×844 / 844×390 viewport overrides. The narrow
layout's on-screen Drive button and landscape keyboard steering responded. These
are viewport/input checks, not physical touch-device or performance measurements.

CPU and frame timings varied under concurrent host work and refresh scheduling;
the candidate did not establish a frame-time improvement. Do not market the
draw-call reduction as a measured FPS gain. [Raw measurements](benchmarks/bay-rendering-2026-10-18.json)
retain the unfavorable timings as well as the deterministic counters.

## Reproduce

1. Use a clean checkout of the baseline and copy the same fixture into it. Run
   `pnpm exec vite --host 127.0.0.1 --port 18982 --strictPort`.
2. Open `/tests/fixtures/bay-performance.html?baseline=1` in Chrome and click
   **Measure all views**. It records PNGs and counters in that origin's local
   storage. Save the displayed JSON.
3. Stop Vite, run the candidate on the **same origin and port**, open
   `/tests/fixtures/bay-performance.html` and measure again. Save its JSON.
   Do not record another baseline before comparing.
4. Keep viewport/DPR, fixture, scene and browser fixed. Close your own unrelated
   rendering test tabs and avoid concurrent builds or load tests when comparing
   timing. Repeat paired samples before making timing claims.

The fixture's `preserveDrawingBuffer` enables raster comparison; production does
not enable it. Render-call duration measures CPU submission only. The fixture
does not load the game's environment map or dynamic content. It is outside the
Vite production entry and adds no shipped JavaScript.
