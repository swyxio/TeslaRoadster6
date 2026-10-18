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
full recovery/contact coverage, delayed-write isolation, startup transfer,
and same-instant steady-motion evidence remain open for this release.
