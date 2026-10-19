## Tesland performance observation

Base: 0.0.32-alpha · 1f722ddc8fe9

Candidate: 0.0.32-alpha · 4d7cee443765

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 116.7 ms | 116.7 ms | +0 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.914× | 0.918× | +0.004× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version). Route: all five legs aligned; path difference p95 0.678 m, max 3.408 m.

Path difference by leg (p95 / max, m): 1: 0.001 / 0.001; 2: 0.119 / 0.124; 3: 0.368 / 0.401; 4: 0.067 / 0.076; 5: 2.533 / 3.408.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if environments or either delivery target differ, video is enabled, milestones are missing, or any of the five sampled paths diverges beyond the documented tolerances. Three-leg reports are incompatible with this scenario. Raw traces and conditions are in the uploaded artifact.

Archive note: the staged second-order action took 207 ms for the base and 131 ms for the candidate, as recorded in the respective manifests. Frame p95 includes this mostly stationary wait; distance-based path matching does not control elapsed time.
