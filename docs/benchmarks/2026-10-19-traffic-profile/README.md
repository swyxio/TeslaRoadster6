# Local traffic CPU sample, 2026-10-19

Release `aadab93c98358e608e32e555c2bd7288d326453a`, Node 22.22.2 on an Apple M5 Pro, 18 logical CPUs. The Mac was active; observed one-minute load was about 9.3 before and 8.3 after the investigation, not a controlled quiet-host measurement.

One idle player in a seed-0 shared world, 100 warm-up and 1,000 measured 50 ms steps. One run kept the 59 seeded jam vehicles, one removed them before adding the player. Elapsed simulation loop was 1,153 ms and 283 ms respectively, with V8 CPU profiling enabled. Profiles include startup and TypeScript transformation, have different lengths, and are neither paired room measurements nor production, GPU, rendered-motion, or capacity evidence.

The jam profile's largest game-function self-sample groups were `advance` in `shared/game.ts` and `trafficInput` in `shared/traffic.ts`. This identifies places to investigate; it does not establish a production hotspot, isolate individual operations, or establish causality. The prior exact-release room comparison remains HOLD. Retained raw profiles are [jams](jams.cpuprofile.gz) and [no jams](no-jams.cpuprofile.gz). The [runner](profile.ts) was adapted to accept a checkout path; the original used a fixed absolute path to the release checkout.
