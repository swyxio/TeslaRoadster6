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
