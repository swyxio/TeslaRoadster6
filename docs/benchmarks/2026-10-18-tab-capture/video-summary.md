## Tesland performance observation

Base: 0.0.36-alpha · e07f0bec4e62
Candidate: 0.0.36-alpha · e9c8ac64a48c

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 33.4 ms | 33.4 ms | HOLD |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.919× | 0.921× | HOLD |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version). Route: all five legs aligned; path difference p95 2.149 m, max 3.367 m.

Path difference by leg (p95 / max, m): 1: 0.097 / 0.101; 2: 0.334 / 0.346; 3: 0.233 / 0.346; 4: 0.367 / 0.381; 5: 3.089 / 3.367.

Second-delivery staging duration: base 209 ms, candidate 135 ms.

One-minute host load before → after: base 15.614 → 9.844, candidate 8.341 → 10.186. Complete matching host, runner, viewport and fixture identity: available.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. The p95 includes the mostly stationary staging wait; distance-based path matching does not control elapsed time. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base on, candidate on; video observations do not produce performance deltas.
Performance verdict: HOLD. A single paired run is descriptive, especially under differing host load; a timing difference is not a regression verdict. Repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if identity or either delivery target differs, video is enabled, required jump, landing, flight or delivery evidence is missing, or any of the five sampled paths diverges beyond the documented tolerances. Older reports without explicit evidence and three-leg reports are incompatible with this comparison. Raw traces and conditions are in the uploaded artifact.
