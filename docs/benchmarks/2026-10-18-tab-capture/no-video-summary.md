## Tesland performance observation

Base: 0.0.36-alpha · e07f0bec4e62
Candidate: 0.0.36-alpha · e9c8ac64a48c

| Metric | Base | Candidate | Change |
| --- | ---: | ---: | ---: |
| Browser animation interval p95 | 116.7 ms | 133.2 ms | +16.5 ms |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | see ranges |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | see times |
| Room simulated / wall seconds | 0.92× | 0.917× | -0.003× |

Bunched 150 ms synthetic speed ratio: base 0.936–1.151×, candidate 0.936–1.151×.
Browser renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version). Route: all five legs aligned; path difference p95 0.573 m, max 0.715 m.

Path difference by leg (p95 / max, m): 1: 0 / 0; 2: 0.11 / 0.112; 3: 0 / 0.001; 4: 0 / 0; 5: 0.599 / 0.715.

Second-delivery staging duration: base 158 ms, candidate 155 ms.

One-minute host load before → after: base 23.331 → 14.839, candidate 16.533 → 12.835. Complete matching host, runner, viewport and fixture identity: available.

Required observations: available.

Animation intervals are browser callback timing, not GPU completion or actual display presentation. The p95 includes the mostly stationary staging wait; distance-based path matching does not control elapsed time. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base off, candidate off; video observations do not produce performance deltas.
Performance verdict: HOLD. A single paired run is descriptive, especially under differing host load; a timing difference is not a regression verdict. Repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if identity or either delivery target differs, video is enabled, required jump, landing, flight or delivery evidence is missing, or any of the five sampled paths diverges beyond the documented tolerances. Older reports without explicit evidence and three-leg reports are incompatible with this comparison. Raw traces and conditions are in the uploaded artifact.
