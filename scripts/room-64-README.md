# Isolated 64-driver sandbox diagnostic

This diagnostic generates substantial load and is intentionally inert by
default. It never starts on a push or pull request. After the workflow exists on
main, a separately coordinated run requires a manual `workflow_dispatch` on the
`codex/64-player-room-diagnostic-manual` branch, a bounded UTC timing window, and both
per-run confirmations. First review and commit an explicit target to
`scripts/room-64-target.json` on that branch: the open candidate PR, its exact
40-character head SHA, the exact current main base SHA, protocol, and its
immutable eight-hex `https://<id>-bay-drive.swyxio.workers.dev` preview; set
`approved` to true. The file on main rejects every target. Do not use a mutable
branch preview, production, an unrelated Worker, or a saved-driver account.

Create the manual diagnostic branch from main only after this workflow has
merged, and check it contains the manual-only workflow before committing a
target. The older `codex/64-player-room-diagnostic` branch previously used a
push-triggered workflow and was disabled at `fbe8cd29`; do not configure or
push an approved target there.

Before confirming a run, coordinate the window with the release coordinator and
verify in Cloudflare that the selected immutable URL is a **Worker Preview**,
not a Version URL. Version URLs use that version's production resources; the
URL's shape and a successful build alone do not establish isolation. Inspect
the **actual deployed preview** configuration, bindings and namespaces in
Cloudflare. Confirm they match the reviewed source and are appropriate for
disposable testing. Cloudflare documents that same-Worker Durable Objects have
separate preview namespaces, but preview overrides can differ from source;
source checks alone cannot establish the deployed configuration. A preview can
persist state and share account resources, and the sandbox room is not private
or authenticated. Never send recovery codes or saved drivers to it. Record no
secrets in the coordination input, which is retained with the run artifacts.
See [Cloudflare preview configuration](https://developers.cloudflare.com/workers/previews/configuration/)
and [resource isolation](https://developers.cloudflare.com/workers/previews/resources/),
and [how previews differ from Version URLs](https://developers.cloudflare.com/workers/previews/compare-workflows/).

Once those checks are complete, dispatch the exact reviewed branch manually:

```sh
gh workflow run room-64-diagnostic.yml --ref codex/64-player-room-diagnostic-manual \
  -f coordination='2026-10-18 12:00 UTC with release coordinator' \
  -f window_start=2026-10-18T12:00:00Z -f window_end=2026-10-18T13:00:00Z \
  -f preview_reviewed=true -f confirmed=true
```

The coordination value must identify the actual agreed window and coordinator,
not the example above. Every run requires fresh confirmations. An unapproved
target, wrong event or branch, missing coordination, or missing confirmation
fails before load. The UTC window may be at most two hours; the identity check
and each harness must start within it with at least 12 minutes remaining for the
bounded sample. The harness repeats the same dispatch checks immediately before
opening sockets. Actions reruns are rejected: dispatch a new run after fresh
coordination and review.

Before any load, the workflow checks the candidate is the current PR head with
current main integrated, the exact Workers Build succeeded, the Cloudflare bot
links that exact SHA to the immutable preview and reports both build and deploy
success, source preview bindings contain only the reviewed same-Worker classes, health
reports matching protocol and capacity 64, and the locally built initial JS
matches the assets served by that preview. The four runners repeat the PR,
source-configuration and health checks before and after measurement; drift
makes the aggregate fail. These checks verify identity and reviewed source,
not the actual deployed bindings. Only a disposable sandbox room is used.

An approved dispatch starts four separate GitHub-hosted runners, each connecting
16 ordinary `Session` instances to one
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

Run the focused checks without connecting a hosted room:

```
node --test scripts/room-64-target.test.mjs
pnpm exec tsx --test scripts/room-64-observations.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --esModuleInterop --types node scripts/room-64-diagnostic.ts scripts/room-64-observations.test.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022 --types @cloudflare/workers-types tests/fixtures/input-trace-worker.ts
pnpm exec tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM --esModuleInterop --types node tests/input-trace.integration.ts
WRANGLER_SEND_METRICS=false pnpm exec tsx tests/input-trace.integration.ts
```

The last command starts an isolated Wrangler on localhost with one client. It
does not contact a preview or run the 64-client test. These checks run on PRs
and main pushes in `room-64-checks.yml`; they do not authorize or dispatch load.

The sandbox grants vehicle upgrades and bypasses the normal economy, so even a
complete run cannot establish normal-room capacity or performance under saving,
ordinary traffic interactions, WAN jitter, rendered motion, or physical-device
use. Decoded application bytes are not wire bytes. This does not measure Worker
per-tick CPU, queue peaks between snapshots or the complete motion gate. Report
these limitations and retain the raw artifacts rather than claiming that 64
people can play smoothly solely from this diagnostic.
