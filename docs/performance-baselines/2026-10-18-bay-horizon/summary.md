## Tesland performance observation

Base: 0.0.41-alpha · f922e213cc5a  
Candidate: 0.0.42-alpha · 9b7982f1a1d1

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 16.7 ms | 16.7 ms | +0 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.934× | 0.939× | +0.005× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version). Route: all five legs aligned; path difference p95 0.332 m, max 0.438 m.

Path difference by leg (p95 / max, m): 1: 0.098 / 0.102; 2: 0.329 / 0.343; 3: 0.401 / 0.438; 4: 0.064 / 0.07; 5: 0.332 / 0.357.

Second-delivery staging duration: base 706 ms, candidate 125 ms.

One-minute host load before → after: base 24.855 → 12.932, candidate 15.445 → 20.05. Complete matching host, runner, viewport and fixture identity: available.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. The p95 includes the mostly stationary staging wait; distance-based path matching does not control elapsed time. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
Performance verdict: HOLD. A single paired run is descriptive, especially under differing host load; a timing difference is not a regression verdict. Repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if identity or either delivery target differs, video is enabled, required jump, landing, flight or delivery evidence is missing, or any of the five sampled paths diverges beyond the documented tolerances. Older reports without explicit evidence and three-leg reports are incompatible with this comparison. Raw traces and conditions are in the uploaded artifact.

Raw local evidence: [base](base.tar.gz) and [candidate](candidate.tar.gz). Each archive contains the report, browser manifest, input events and trajectory, plus both synthetic-motion reports and full traces. The local room names and input scenarios were disposable test fixtures.
