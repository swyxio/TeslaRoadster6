# Isolated 64-driver sandbox diagnostic

This diagnostic is intentionally inert until an operator reviews and commits an
explicit target to `scripts/room-64-target.json` on the isolated
`codex/64-player-room-diagnostic` branch. It runs only on a push to that branch;
it never runs on a normal PR or main push. Pin the exact open candidate PR,
40-character head SHA, exact current main base SHA, protocol, and its immutable eight-hex
`https://<id>-bay-drive.swyxio.workers.dev` preview, and set `approved` to true.
The default file rejects every target. Do not point it at the mutable branch
preview, production, an unrelated Worker, or a saved-driver account.

Before any load, the workflow checks the candidate is the current PR head with
current main integrated, the exact Workers Build succeeded, the Cloudflare bot
links that exact SHA to the immutable preview and reports both build and deploy
success, preview bindings contain only the reviewed same-Worker classes, health
reports matching protocol and capacity 64, and the locally built initial JS
matches the assets served by that preview. The four runners repeat the PR,
build, bindings and health checks before and after measurement; drift makes the
aggregate fail. This verifies the intended isolated preview identity, not
production. Preview namespaces may persist; only a disposable sandbox room is
used. No recovery code or saved driver is sent.

Before room load, a separate hosted job checks out those exact candidate and
base SHAs, requires the base to equal current main and be a candidate ancestor,
copies the candidate's `bench-snapshot-assembly.ts` unchanged to the base, and
runs three alternating same-runner pairs. The retained raw JSONL includes host
load, assembly CPU and wall timings, and decoded bytes for clustered and spread
fixtures. Source and lockfile hashes are retained. This in-process measurement
is not room throughput, wire traffic, or an end-to-end result.

After configuration, a push to that one branch starts four separate
GitHub-hosted runners, each connecting 16 ordinary `Session` instances to one
room named `sandbox-d<run-id>-<attempt>`. This room name is collision-resistant,
not private or authenticated. The `sandbox-` prefix is the game's explicit
teleport authorization and the usual fenced `Session.teleport` action is used.
One extra connection must receive full-room close code 4003.
Each runner samples the exact source map for 64 separated 1.1 km lanes, then
checks each teleport landed at the requested point, aligns the preserved yaw,
teleports again, and requires the final stationary lane pose. A blocked or
misaligned lane aborts; collisions or dynamic traffic can still affect driving.
A shared room snapshot and four ready markers begin ten simulated seconds of
moving warm-up; a future authoritative start tick coordinates the subsequent
60-second measurement. All four individual artifacts must
share source/diagnostic SHA, room, epoch, barrier and sufficiently overlapping
measurement windows; failed or missing before/after identity evidence aborts.

Results include per-driver movement blocks, measured input counts, rejection
reasons, exact-sequence observed received/applied acknowledgement timing,
snapshot gaps, sampled owner queues, client history and buffers, close events,
decoded JSON size and generator event-loop/load samples. Six 10-second blocks
per driver must each contain at least 50 valid snapshots, no >1 s gap, at least
75 m of travel, and >5 m/s in 80% of snapshots. Rejected inputs, missing applied
ACK coverage, movement outside the sampled 3 m corridor, incomplete movement,
disconnects, or less than 57 seconds of
simulation mark the run incomplete. The one-second reply drain can miss later
rejections and snapshot sampling can miss transient queue/contact events.

Run the focused checks without connecting any room:

```
node --test scripts/room-64-target.test.mjs
pnpm exec tsx --test scripts/room-64-observations.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --esModuleInterop --types node scripts/room-64-diagnostic.ts scripts/room-64-observations.test.ts
```

The sandbox grants vehicle upgrades and bypasses the normal economy, so even a
complete run cannot establish normal-room capacity or performance under saving,
ordinary traffic interactions, WAN jitter, rendered motion, or physical-device
use. Decoded application bytes are not wire bytes. This does not measure Worker
per-tick CPU, queue peaks between snapshots or the complete motion gate. Report
these limitations and retain the raw artifacts rather than claiming that 64
people can play smoothly solely from this diagnostic.
