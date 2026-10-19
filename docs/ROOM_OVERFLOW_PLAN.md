# Public room overflow plan

2026-10-18 Pacific. Automatic public placement is implemented: the game tries
`bay`, then public overflow rooms 1–16, for at most 20 seconds. Explicit room
and overflow invites remain exact. The server rejects excess connections with
code 4003, including after asynchronous initialization.

## Placement

- Only an automatic public entry without an explicit room link or room choice
  tries overflow. Try the existing Bay room first, then a bounded sequence of
  public overflow rooms when admission returns 4003 before welcome. Trying the
  earlier rooms first fills vacancies without moving existing players.
- Give public overflow rooms a distinct server-side identity and URL format;
  do not reuse ordinary named-room slugs, which players can already create.
  Keep their room economy and property semantics distinct as well. This needs
  an explicit route and invite representation, not a guess based on a prefix.
- When a player joins, show the actual room and make the address and Invite
  link identify that exact room. Reconnect and reload target it directly. An
  explicit invite, manually entered room, or property visit stays exact: if
  full, explain this and offer retry or an intentional room change. Never move
  a party member to another room silently.
- Retain the selected vehicle, name and identity while trying candidates. Show
  joining progress and permit cancellation. Limit both candidates and total
  elapsed time, then show an actionable failure rather than retrying forever.
  Only a full-room response triggers another candidate; a network, protocol,
  identity or spawn failure keeps its own error. Ignore late socket callbacks
  from cancelled or superseded attempts.
- The room's existing admission check decides concurrent last-seat races.
  A preflight occupancy count is not a reservation. Do not migrate players
  already in a room. Revisit sequential retries if measured wait times or
  load warrant a coordinated placement service.

## Verification and follow-ups

Verify concurrent last-seat joins, full and available shards, bounded failure,
backfilling, cancellation and stale callbacks. Verify that explicit Bay,
named-room and property links remain exact; malformed links do not auto-route;
invites and reloads return to the actual overflow room; non-full failures do
not reroute. Exercise desktop and mobile portrait and landscape controls.
Measure join latency and room performance at intended occupancy; separate
synthetic, preview and physical-device evidence. Add operational visibility
for full-room and placement failures without treating missing data as zero.
