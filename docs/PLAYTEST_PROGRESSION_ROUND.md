# Delivery, exploration and achievement round

Design and ownership agreed from the 2026-10-18 playtest. This is an implementation
contract, not a claim that the features below have shipped. Baseline: PR #57,
followed by PR #76 self-driving recovery and PR #75 economy rebalance. Verify the
current main revision before integrating each layer.

## Player outcome

The player should know what to do next, find useful work where they are, and see
their repeated feats accumulate. New districts should add a manageable piece of
the Bay. Charging stops and food destinations should read as places and objects
in the world rather than floating text panels.

Preserve the user's current-cash progression rule: spending can lower level and
area access. Confirmed achievements and owned items remain saved. Do not replace
that rule with lifetime XP or permanent region access as an incidental redesign.
Do not confiscate existing awards or repay old milestones when adding counters.

## Ownership and release dependencies

| Existing chat | Owned scope | Shared-file boundary |
| --- | --- | --- |
| Plan the player economy | PR #75 prices, fare/award budget, paid items, wallet policy | Supplies current tuning to the other owners; no duplicated payout tables |
| Build Tesland economy progression | Geographic service areas, level gates, delivery selection and stop indexing | Owns `shared/delivery.ts`, area catalog, access overlays and associated tests |
| Build Tesland Cybercab fleet and market | Repeatable achievement events, counters, tier evaluation and durable commit | Owns achievement modules and narrowly coordinated worker/profile changes |
| Plan Bay Area map and traffic | Restaurant/customer catalog, station placement and physical charger signs | Owns location data, `shared/stations.ts`, `src/station-art.ts`, provenance and placement checks |
| Improve driving and chat UX | Goal HUD, awards tiles, bag/dropoff art, charger shortcut and route action | Owns client presentation/input; charger server wiring follows region/station and counter integration |

PR #76 merged before PR #75; PR #75 incorporates it and is the next gameplay
release. Independent implementation and ordinary checks continue in parallel.
Land location/area contracts before their consumers, and serialize worker/schema
edits and production deployments. Each wire-changing layer bumps the actual
current protocol, with matching contracts and live room tests. Do not reserve
protocol numbers on multiple branches. Fold this document into the next relevant
feature release; it does not need a separate documentation-only deployment.

## Geographic progression and assignments

Use a shared catalog with stable town/service-area IDs, display names and unlock
levels. Area boundaries and crossing gates must agree with authoritative road,
flight and map checks. The intended outward sequence is:

1. San Francisco and existing free Marin, Dome and island activities.
2. Oakland, Berkeley and Emeryville.
3. South San Francisco and SFO.
4. San Mateo and Redwood City.
5. Menlo Park and Palo Alto.
6. Mountain View, Santa Clara and the farther East Bay/Fremont corridor.
7. San Jose and Cupertino.

The progression owner resolves exact boundaries and level mapping against the
actual road graph and PR #75's cash thresholds. Hayward and the Fremont approach
must be usable in sequence; an unlocked destination behind a locked route is not
usable content. SFO is a service subarea, not an extra municipality. Validate the
route to the Fremont endgame with its new area requirement and update its copy.

Keep an active order when a new area opens. Within the next two eligible newly
assigned orders, introduce the newly available area through a reachable route.
Then mix short local jobs with occasional adjacent-area jobs. Continue working
near the last dropoff instead of repeatedly sending the player back to SF.
Avoid consecutive identical venues and arbitrary cross-map pickup journeys.
Make scheduling deterministic and test its distribution over many orders.

Ground jobs need connected, clear stopping points; rooftop jobs need a capable
vehicle and a real shared supported roof. A missing safe candidate must produce
a deliberate supported alternative or an explained unavailable state, never an
empty modulo selection or silent endless return to SF. Relocking an area may
reroute a job under existing rules, preserving collected stage and preventing a
second pickup payment.

## Location coverage and food identity

Target ten researched restaurant pickups and ten distinct fictional customer
dropoffs per existing named city, with an explicit coverage table:

San Francisco, Oakland, Berkeley, Emeryville, Mill Valley, Corte Madera,
South San Francisco, San Mateo, Redwood City, Menlo Park, Palo Alto,
Mountain View, Santa Clara, Cupertino, San Jose, Hayward and Fremont.

That target is 170 pickups and 170 dropoffs. It is not a license to fabricate
businesses or place ten overlapping points in a tiny footprint. Report any
physical coverage gap and resolve the shared arrival geometry. Keep towns
distinct in the data even when they share an unlock stage.

Restaurant records carry stable ID, name, city ID, cuisine category, signature
dish, public business address, primary-source URL and compressed game position.
Research venue identity and food from official sites; do not bundle restaurant
logos or copied menu artwork. Customer addresses are fictional. Positions are
artistic game coordinates, not real navigation data. Rooftop positions derive
from shared geometry, including height/support, with a clear landing area.

Extract location data into a module agreed by the data and progression owners;
avoid circular dependencies through generated buildings. Existing orders use
numeric catalog indices and durable stages can outlive a deployment. Preserve
their interpretation, or provide a narrowly tested conversion before changing
that contract. Never silently point an old staged order at a different venue.

Create a static spatial lookup for stop matching. Adding hundreds of places must
not turn `deliveryStopSignature` into a full catalog scan for every driver on
every physics step. Prove matching equivalence at cell edges and stacked roofs.
Static location metadata is not repeated in room snapshots.

## Achievement families and persistence

Repeatable families use a common 1, 10, 100, 1,000 and 10,000 ladder where their
events support it: deliveries, pickups/early service, roof landings, rooftop
deliveries, bridge-free Bay crossings, parking/queue finishes, race finishes and
contested wins, and qualifying Dome matches/wins. Retain existing earned delivery
milestones rather than issuing duplicate rewards for a renamed tier.

Discoveries, purchases, finite collections and boarding Mars retain meaningful
one-off or finite collection goals. Repeatedly entering a discovery ring is not
new achievement progress. Do not add a counter for an event the server cannot
actually establish.

Counters are bounded fixed-key server-owned data. A landing counts once after
meaningful flight and a genuine airborne-to-supported transition. Remaining on a
roof, surface chatter, reset, teleport, takeover and reconnect do not count.
Crossings require qualifying opposite endpoints and no intervening bridge/island
landing. Race, parking and Dome results count once per terminal event, not once
per tick while a results panel remains visible.

Count, newly claimed tier and cash share the existing durable wallet receipt.
Only accepted authoritative observations can advance them. Test held/rejected
writes, duplicate replay, reconnect, identity switches and room restart. An old
profile may recover a known delivery total or the minimum evidenced occurrence
from an earned badge; unknown historical counts remain unknown rather than
invented. Do not issue retroactive payouts for old already-paid achievements.

The achievement owner publishes `selectAchievementTiers` and its actual typed
inputs/outputs before UI integration. It supplies confirmed count, next target,
earned tier, reward and unavailable/save state. New private progress should stay
owner-only where possible, not expand every other player's replicated state.

Tier rewards must fit PR #75's rebalance and avoid stacked opening windfalls.
The current tuning reference is a $500 first-delivery award and $350 three-run
checkpoint; import final source values. A five-minute earnings model is evidence
about one scenario, not an income cap or promised player experience.

## HUD, awards and world cues

Keep the current pickup/dropoff and timer readable. Replace the persistent pair
of delivery-self-drive and Mars buttons with a compact contextual route action
and one clearly described next reachable achievement. Filter by area access,
vehicle capability and actual progress. Keep that recommendation stable until
completion or a meaningful context change. Opening it shows the related award or
destination. Mars remains in Actions and may become contextual when relevant.
Citation/emergency feedback keeps priority; do not hide it behind a goal card.

Awards use responsive grouped tiles for Delivery, Flight, Exploration, Games and
Collection. Each repeatable family shows rank, count/next threshold, progress,
reward and save status; expand a family to inspect its full ladder. Unique goals
show their requirements and earned/locked state. Preserve close/Escape/focus and
portrait/landscape access. Do not rebuild a closed awards panel every frame.

The active pickup is an original floating food bag with a clear cuisine pictogram
and subtle motion. Ground and rooftop dropoffs have distinct doorstep/landing
cues. Show only the relevant nearby objective, not hundreds of permanent bag
meshes. Use cached geometry/materials and a small shared icon atlas; no per-frame
canvas text rendering. Ground collision and roof support remain authoritative.

## Charging stops and shortcut

Replace the station's camera-facing sprite sign with a physical roadside pylon:
posts/base, legible SUPERCHARGER and AIR panels and front/back faces. Fictional
sites retain their fictional label. Preserve the existing mint refill markings.
Put signs outside drivable/refill footprints; decorative posts must not imply
new invisible collision. Batch repeated geometry and cull by station.

Separate Oakland's Hegenberger and 2nd Street game placements along usable East
Bay roads. Retain their actual business identities and source URLs; game
placements remain explicitly compressed. Update shared station position so lot,
parking games, refill, map and autonomous arrival all agree. Audit other close
pairs rather than moving only a visual mesh.

Triple Shift requests the nearest reachable unlocked charging station by route
cost; a touch/menu action exposes the same operation. A triple sequence must not
also submit a delivery route. Gesture arbitration may delay a shortcut, never
ordinary boost/control input. Blur, dialogs, focus changes and key rebinding
clear the pending gesture.

The authoritative `chargerDestination` action reuses request IDs, action fencing,
edge baselines, manual takeover and control revisions. Plan to a real refill bay,
stop there, and confirm refill; snapping to a road 100 m away is not success.
Blocked or unavailable routes produce clear feedback without teleporting the car.

## Verification and performance limits

Each owner runs focused tests, the full unit suite and build, and live Wrangler
integration for wire/gameplay changes. Update dated verification without turning
local or simulated results into production claims. Final combined checks cover:

- unlock/relock boundaries on road, in flight and on the map;
- a chain of local jobs in each new area plus the first exploration assignment;
- distinct valid stop placement and cuisine coverage;
- repeated stunt/game events and recovery without duplicate counts or rewards;
- charger gesture arbitration, route arrival, actual refill and manual cancel;
- next-goal/awards/pickup/sign visibility at desktop, portrait and landscape;
- comparable JS bytes, owner snapshot growth and affected hot-path work.

Keep 20 Hz tick semantics, continuous prediction, reduced ambient traffic,
vehicle LOD, DPR 1 and provisional eight-player rooms. Do not add a broad engine
rewrite. Serialize timed browser/load measurements to avoid host contention;
ordinary tests need no global reservation. Device claims require real devices.
Do not take native desktop focus or interrupt a known user gameplay recording
with deployment. Release narrowly when ready; a regression blocks its owning
change, not all independent feature work.
