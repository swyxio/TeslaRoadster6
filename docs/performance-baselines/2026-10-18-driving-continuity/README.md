# Driving continuity and room timing · 2026-10-18 Pacific

**HOLD:** these checks do not establish the steady-motion release gate or
playable capacity. The candidate was not merged or deployed on this evidence.

The local baseline was `1f722ddc8fe9e2950b2af8d866691d78af49bf4a` (protocol
46). The timing and prediction candidate was `ef7dc05f15fc7da626f16aa7739102afe14c6e58`
(protocol 47); `465633902f824f5feeb147738504f9ddb8ce5dcd` additionally
prepares audio during automatic startup. The last commit changes client audio
only; the paired room sample below predates it and is not a measurement of
that full final tree. All tests and the build passed on `4656339`.

The [raw evidence](raw-evidence.tar.gz) retains browser traces, local Worker
ticks, relay events, long tasks, the two room runs, and the experimental
substep-polling probe. SHA-256:
`a84a42c0ed8af9070c2fcc735eee1d6313e2ada7de6979a53679780db7f01469`.
The capture and relay record selected numerical state and protocol timing, not
wallet contents or chat. All rooms, profiles and purchases were local fixtures.

## Five-client room sample

On an Apple M5 Pro with 18 logical CPUs, each side used a fresh local Wrangler
room, five moving clients, four saved fixture drivers, a guest, 20 Hz input and
48 simulated paint purchases over a 60-second active interval. These are not
production wallets. Baseline one-minute host load was 6.85 to 6.41; candidate
load was 7.26 to 6.90. The baseline worktree metadata reported dirty because
`node_modules` was an untracked symlink; tracked sources were unchanged. The
symlink was subsequently replaced with an ignored directory of links.

| Measurement | Baseline | Candidate `ef7dc05` |
| --- | ---: | ---: |
| Wall time | 60.007 s | 60.009 s |
| Simulated time | 57.25 s | 60.00 s |
| Simulation / wall | 0.954 | 1.000 |
| Snapshot gap p95 | 106.7 ms | 102.0 ms |
| Input acknowledgement p95 | 207.1 ms | 197.3 ms |
| Maximum wallet queue | 1 | 1 |
| Purchases completed | 48 / 48 | 48 / 48 |
| Decoded snapshots | 46,391,267 bytes | 49,562,515 bytes |

Both fixtures drained their queues, recorded no dropped tick samples, input
rejections or unacknowledged inputs, and met the scripted movement checks.
The fixture's tick-work p95 was 1 ms on both local workerd runs; that local
clock is not proof of production Worker CPU time. A five-client local sample
does not establish capacity at 64 or a production service guarantee.

## Motion and input

The archived baseline and `ef7dc05` captures used the same stationary Roadster
start and scripted W, W+D, W+A, W and braking sequence. Four paired profiles
were run serially: no injected delay; 75 ms each way; that delay plus bunched
FIFO delivery; and one 250 ms downlink hold. These are application-message
delays, not measured network RTT. The final audio candidate repeated all four.
The runs used headless Chromium 156, ANGLE Metal, 1280 × 720 at DPR 1, an
ambient-reduced local room, and recorded host load. All twelve captures
completed without page, console or relay errors, trace drops, or failed gap
enforcement. The final candidate's one-minute load ranged from 6.47 to 11.71
at start and 7.18 to 9.87 at end across the four runs.

The first W-to-scene-transform movement greater than 1 mm was 134, 229, 140
and 98 ms on `ef7dc05`, and 24, 29, 47 and 31 ms on `4656339`, respectively.
A separate local diagnostic attributed one 147 ms first-input stall to
synchronous `AudioContext` creation; a preceding trusted gesture avoided that
stall for the later W press. The four final runs had no first-W long task.
Frame transforms are not display photons. The final bunched run still had one
late input rejection during the drive; startup also included rejected frames.

The predicted-body speed proxy is diagnostic only, not a same-instant
authoritative reference. Its central 90% in the final gap run was
0.984–1.113×; contact and clock limitations prevent treating this as either a
gate pass or a definitive authoritative-speed failure. The other final
profiles had proxy p05–p95 ranges of 0.983–1.012×, 0.979–1.013× and
0.940–1.011×. Full traces remain in the archive.

The ordinary gate analyzer reports unavailable because tick-completion clock
continuity and a position interpolation bound are not proven. A separate
experimental probe bracketed each local tick using serial browser-to-room RPCs
and recorded simulation substeps. The baseline lost a tick bracket during the
first-input pause. The final candidate captured all brackets, but used about
417 RPCs/s; request latency p95 was 4.7 ms and maximum bracket width was
27.2 ms. Even assuming an **unverified** 0.1 ms browser clock error, its
conservative analysis yielded zero eligible speed samples. Its overhead was
not compared with an unpolled run. This result cannot establish the gate.

## Clock experiment and additional evidence

A visual-clock slew cap was tested at `89726ae` and **reverted** at `95b8037`.
The bunched-delivery capture rejected 123 late controls and the authoritative
vehicle did not move during the first W-only segment. The cap also slowed the
clock used to timestamp wire inputs. The earlier `4656339` bunched capture
covered 105.86 m in the same segment. Capture completeness now requires
movement during that first segment, not merely later in the scenario. Neither
the reverted experiment nor that completeness check establishes the speed gate.

The [additional raw evidence](clock-experiment-evidence.tar.gz) retains the
four rejected-experiment captures, a second room pair, tooling samples, the
held-write recovery log and a native-clock collector experiment. SHA-256:
`2c6f8f6ecb24e9206542227209d68bf513b151ccf8851ada1b50910f33522597`.
The Chromium trace retains its events but omits browser metadata; local
fixture secrets and Worker logs are excluded. Native capture 01 did not retain
the files needed to diagnose its failed marker match. Capture 02 retained two
process logs; one was incompatible with all tick markers and the other had
multiple possible matches for every tick. Clock-source equivalence, browser
trace clock mapping and instrumentation overhead remain unproven, so neither
capture supplies same-instant reference speeds. An offline sensitivity study
formed a conservative hull of all possible matches: even assuming favorable
clock mappings and the stated interpolation convention, it found no eligible
speed intervals. The study, assumptions and inputs are retained in the archive;
the result is diagnostic rather than a gate verdict.

The second fresh local five-client pair used baseline `1f722dd` and experiment
`89726ae`. Its independent `RoomInputClient` does not exercise the broken
Session clock: Worker, shared simulation and benchmark client were identical
to the subsequent revert. The baseline advanced 57.25 s in 60.006 s; the
experiment advanced 60.00 s in 60.007 s. Both completed 48/48 fixture
purchases and acknowledged 5,915/5,915 inputs; maximum wallet queue was one.
Snapshot p95 was 106.52 / 101.88 ms, acknowledgement p95 206.90 / 196.98 ms,
and decoded bytes 46,390,478 / 49,609,612. One-minute host load was
7.23 → 5.82 / 5.69 → 6.77. This is not exact full-tree evidence for the
subsequent candidate, a production CPU measurement, or a capacity result.

One contended tooling sample recorded test/build times of 10.87/16.66 s on
the baseline and 10.68/9.21 s on `16448ae`; one-minute host load rose from
7.26 to 15.52 and 15.16 to 18.50, respectively. These samples do not support
a speed comparison. The static initial JavaScript graph was 1,232,633 raw /
364,473 gzip / 299,288 Brotli bytes on baseline and 1,234,822 / 365,219 /
299,806 bytes on `16448ae`. This estimate excludes injected scripts and does
not measure actual initial or repeat transfer or cache behavior.

The `95b8037` local recovery integration held an actual collection write
while another driver's neutral inputs applied and the world advanced; the
write then committed and survived saved recovery. It also exercised a
rejected predecessor and once-only settlement. The latter did not separately
measure unrelated world progress during a failed write.

## Functional verification

`pnpm test` passed 1,057 tests and `pnpm build` passed on `4656339`; Vite's
existing large-chunk warning remains. Live local Wrangler room and prediction
integrations passed on the preceding `ef7dc05` Worker bundle (SHA-256
`273ff3a705bc1e79f4a41b4562f2b531a1ad22df09df4d00bcfac5b425ef6378`), including
near-late input, release, two clients, Dome scoring and wall refill. The audio
commit did not change Worker or shared simulation code.

Local Chromium touch emulation at [390 × 844 portrait](touch-portrait.png)
and [844 × 390 landscape](touch-landscape.png) drove and steered; both
recorders completed with no page or console errors. Their saved trajectories
and release screenshots are in the adjacent touch directories. This was not a
physical-device test; the attached iPhone and iPad were listed offline.
Representative city, traffic and flight GPU/frame timing, physical mobile,
full recovery/contact coverage, failed-write isolation, startup transfer,
and same-instant steady-motion evidence remain open for this release.
