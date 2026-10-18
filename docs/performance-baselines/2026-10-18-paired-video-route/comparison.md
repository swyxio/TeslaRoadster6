## Tesland performance observation

Base: 0.0.25-alpha · 15b0a500bad0  
Candidate: 0.0.28-alpha · 5c1a7c61b6d1

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 16.7 ms | 16.7 ms | HOLD |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.925× | 0.927× | HOLD |

Bunched 150 ms synthetic speed ratio: base 0.898–1.171×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version). Route: all five legs aligned; path difference p95 0.846 m, max 3.205 m.

Path difference by leg (p95 / max, m): 1: 0.098 / 0.102; 2: 0.095 / 0.102; 3: 0.001 / 0.001; 4: 0.209 / 0.218; 5: 2.199 / 3.205.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base on, candidate on; video observations do not produce performance deltas.
A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if environments differ, video is enabled, milestones are missing, or the five sampled paths diverge beyond the documented tolerances. Raw traces and conditions are in the uploaded artifact.
