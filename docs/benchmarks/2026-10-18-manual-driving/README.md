# Manual driving comparison · 2026-10-18 Pacific

Two user-recorded desktop playtests start at the same intersection but use
different inputs and routes. The earlier capture is labeled OLD and the later
capture NEW. The older preview, `8ba7595a-bay-drive.swyxio.workers.dev`, was
built from `8cb6af3`, matching the tree of the `146d90a` motion benchmark
baseline. The later capture was made from the then-current production game.
The recordings also reflect changes to traffic, world and physics.

The [comparison](https://tesland.swyx.io/blog/smooth-driving/manual-driving-comparison.mp4) shows the
first 21.5 seconds of each recording at normal speed. Both use the same
992 × 1100 center crop, the same scaling and a common 60 Hz output sampling
grid. Frames are repeated as needed; no intermediate motion is invented. The
export has no audio or source metadata. The full recordings remain local.

## Capture timestamp audit

The raw recordings contain H.264 video at 2552 × 1706. Sorting their video
packet presentation timestamps and measuring adjacent intervals gives:
Percentiles select the nearest indexed value in the sorted interval list.

| Capture | Frames | Median | 95th percentile | 99th percentile | Maximum | Gaps over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Older | 1,156 | 16.67 ms | 28.33 ms | 33.33 ms | 178.33 ms | 3 |
| Newer | 1,207 | 16.67 ms | 30.00 ms | 33.33 ms | 70.00 ms | 4 |

The older capture's 178 ms maximum is at startup. Another gap is 150 ms,
between 1.362 s and 1.512 s, during the initial acceleration; a third is 78 ms
at 13.642 s. The newer capture has three gaps over 50 ms in its first half
second and one at 22.700 s, after the excerpt ends. These are screen-capture
timestamps: they include the recorder and do not locate a delay in the game,
renderer or network. Different controls and routes prevent a controlled
before/after motion measurement from these two recordings.

The separate [synthetic motion benchmark](../2026-10-18-v32-motion/README.md)
uses matched scripted inputs and reports its own measurements.

The original older recording's SHA-256 is
`eb9814fc851eb404863ae1b31d6180f031153a5aa308d5a7ede6deba1e87eaf2`;
the newer recording's is
`3b2345b1b39ce1a152a8a277760eefe76d0a19290a73a89c8fee07acf6bdddde`.
Only the cropped, silent composite is published.
