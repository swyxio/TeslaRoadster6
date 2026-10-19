# Hosted room diagnostic (temporary branch)

This is a diagnostic harness, not a production release or a capacity pass. The target file pins the explicitly authorized `6238845` PR head and its immutable Cloudflare preview. This may become older than the final release head. Pushing this branch starts the workflow immediately. Coordinate the measurement window before any push.

The workflow checks out the exact target source separately, confirms current main is an ancestor, verifies PR #109 head and the Cloudflare bot's successful build/deployment record, checks the same-Worker Preview bindings and health protocol/capacity, and independently builds and compares the served initial static JS graph. Each of four runner jobs repeats identity before and after its sample. An updated head or missing identity evidence makes the sample unusable. Cloudflare Preview Durable Objects have separate namespaces from production, but state persists within a Preview: the normal guest identities, room economy and income used by the run write to that Preview. The disposable room name is unique to the run and attempt. A diagnostic-branch push also creates that branch's separate Cloudflare preview, and Actions retains uploaded artifacts for 14 days. No production route, sandbox, saved-driver recovery code, or staging endpoint is used.

Each runner creates 16 real `Session` instances, for 64 in one room, with a synchronized start and 60 seconds of observation. They use the ordinary normal-room spawns and synthetic steering arcs. The game checks spawns for overlap, but these are not pre-staged corridors and drivers may immediately block each other or hit traffic. Every driver's six ten-second authoritative movement blocks must show sustained coverage, or the artifact is incomplete. A run ending early, rejected input, missing measurement-period applied acknowledgements, lost acknowledgement samples, missing queue/history samples, or observed queue/history overflow also makes it incomplete. The four artifacts must be reviewed together for the same room, room epoch, barrier, candidate and diagnostic revisions; compare actual wall windows, which need not overlap for all 60 seconds.

The artifacts retain per-driver first/last snapshot, movement blocks, sampled queue/history bounds, damage/impulse indicators, close codes/reasons, and exact-sequence received/applied acknowledgement delays; only sequences actually seen in snapshots are timed. A received sequence can include a rejected input. A one-second drain may miss later rejections; snapshot gaps can conceal transient bounds or contacts. Decoded JSON size is not wire transfer. This headless client does not render, and neither generator CPU nor local timing establishes Cloudflare Worker tick CPU, physical-device behavior, sustained playable capacity, or a full release-gate pass.

Focused checks, without running load:

```sh
node --test scripts/hosted-room-target.test.mjs
pnpm exec tsx --test scripts/hosted-room-observations.test.ts tests/load-room.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --esModuleInterop --types node scripts/hosted-room-diagnostic.ts scripts/hosted-room-observations.test.ts
```
