## Tesland performance observation

Base: 0.0.29-alpha · 0b27e97cfd4b
Candidate: 0.0.29-alpha · 25302a8f6f60

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 16.7 ms | 16.8 ms | +0.1 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.956× | 0.955× | -0.001× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version). Route: all five legs aligned; path difference p95 0.711 m, max 1.05 m.

Path difference by leg (p95 / max, m): 1: 0.098 / 0.102; 2: 0.128 / 0.13; 3: 0.001 / 0.001; 4: 0 / 0; 5: 0.991 / 1.05.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if environments differ, video is enabled, milestones are missing, or the five sampled paths diverge beyond the documented tolerances. Raw traces and conditions are in the uploaded artifact.
