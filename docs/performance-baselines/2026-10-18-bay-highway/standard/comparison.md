## Tesland performance observation

Base: 0.0.39-alpha · fa1713cda333  
Candidate: 0.0.40-alpha · a1358fe83147

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 16.8 ms | 16.8 ms | +0 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.953× | 0.955× | +0.002× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version). Route: all five legs aligned; path difference p95 1.213 m, max 1.849 m.

Path difference by leg (p95 / max, m): 1: 0.001 / 0.001; 2: 0.367 / 0.391; 3: 1.155 / 1.213; 4: 1.166 / 1.213; 5: 1.678 / 1.849.

Second-delivery staging duration: base 224 ms, candidate 117 ms.

One-minute host load before → after: base 9.894 → 8.761, candidate 8.368 → 7.166. Complete matching host, runner, viewport and fixture identity: available.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. The p95 includes the mostly stationary staging wait; distance-based path matching does not control elapsed time. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
Performance verdict: HOLD. A single paired run is descriptive, especially under differing host load; a timing difference is not a regression verdict. Repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if identity or either delivery target differs, video is enabled, required jump, landing, flight or delivery evidence is missing, or any of the five sampled paths diverges beyond the documented tolerances. Older reports without explicit evidence and three-leg reports are incompatible with this comparison. Raw traces and conditions are in the uploaded artifact.
