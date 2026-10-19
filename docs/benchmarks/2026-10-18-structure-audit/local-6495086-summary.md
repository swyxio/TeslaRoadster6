## Tesland performance observation

Base: 0.0.34-alpha · dacde0c68be8 · dirty  
Candidate: 0.0.35-alpha · 649508620c2d · dirty

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 16.8 ms | 16.7 ms | -0.1 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.954× | 0.955× | +0.001× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version). Route: all three legs aligned; path difference p95 0.937 m, max 1.272 m.

Path difference by leg (p95 / max, m): 1: 0 / 0; 2: 0 / 0; 3: 1.146 / 1.272.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during one delivery and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if environments or initial delivery targets differ, video is enabled, milestones are missing, or the three sampled paths diverge beyond the documented tolerances. Five-leg reports are incompatible with this three-leg scenario. Raw traces and conditions are in the uploaded artifact.

