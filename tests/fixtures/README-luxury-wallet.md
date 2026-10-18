# Local luxury wallet playtest

This fixture contains test-only cash seeding, positioning, and fault injection.
It is for an isolated localhost Worker, never for deployment or public access.
Build the game first, then start it from the repository root:

```sh
pnpm build
pnpm exec wrangler dev --config tests/fixtures/luxury-wallet-wrangler.jsonc --local --ip 127.0.0.1 --port 8797 --persist-to /tmp/tesland-wallet-visual
```

Open `http://127.0.0.1:8797` in Chrome, join a room with a known name, and use
**Driver identity → Get recovery code** to bind and remember the driver. From a
terminal, list its current player and wallet identifiers, replacing `ROOM`:

```sh
curl -sS -X POST http://127.0.0.1:8797/__wallet-test/players \
  -H 'content-type: application/json' -d '{"room":"ROOM"}'
```

Leave the room or close the tab. After the player disconnects, seed its saved
wallet using the `driverId` returned above:

```sh
curl -sS -X POST http://127.0.0.1:8797/__wallet-test/fund \
  -H 'content-type: application/json' -d '{"driverId":"DRIVER_ID"}'
```

Reopen the game and rejoin the same room with the remembered identity. Query
`players` again for the new `playerId`, then move the driver to the Vault or a
workshop while the room is running:

```sh
curl -sS -X POST http://127.0.0.1:8797/__wallet-test/position \
  -H 'content-type: application/json' -d '{"room":"ROOM","playerId":"PLAYER_ID","side":-1}'
curl -sS -X POST http://127.0.0.1:8797/__wallet-test/workshop \
  -H 'content-type: application/json' -d '{"room":"ROOM","playerId":"PLAYER_ID"}'
```

The fixture grants $20 million only in its local storage. Delete
`/tmp/tesland-wallet-visual` after the playtest to remove that isolated state.

## Sustained active-wallet sample

With the isolated fixture running and the host otherwise idle, run:

```sh
pnpm exec tsx tests/luxury-wallet-throughput.bench.ts http://127.0.0.1:8797 /tmp/tesland-wallet-throughput.json
```

Pass `--drive` after the output path to stage five stopped vehicles and a fixed
seed-0 traffic cohort, then hold throttle instead of brake. The trace records
the staged vehicles, traffic and room time as well as sampled positions. Room
clocks, subsequent routes and contacts may still differ between runs. The sample
requires at least one saved driver to cover 100 m. Add `--expect-collection`
after `--drive` when testing a build
with vehicle collections to require a saved collection in the resulting wallet.
The saved drivers must start with empty collections. Omit that flag on a baseline
without the feature. It remains a same-host fixture
observation, not a capacity test.

The sample connects four funded drivers and an observer, warms up, measures a
five-second no-purchase baseline, then samples 60 seconds of production room
ticks with 20 Hz input and 48 paid workshop changes. Active OTA and delivery
timers generate their normal checkpoints; a fresh OTA subscription renews
after 120 simulated seconds, beyond this window. The JSON artifact contains
raw per-input acknowledgement times, snapshot times and local tick timings,
plus profile commit attempts, queue bounds and cleanup counts. Fixture
instrumentation and same-host client decoding affect the result; it is not a
production or capacity measurement. The script exits nonzero if the existing
room-throughput gate or the recorded correctness conditions fail.
