# Playtest rooms

Use **Room settings → Playtest** to start a fresh practice driver or enter the
sandbox. Your saved driver and recovery code remain available; **Return to saved
driver** rejoins Bay with that identity. Changing an ordinary room code still
keeps your saved progress.

| Room code | Starting state | Persistence |
| --- | --- | --- |
| `practice` or `practice-*` | $2,500, level 0 area access, level 1 tank, normal flight and earning rules | Discarded on leaving; rejoining starts fresh |
| `sandbox` or `sandbox-*` | Every area and vehicle, level 5 tank and all six vehicle upgrades, unlimited spending, remote customization | Discarded on leaving |
| Any other valid code | Normal saved-driver game | Existing saved wallet, ownership and awards |

Both modes remain multiplayer. Share the exact room code to test together.
The fresh-driver button generates a new `practice-*` room. Sandbox grants apply
to every newly selected or stolen car; air and condition still deplete normally,
so maximum power is not invulnerability or infinite flight. Use repair/refill as
needed. The map's **Teleport here** button finds collision-free ground or a
bridge deck within 20 game metres of the pin; it rejects water, occupied spots
and out-of-bounds locations. Rooftop placement is not provided.

Sandbox unlocks drivable content and customization. Persistent trading,
properties, passive Cybercab businesses, saved awards and Mars contributions
remain in the normal game. Practice awards are temporary. The HUD labels both
modes **UNSAVED**; the sandbox cash display is **∞**.

## Authority and isolation

`shared/playtest.ts` recognizes the reserved names; GameRoom chooses its mode
from the server-routed URL, never from a client-provided flag. An ephemeral
session has `economy: null`. It never acquires or binds DriverProfile, opens a
RoomEconomy journal, refreshes global earnings, dispatches a paid fleet, or
contributes to Mars/market state. Ordinary shared simulation runs locally inside
the authoritative Durable Object. Its temporary awards and cash cannot transfer
into a normal room.

The client keeps its remembered recovery code but sends `identity: null` in
playtest rooms. The server also rejects non-null bindings. A playtest reply never
confirms or overwrites saved identity storage. Returning to a normal room uses
the original code again.

JSON uses a finite sandbox spending balance of one trillion dollars, restored
after simulation and shop actions. This is not eligible income and never enters
a persistent ledger. Cash/level and remote-shop access refresh once per player
per tick. There is no catalog scan in that path and no change to traffic, room
capacity, physics cadence, LOD or pixel ratio.

`teleport` carries the ordinary `actionSeq`/`edgeBaseline` fence and a request ID.
Only sandbox rooms accept it. Successful relocation clears velocities, route,
mini-game/ferry participation and flight evidence, increments `poseRevision`,
and invalidates queued controls. The client waits for authority rather than
moving locally. A rejected teleport does not relocate the player. Normal rooms
continue to reject free vehicle selection outside the Tesla fleet.

## Verification

- `pnpm exec tsx --test tests/playtest.test.ts tests/session.test.ts`
- `pnpm exec tsx tests/playtest-room.integration.ts`: isolated real Wrangler
  room with persistent service access deliberately forbidden, two-peer
  replication, max fleet, paint, relocation fences, fresh practice and no
  application KV/SQL journals.
- `pnpm exec tsx tests/room.integration.ts http://127.0.0.1:8787`: normal rooms,
  including rejection of sandbox teleport.
- Desktop and portrait/landscape emulation: menu entry/return, Fleet selection,
  map pin/teleport, clear unsaved/cash labels and usable touch controls.

Browser emulation does not establish physical-device performance.
