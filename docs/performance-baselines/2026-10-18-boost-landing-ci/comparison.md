## Tesland performance observation

Base: 0.0.28-alpha · 009af5394040
Candidate: 0.0.28-alpha · 68e62aa6c240

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 116.7 ms | 116.7 ms | +0 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.914× | 0.912× | -0.002× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version). Route: all five legs aligned; path difference p95 3.688 m, max 5.186 m.

Path difference by leg (p95 / max, m): 1: 0.001 / 0.001; 2: 0.109 / 0.112; 3: 0.001 / 0.001; 4: 0.209 / 0.218; 5: 4.888 / 5.186.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if environments differ, video is enabled, milestones are missing, or the five sampled paths diverge beyond the documented tolerances. Raw traces and conditions are in the uploaded artifact.
