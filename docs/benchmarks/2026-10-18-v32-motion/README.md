# Motion and room evidence · 2026-10-18 Pacific

These are local experimental observations, not production, GPU, physical-device
or playable-capacity measurements. They preserve separate measurements rather
than combining client frame pacing, simulated motion and room throughput.

## Deterministic motion traces

`v31-slalom.json.gz` and `v31-flight.json.gz` are synthetic 120 Hz presentation
traces using the previous latest-wins client at commit
`146d90a94ccb3539be5b249fe7b980a7427b0f62`. Each contains zero-delay, steady
150 ms RTT and bunched-delivery scenarios plus counterfactual input traces.
The baseline benchmark script had SHA-256
`2a755b161295447c6f67ad9383919b6c9a1f58228db62eea5ad9aa0d9fbcecd5`;
the current benchmark script differs in the NPC fixture and bookkeeping, not
in the slalom or flight inputs. The different source commits also have
different background-traffic behavior, so comparisons are not isolated
rendering or bandwidth benchmarks.

The fixture uses a shared simulation and scene-transform emulation, not an
actual browser or GPU; it does not exercise remote-player collision or WAN
transport. See each trace's `report.fixture` for setup and timing definitions.
The accompanying side-by-side visualization replays these traces in warmed
game scenes on one clock with decorative trees hidden for visibility. It is
not a measurement of frame rate or a live network session.

`v32-final-slalom.json.gz`, `v32-final-flight.json.gz` and
`v32-final-stall.json.gz` contain the corresponding candidate traces at a
simulated 150 ms RTT, captured from code commit
`74a0613e0a730688deffd80fe04303ad067f9f41`. These files are byte-identical
to the earlier runs at `33c040c3e480f1a6e468228a7b450fcb62cf80fe`; the
synchronized comparison video therefore shows the same final local motion.
The benchmark script SHA-256 is
`7dbcbcaef9232cc0b6061caaad2f40caf0840275f200116eebe6af186b1c22a2`.
In the slalom, the displayed/reference speed ratio's
5th–95th percentile changed from 0–6.964 to 0.983–1.052, and the first visible
left-steer response changed from 75 ms to 8.333 ms. These are fixture results,
not a direct measurement of a person's controls or the deployed game. The
800 ms downlink-stall fixture still has one 15.684 m recovery step.

An independent remote-car fixture at 50 m/s found a 0.416 m next-frame step
after a 200 ms delivery gap and 0.424 m after a 300 ms gap. A 400 ms gap
followed by four queued snapshots forced the playback clock forward by two
ticks, producing a 5 m step. This remains a burst-recovery limitation; it is
not measured WAN behavior.

## Desktop dev-build frame pacing

`browser-dev-frames.jsonl` contains batches from the local Chrome candidate
before the final clock and wall changes. A local-only script wrapped animation
callbacks and measured their intervals and JavaScript duration. The proxy
configured 75 ms in each direction plus deterministic 125 ms per-chunk spikes;
it did not measure actual RTT. The measured input intervals were Unix
milliseconds 1792320812694–1792320820736 (road) and
1792320830846–1792320836895 (flight); the reported results exclude the first
and last 500 ms of each interval. Batch `wall` is the send time; `at` is the
browser animation timestamp, and `duration` is callback wall time in ms.
GPU work is excluded. Page startup and unrelated idle batches are present in
the raw file and were not counted in the driving summaries.

## Same-host room samples

The `room/` JSON and manifest record three sequential 60-second runs against
the isolated local Wrangler server from source
`5aeb9e8addd15f829ffa3f5cb85f0a7dcb3e0411`. Each client sent input at 20 Hz
and parsed all received snapshots; the generator and server shared a busy
host. Each `*.evidence.json` includes host-load/process samples and the result;
`*.stdout.json` preserves the load-generator result. The copied runner is the
exact observation script, including its original local PIDs and port, and is
not a general-purpose runner. `source-and-assets.sha256` records the frozen
source and assets. These samples do not measure production throughput or WAN
latency, and the received decoded JSON size is not compressed egress.
