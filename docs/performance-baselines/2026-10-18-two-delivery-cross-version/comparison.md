# No-video cross-version observation · 2026-10-18

Base: 0.0.31-alpha `26fc93449ba010b706db804301524aa44c9f40e7`

Candidate: 0.0.32-alpha `4d7cee443765042d0c2fcb576372e771e1d308a3`

| Observation | Base | Candidate | Interpretation |
| --- | ---: | ---: | --- |
| Browser callback interval p95 | 100 ms | 116.7 ms | HOLD: differing, heavy runner load |
| One-room simulated / wall seconds | 0.923× | 0.927× | HOLD: differing, heavy runner load |
| Modeled display / body speed p05–p95 | 0.983–1.052× | 0.983–1.052× | Synthetic 150 ms latency |
| Modeled steering onset left / right | 8.333 / 16.667 ms | 8.333 / 16.667 ms | Synthetic 120 Hz model |
| Second-order staging command | 125 ms | 123 ms | Recorded in manifests |
| One-minute load before / after | 24.68 / 10.38 | 12.93 / 13.83 | Three-CPU virtual runner |

All five no-video legs aligned: path separation p95 1.869 m, maximum 2.869 m. Both runs completed two deliveries, jumps and flight with a controlled second assignment. P95 includes the mostly stationary staging period; distance-based path matching does not control elapsed time. Timing attribution and the performance verdict remain **HOLD**. The [original workflow summary](summary-original.md.gz) records the raw arithmetic deltas.
