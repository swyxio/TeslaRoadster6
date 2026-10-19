# Driving continuity and room timing · 2026-10-18 Pacific

**HOLD:** these checks do not establish the steady-motion release gate or
playable capacity. The candidate was not merged or deployed on this evidence.

## Integrated candidate hosted observation

[Run 39188192273](https://github.com/swyxio/TeslaRoadster6/actions/runs/39188192273)
compared main `e07f0be` and candidate `38f56a0`, with the three route legs
aligned (path separation p95 0.102 m, maximum 0.272 m). Animation callback
p95 was 133.3 / 116.7 ms; modeled 150 ms bunched-delivery display/body speed
p05–p95 was 0.936–1.151 / 0.862–1.019. One local room observed simulated /
wall ratios of 0.916 / 1.000. One-minute load was 14.67 → 15.68 for base and
17.10 → 17.73 for candidate on a three-logical-CPU Apple M1 virtual runner at
1280 × 720, DPR 1. Browser and Worker shared that host. The [raw reports and
traces](hosted-38f56a0-39188192273.tar.gz) have SHA-256
`e3fdf9b93e7c0632eb6b61bc35f224ae8a486a4e974dd84f63baae8fd3249195`.

The workflow verified observation completeness and route comparability; it did
not apply the release thresholds. Callback intervals are not GPU completion or
display presentation, and the motion model is synthetic. The single heavily
loaded pair does not establish a causal change, representative rendering, or
room capacity. The callback interval exceeds the frame-interval target on this
VM; the synthetic speed proxy is not the gate's same-instant reference. The
full gates remain open.

## Wire-clock recovery experiment

In a synthetic Session and ScheduledInput pinned-contact run, resetting the
wire clock on each newer snapshot shortened the late-rejection period from
1183–2383 ms (25 rejected inputs) to 1183–1933 ms (16). However, the unchanged
contact assertions still failed. A separate half-speed-room fixture processed
one jump and one flip on the base but expired both with the rebase. A
rate-capped follow-up preserved those edges in the selected fixtures while
increasing late rejections, including from zero to 17 in the slow-room case.
None of these changes is applied. The [tests, source variants and traces](wire-clock-recovery-lab-20261019.tar.gz)
have SHA-256 `f668e7d0ca596692c91e8dcc827c0d83f9cb7650cbec2eaab545ad4f31844da5`.
They are synthetic, not a Worker, browser or WAN result.

## Confirmed ferry timeline diagnostic

An isolated experiment retains confirmed ferry hull, phase, manifest, nearby
bodies, controls and identity on a common playhead. It is explicitly unavailable
as a safe presentation result: joint swept seam, hull and peer proofs are not
implemented. Its final seam suite passed 7 of 12 copied cases, with boarding
and disembarking still failing strict transition checks; some copied checks
inspect the original predictor, so their counts are not candidate proof. In a
separate synthetic scheduled-input case, jump and flip first appeared 400 and
490 ms after input, respectively, despite each processing once. A recovery
cut of 330 m was correctly flagged. A scene experiment aligned the hull and
two riders over 241 synthetic frames on the proposed continuous playhead, but
the raw 10 Hz fallback still stepped 2 m. The [patches, notes and raw traces](tesland-confirmed-ferry-diagnostic-20261018.tar.gz)
have SHA-256 `86b9e1a9b51fa01b28be3bdff0fdf12fdd005b8a71ec82667377dfd468f0599d`.
This is not an applied fix or live-room evidence.

## Updated staged throughput observer

The [isolated `38f56a0` observer and preflight lab](tesland-stage-38f-readiness.tar.gz)
has SHA-256 `0e0074d0069cfed48b364ad26f18bb4512b4a80c4fe701541cd028e0a469ec66`.
It passed 27 focused client/ACK/movement tests, eight server-hook tests and a
two-Session loopback smoke, but sustained ACK, complete substep contact
coverage, deployed tick CPU, real wire bytes, provider isolation and observer
overhead remain open. Hosted load is deliberately disabled in that lab; it is
not a room-throughput or capacity result.

## Rocket-pad scan optimization

On the `38f56a0` base, the rocket-pad scan now avoids the full distance
calculation for finite positions already at least four metres away on either
axis. Nearby and nonfinite coordinates retain the original `Math.hypot`
comparison; eligibility callback order and the winner tie-break remain the
same. Focused tests cover boundaries, nonfinite numbers, cooldown, eligibility,
tie order and callbacks that mutate later candidates.

The [fixture, tests, raw timings and Node profiles](tesland-pickup-perf-38f-archive.tar.gz)
have SHA-256 `e752f910d55c7918ae6e8114b323a73b9f5c8c427e4c2251ac962d0245768e50`.
Full world state matched at each of 250 ticks in synthetic 64-player city and
open-lane scenes. In six alternating process-CPU pairs per scene, median time
for those ticks was 1,038 → 624 ms and 556 → 277 ms, respectively. One-minute
host load rose from 8.87 to 12.94 on 18 logical CPUs during the samples. This
is a local synthetic simulation without network or normal economy; it does not
establish a Worker tick, wire-byte, sustained-input or capacity gate.

## Matched inherited peer-contact defect

The [matched trace archive](matched-main-candidate-20261018.tar.gz) (SHA-256
`801b0ddf40a7827b30eb39bb26b7ec1440f8e7f2db5bb662509352a52e1a1b10`)
replays identical authority states, state packets, input schedules and delivery
times through main `e07f0be` and integrated candidate `020f25b`. Their welcome
messages differ only in the required protocol number (48/49). Both snap at
frame 228 of a 481-frame FIFO bunched peer-contact trace: local displayed steps
are 19.500/19.701 m, peer steps 39.578/39.578 m, and both have approximately
0.234 m sampled endpoint overlap. The preceding authoritative tick moved the
peer 2.8 m and impact occurs on a later tick; neither a single large authority
step nor a differing input schedule explains the cut. This is an inherited
presentation failure, with a 0.201 m larger local step in this one trace, not
a general regression estimate. The trace is a synthetic component replay with
directly driven throttle, not real scheduler, browser, WAN, swept-contact or
capacity proof.

A second retained sparse-gap fixture produces 13.968/14.187 m cuts, but it
advances 600 ms of simulation over 301 ms of wall time; it is an extreme
tick-jump detector, not a synchronized 300 ms blackout. After main integration,
`81ea259` passed 1,153 tests and local v49 room and prediction integrations;
the `020f25b` build passed with the existing Vite chunk warning. These do not
clear the performance gates.

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

At experimental `044e24d`, a bunched-delivery local browser capture completed
the first straight with 111.46 m of authoritative movement and no rejected
inputs sent during the drive; 13 neutral startup inputs were rejected before
the drive. First W to a scene-transform movement over 1 mm was 22.4 ms. Host
one-minute load was 28.81 → 26.91, so this is a functional observation, not a
paired performance result. The [raw capture](separated-clock-functional.tar.gz)
has SHA-256 `81a1b553030e3df730667e7f829472e4442e28f313b70be3c38f878cefdcd98a`.
All 1,079 tests and the build passed on the corresponding working tree. A
separate deterministic burst case on the experimental clock exposed a 14.19 m
presentation cut in one frame. Clock convergence near traffic and recovery
after such a burst are not established; the experiment remains on hold.

A later bounded presentation-history prototype is **not applied**. It removed
the large local burst cut in its deterministic case, but a supported head-on
peer contact under a 400 ms delivery gap closed the session. A contact-safety
guard set a misleading history-exhausted flag while the snapshot queue was
empty; the buffer did not fill in that case. Wall and existing convoy cases passed; peer-to-peer safety and
full-world clone cost remain unproven. The [prototype patch and failing test](presentation-history-prototype.patch.gz)
(SHA-256 `b317fcc1f1485d21483abc296f7ce001100356a8917f424b823b19b6a41725c1`)
were saved against `af836da`; do not treat this experiment as a fix. After
applying it to that revision, reproduce with `pnpm exec tsx --test
--test-name-pattern 'head-on peer contact remains|wall strike remains|braking
convoy remains' tests/session-motion.test.ts`.

A subsequent isolated contact lab improved the open-road head-on and three-body
cases, but failed three of 151 focused tests: a pinned-wall hold, false playback
exhaustion after a jump, and ferry shore interpolation. A narrow wall withdrawal
proof improved initial jump and steering response, yet did not resolve the
later stall or prove swept joint-world safety. Short plausible peer relocations
also cannot be distinguished from continuous motion without an explicit
per-entity incarnation/pose-discontinuity token in authoritative snapshots.
The [unapplied lab patch, reproduction notes and test log](presentation-contact-lab-20261018.tar.gz)
have SHA-256 `a02302184a3507dcb0199b8116c6db0b9429b8449bd268b8d02f49a2d36d6882`.
Its single local 64-player clone-cost probe is an implementation indicator,
not a frame, room-capacity or production measurement.

A later [token and contact audit](presentation-token-audit-20261018.tar.gz)
(SHA-256 `22d1bb880b4c6ee4658c8a8a92b7303c786ee7b61e51106cb388913c1ea9c8eb`)
preserves two additional real regressions. A 0.5 m sandbox teleport was
indistinguishable from ordinary movement, and an unattended ferry car moved
without the driver-only relocation callback reporting it. The isolated lab
passed 148 of 152 focused checks; the remaining failures were short teleport,
pinned-wall holding, jump playback exhaustion and ferry interpolation. It did
not implement a token or establish swept-contact safety.

An unapplied [identity prototype](presentation-identity-lab-20261018.tar.gz)
(SHA-256 `4210393b241925403344419a62879a20c182126ea04e25a4d0c57ca5d9c917c5`)
adds per-entity incarnation and pose tokens. Its focused checks cover the
short teleport, ID reuse, snapshot parity, unattended ferry moves, failed
relocations and prediction fences. Typecheck passed and 177 of 180 tests passed;
wall, jump and ferry failures remain, including a 7.40 m cut on a roster change.
Live integration, allocation and payload costs, and all performance gates
remain unverified. This older-base lab is not a release change.

A separate [contact follow-up](playback-contact-followup-20261018.tar.gz)
(SHA-256 `b0e2b36a9fa96627c4b520c01c594843f3b5e9daf62053e2bc4900115d47e81a`)
passes the pinned-wall and jump fixtures and adds dock-contact and multi-rider
ferry tests. It remains experimental: hull and passenger state can still mix
different times, and real scene transitions and swept peer contacts are not
established. A standalone [planar peer-sweep experiment](peer-sweep-proof-20261018.tar.gz)
(SHA-256 `0512992032cdec430c935c06fdf89af7c2851f6c33099a82df953b683c96dfd9`)
passed six focused tests but is not wired into playback; dome and changing
ferry state are unavailable, and numerical bounds, response and cost remain
unverified. A [second version](peer-sweep-proof-20261018-v2.tar.gz) adds a
three-body unavailability regression and passes seven focused tests; SHA-256
`e9615fc8be21a2c91716d5454f5442e2808878b4cc571bf6ae9a3e0a66eefa53`.

The unapplied [combined identity and contact lab](presentation-combined-lab-20261018.tar.gz)
(SHA-256 `d9f921a9df2e312e8fee8feea0fd6e1c32be0a502b58996421325c0a1bad884f`)
passed 200 focused tests and client typecheck. A 1.8-second burst exhausts its
history and disconnects, so that test is not a continuity pass. Before the
disconnect fallback, a roster change caused a 94.78 m cut. The fallback freezes
the scene behind a disconnected state in unit tests; live browser behavior,
moving-ferry coherence, swept peer safety, integration and performance remain
unverified. A later review found that the room-settings action clears the frozen
state before reconnecting; that lifecycle path remains broken in this archive.
The archive preserves both the before and after patches.

A subsequent [lifecycle revision](presentation-combined-lifecycle-20261018.tar.gz)
(SHA-256 `002a4628bc78e08e80ea0cd6ca949b59b2d50808a1e6c9b518c8f7fac5aabb8f`)
adds fixes and focused checks for the room-settings, ordinary-close, stale-input
and reconnect-generation paths. All 209 focused tests and client typecheck
passed. It still disconnects on the 1.8-second burst and requires browser,
ferry, peer-contact, live-room and performance verification.

A separate [scene diagnostic](scene-diagnostic-20261018.tar.gz) (SHA-256
`90e89907cd480756b8ea65a619b156d2e4b7877e5e0a768d1f7b92ed223cac04`)
removed the constructed ferry overlaps by using co-timed poses directly, but
an actual falling-car fallback produced a 2.075 m frame step, versus 0.229 m
with the former smoothing. Its focused reproduction passes five of seven
checks. This prototype is not safe to integrate.

An isolated [burst history experiment](burst-history-diagnostic-20261018.tar.gz)
(SHA-256 `cdc04bb696e3539c2136d7eb2b160513dba76f6176e0eab50232ba728f86d061`)
kept the connection alive by retaining 32 snapshots. It passed one of three
focused checks: a steering response missed its deadline and a peer jumped
19.73 m. Clear endpoints did not establish a safe path between them. The patch
is diagnostic, not a continuity solution.

A separate [conditional blackout-control model](blackout-control-model-20261018.tar.gz)
(SHA-256 `10b1b25a016d20bd08b41ee8d85dcd0b5798c60748ed23f202db7c0233ca6985`)
passed 36 focused tests. Under assumed client and server clock bounds it admits
fresh controls during a 1.8-second snapshot blackout and fences expired inputs.
Those clock bounds and Cloudflare behavior are not established; the model also
demonstrates indistinguishable fresh and stale packets if drift exceeds its
assumption. It is not wired into the Worker or client and does not address
visual prediction or swept contacts.

A follow-up [steady-clock lab](steady-clock-lab.tar.gz) retains its collector,
44 passing focused checks and a sourced provenance note (SHA-256
`125113e9e83421c0f178cdfd2941d6178b4b247cd56548c177670e8955f0f4b2`). Its
new steady scenario has not been run. Pinned-source inspection identifies a
local workerd realtime-clock path and Chromium's Mach clock, but the effective
workerd configuration/binary, exported trace origin, input timing and observer
overhead are not attested. Its conditional interval model remains unavailable
for a release verdict. The commands in the note describe the original temporary
lab layout, not a self-contained installed tool.

## Local 64-client diagnostic

A disposable local Wrangler room on `d05d6f4` and 64 synthetic clients ran on
the same Apple M5 Pro (18 logical CPUs). During the 60.02 s measurement, the
minimum observed snapshot span was 37.8 simulated seconds (median 37.9 s),
all clients' final roster observations included all players and each had an
applied input, and none closed. Roster continuity was not established.
There were 7,552 rejected inputs, including warm-up; decoded JSON across clients
was 3,231.37 MiB. Snapshot gap p95 was 531 ms, maximum 3,269 ms, and the
client event-loop delay p95 was 34.3 ms. Sampled owner control queues reached
three level inputs and zero jump or flip edges; sampling does not prove peaks.

A separate two-client idle handshake against the same local Worker verified
that Node's WebSocket offered and negotiated `permessage-deflate`. The existing
raw-frame probe observed compression on 46/46 requested-compression frames;
median frame size was 698 bytes versus 24,186 bytes without the extension.
These include WebSocket frame headers, exclude TCP/IP and describe a different,
two-client idle fixture. They are not a throughput comparison; in particular,
the 3,231.37 MiB above is decoded client data, not bytes on the wire.

No driver satisfied all six ten-second movement blocks; the original checker
reported all 64 had at least one covered block with less than one metre of
movement and no moving samples. Its coverage can be overstated as noted below.
The fixed control/spawn fixture does not ensure an unobstructed route. This is
an incomplete workload, not a sustained-driving capacity test. The client
generator and server shared the host; one-minute host load rose from 13.51 to
36.62, and other geometry tests overlapped, including a 2.62 s focused test
near the end. No production CPU, WAN, device, or isolated 64-player throughput
claim follows. The [raw report](load64-d05.json.gz) SHA-256 is
`33a4cd6259d387ed3017704f13c3fad12e3a91c6c6929089757f446e58e4e652`.

A separate [room-load lab](room-load-lab.tar.gz) (SHA-256
`2802bd29f893b0d631bf14433a8000e7f648dffced315102d2dd25054d2b45b4`)
contains a loopback-only staging wrapper over the `d05d6f4` ordinary room and
sampled candidate corridors for 64 drivers. It retains the ambient entities
and normal identity/economy hooks. A short two-client functional pilot, not a
capacity measurement, staged both drivers and observed 49.82 m of movement
each in 8.00 wall seconds, acknowledgements through sequence 151 of 155 sent,
and no rejections. The 64-driver runner has not been validated: sampled static
clearance, a nominal speed controller and the short pilot do not establish
60 seconds of obstacle-free movement, dynamic-contact coverage, isolated
load generation, queue peaks or representative city traffic.

The full staged runner was then attempted locally on the `d05d6f4` Worker and
shared simulation, identical in those paths to integrated `3b5be7c`. After
15 seconds of wall-time warm-up, its 60.00-second sample had 20 disconnections
and 6,588 rejected inputs including warm-up. The shortest observed snapshot
span was 27.3 simulated seconds; an early disconnect can shorten that span,
so it is not necessarily the room's total advancement. The original checker
reported all 64 meeting movement criteria in each of the first two ten-second
blocks, none in the third or fourth, and 44 and 34 in the last two. It later
proved capable of missing gaps across block boundaries and overstating time
coverage, so true coverage could be lower. Zero sampled damage or
impulse does not exclude between-snapshot contacts. The cause of the closes
was not captured. This is an incomplete diagnostic, not a capacity pass.

The movement checker now counts a gap across every block it spans and requires
short moving sample pairs to cover 80% of a block in both receipt and simulation
time. Ten focused tests passed, including a 1.9-second cross-boundary gap,
sparse stops, lost ticks, slow simulation, malformed states and roster identity.
The checker fences a changed room epoch before updating the input client,
requires every recorded roster to include every expected client and separately
requires at least 57 seconds of simulation in a 60-second sample. A two-client,
two-second local Wrangler smoke exercised the updated path; it is not a load
or capacity result. This is still
a sampled proxy, not proof of continuous travel between samples. The archived
historical reports retain their original measurements and checker; their movement
coverage counts are upper bounds. The local checker marks sustained input
acknowledgement unmeasured because a single post-warm-up acknowledgement cannot
prove continued progress.

Observed snapshot-gap p95/max were 366/3,076 ms; applied-ack observation p95
was 477 ms for the sequences observed in snapshots. Decoded JSON was
2,596.82 MiB, and sampled owner queues reached three level inputs. The local
client generator and Worker shared an Apple M5 Pro with 18 logical CPUs;
one-minute host load was 20.73 before and 19.52 after. No Worker CPU or wire
byte measurement was obtained. The [report](staged-load64-d05.json.gz) omits
the disposable room and driver IDs (SHA-256
`7d525b52dae098ef8810c3aaa70cf05c3a9f8f01a5312aee174747ee08e2e0c7`).

The saved original runner for this sample has SHA-256
`bdb2f35c9d815db70b1849a400fd7e6518524486b70f842aed88b0a2dc054a45`.
Its 20 closed clients had last valid movement samples around the same point,
but it did not record close codes or reasons. The lab's updated runner adds
those details, first/last state timing and rejection reasons; five focused
controller/diagnostic tests pass, but that updated runner has not been loaded.

### Distributed preview diagnostic

[Run 39180414284](https://github.com/swyxio/TeslaRoadster6/actions/runs/39180414284)
used four independent hosted runners, each with 16 normal guest Sessions, in
one disposable room on the verified `6238845` preview. Identity and before/after
checks passed. All 64 stayed connected, saw all players and applied measured
input. Each runner observed 60.003–60.015 wall seconds and at least 59.9
simulation seconds; reported windows overlapped for about 59.947 seconds.
Of 76,785 measured sends, at least 1,334 were rejected (1,326 late, eight
revision); the one-second drain may miss delayed replies.

Of the 1,326 late rejections, 915 were sent in the first ten measurement
seconds. For 134, the last snapshot observed before the rejection reply was
already at least three ticks beyond the target, which exceeds the server's
two-tick retiming allowance. For the rest, the captured data cannot distinguish
that condition from an expired accepted-control watchdog. Individual snapshot
age at send and the server receive tick were not recorded, so the timing burst
does not identify a room, network or client-clock cause.

The [late-input reproduction](late-input-diagnostic-6238845.tar.gz) (SHA-256
`354e7dd463c90041625f7a8cbe7d72d570f56400fd45aaaef71a9b39b26ec953`)
shows 274 of those 1,326 late inputs were already sent at the maximum lead;
for 93, a later observed same-epoch snapshot had advanced more than two ticks
past the target. This assumes ordered socket delivery and monotonic ticks; it
does not reveal the server receive tick. A hypothetical wider late window
admits a stale throttle while release is in flight and fails two existing
contract checks, so it is not recommended or shipped.

The movement workload was incomplete: at most three drivers met the original
checker for even one ten-second block, none met it for all six, and 25 traveled
under 1 m. The original checker could miss gaps across block boundaries and
overstate time coverage, so these coverage counts are upper bounds.
Normal spawns and traffic were not staged or validated as unobstructed; 37
drivers had sampled health decreases and 22 had sampled push impulses. These
observations do not establish the cause of a particular stop. Per-runner p95
snapshot gaps were 130–138 ms, exact-sequence applied observations were
338–425 ms, and client event-loop delays were 21–23 ms. The latter acknowledgement
measure includes observation delay. Sampled queue/history maxima were six and
20, with no observed overflow; between-snapshot maxima and server tick CPU
were not measured. The four four-CPU hosts sampled one-minute load of
0.45–1.14. Aggregate decoded JSON was 5,082.41 MiB, not measured wire bytes.
This is not a playable-capacity or full throughput-gate result.

The [sanitized reports, identity evidence and exact harness](hosted-6238845-39180414284.tar.gz)
have SHA-256 `45543e6638307f8e644d3411f429037fa9794634f06e002d046cb71342bcf9d3`.

An unrun [input-rejection instrumentation prototype](input-rejection-preview-prototype.tar.gz)
records the server handling tick and watchdog/revision state, plus client
snapshot age. It passed 36 focused tests and typechecks. Its workflow is
disabled and target unpinned; a separate Worker's identity, bindings and live
metadata need verification before use, and observer cost needs a matched
study. A watchdog already disarmed before receipt still has an ambiguous cause.
The existing normal-spawn fixture remains insufficient for sustained movement.
The archive has SHA-256 `e318b5742eccc260a8723232ccd05bbaa2cd42bee826ddd87c2631e1be2794e9`.

The [second diagnostic revision](input-rejection-preview-v2.tar.gz) adds a
fail-closed identity checker and passed three checker tests and a one-client
loopback Wrangler smoke for applied and rejected inputs. Its provider response
schema, complete asset graph and workflow wiring are unverified; the workflow
remains disabled. No remote diagnostic Worker or load was started. The source
predates current main, and observer overhead is unmeasured. SHA-256:
`28742c3cc8ae7136500a0e51a7cdd094b8612b4c2cea2e2b8bf8ee98d1df8d60`.

An unapplied [acknowledgement observer prototype](ack-observer-diagnostic-20261019.tar.gz)
(SHA-256 `e79f70f33d93dbe5c914a09759108bb9f83794319baf5a856d9fbf892892afe3`)
passed 11 focused tests and typecheck. It records exact observed applied
sequences and their send-to-snapshot upper bounds. It is not wired into the
staged Session driver: that driver needs a validated exact-frame hook, the
corrected movement tracker and a new integration test. No load test ran with
the observer, and its overhead remains unknown.

A [disabled staged-fixture prototype](hosted-stage-fixture-20261018.tar.gz)
uses real Sessions and passed five focused tests, typechecks and a two-client
loopback smoke, including unique slots and advancing warmup. Its whole-tick
contact samples are explicitly incomplete; provider isolation, authoritative
substep tracing, the four-runner barrier and observer cost remain unverified.
No remote diagnostic or 64-driver run was started. The archive includes an
earlier readiness assessment and has SHA-256
`27971eca577e78ca7c6cd016cf233dbe64e9518b3795787b9dabaff4975b15e6`.

An additional [substep instrumentation patch](hosted-stage-substep-20261018.patch)
(SHA-256 `dad2d16d62f032a0bff37267c3f2a351bf3ee29e7651dc2b1b87787f88fdc81b`)
passed eight focused tests, typechecks and a two-client loopback smoke. Contact
coverage is explicitly incomplete and its bounded buffer cannot retain the
full 64-driver gate at eight substeps. It applies after the two prior diagnostic
patches and is not enabled or deployed.

A later [disabled e6 staged lab](hosted-stage-e6-readiness-20261019.tar.gz)
(SHA-256 `a30da2b23f52dc21ab2554250da2a774549a8dc3b74ae9d894cd3333397003e1`)
adds bounded packed substep traces and conservative sweep checks. Twelve trace
and sweep tests, 27 ACK and movement tests, both lab typechecks, a 64-slot
static preflight and a fresh two-Session local smoke passed. The packed trace
held 768,000 synthetic poses in the test, but sweep inputs are not exported and
contact coverage remains explicitly incomplete. Provider isolation, observer
overhead, wire bytes and a validated per-tick CPU source remain unverified.
Hosted execution stays disabled; no 64-player or throughput gate was run. The
lab is based on runtime source from `e6ad3b7`, not a deployed artifact.

## Hosted comparison

[Run 39178956817](https://github.com/swyxio/TeslaRoadster6/actions/runs/39178956817)
compared base `1f722dd` with candidate `84f9cf3` but could not complete the
base. Its local staging Worker called the candidate-only `stopTicks` method
against the baseline, causing a room-upgrade 500; the recorder timed out
waiting for a live connection. The runner/browser session ended, so no
same-session recovery is possible. The candidate completed, but the comparison
is **HOLD**. Its 133.3 ms callback p95 was on a three-vCPU virtual host with
one-minute load 15.47 → 13.47; it is not a GPU-completion or paired result.
[Selected logs and reports](hosted-39178956817-summary.tar.gz) have SHA-256
`72923a7ede64012eac8b5ba8a4d96966b36306ea7abdff451fabcbf48c49e2cf`.

The fixture now detects and pauses either the baseline's direct interval or
the candidate's start/stop scheduler, rejecting an unknown scheduler. The same
local Wrangler integration passed against built baseline `1f722dd` and
candidate `2a2c7db`, including paused snapshots and resumed inputs. This is a
functional fixture check; it did not itself supply a hosted comparison.

The [new hosted pair](https://github.com/swyxio/TeslaRoadster6/actions/runs/39180171425)
completed on base `333a3cc` and candidate `6238845`. Its three route legs
aligned with 3.678 m p95 path separation. Browser callback interval p95 was
66.7 / 116.7 ms and room simulation/wall was 0.927 / 1.000. One-minute host
load was 16.10 → 6.17 for base and 14.98 → 12.88 for candidate on an Apple M1
three-CPU virtual host. This single unevenly loaded pair is descriptive; the
callbacks do not measure GPU completion, and the synthetic modeled-speed
ratios do not establish the same-instant continuity gate. The workflow's
successful comparability check is not a release-gate pass. [Selected reports
and logs](hosted-39180171425-summary.tar.gz) have SHA-256
`d18ba62623c62b3ed5a1816ce72ed99e89fdbb40fe568808a5b24ae845c94c43`.

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
