# Delivery destinations

Research and placement for the Bay playtest, 2026-10-18 Pacific. Real restaurant identities and menu examples come from the operators' public sites or their own ordering pages. Addresses describe the real business; all game positions are compressed fiction. Some Mill Valley postal addresses are in nearby unincorporated communities, and the game groups them under Mill Valley. Fictional customers are not real addresses. If SFO terminal businesses are added, use fictional roadside handoffs: cars do not enter airport terminals.

## Catalog contract

New pickups have a stable `id`, `name`, `cityId`, `areaId`, `cuisine`, `cuisineIcon`, `signatureDish`, public `address`, `sourceUrl`, optional `menuUrl`, and game-space `x`/`z`. `cityId` distinguishes all 17 requested towns; SFO belongs to South San Francisco but has its own `areaId` for service-area scheduling. Customers have stable `id`, `name`, `cityId`, `areaId`, `x`/`y`/`z`, and `rooftop`. Existing pickup and customer IDs and numeric ordering are a persisted contract: append new places after the entire old prefix, including landmark and rooftop entries. Rooftop customers must use an actual shared supported roof and require a flight-capable car.

`cuisineIcon` is a small presentation hint, separate from the descriptive `cuisine`. Its complete values are `pizza`, `burger`, `sandwich`, `noodles`, `taco`, `bakery`, `bowl`, and `plate`. These are original food pictograms, not restaurant branding. Do not send the static catalog in every room snapshot or scan every place on every physics tick; the progression owner supplies a static spatial stop index.

The new catalog is a staging layer until the progression owner integrates it with geographic scheduling and validates routes. Do not offer a destination merely because it is near a lane: a directed route can be rejected for an unsafe turnaround or a very long detour. The island and Dome are protected playgrounds, not delivery cities.

## Coverage of the current staged catalog

Counts include the existing six pickups, seven ground customers, six landmark customers, and three supported rooftop customers. These figures count authored data, not jobs already enabled by the scheduler. For each city with new coordinates, the planner has accepted every ordered pair of new stops from one sampled road-aligned heading at each origin. This does not test every vehicle, heading, traffic state, or route to the unchanged historic stops; driving and visual checks remain. The remaining records below are the unchanged historical prefix until their road access is resolved.

| Town | Pickups | Dropoffs |
| --- | ---: | ---: |
| San Francisco | 10 | 10 |
| Oakland | 10 | 10 |
| Berkeley | 10 | 10 |
| Emeryville | 10 | 10 |
| Mill Valley | 10 | 10 |
| Corte Madera | 10 | 10 |
| South San Francisco, including SFO | 0 | 1 |
| San Mateo | 0 | 0 |
| Redwood City | 0 | 0 |
| Menlo Park | 0 | 0 |
| Palo Alto | 0 | 1 |
| Mountain View | 0 | 0 |
| Santa Clara | 0 | 0 |
| Cupertino | 0 | 0 |
| San Jose | 0 | 1 |
| Hayward | 0 | 0 |
| Fremont | 0 | 1 |

The San Francisco and Berkeley totals each include one real-named landmark dropoff; each currently has nine fictional customer dropoffs. Oakland, Emeryville, Mill Valley and Corte Madera each have ten fictional customer dropoffs.

The Marin catalog requires the accompanying authoritative streets and has not yet been enabled or visually playtested. The existing SFO, Stanford, Fremont and San Jose dropoffs are their historical landmark entries. Farther south, lane proximity alone did not establish a useful local route: the directed highway circuit often requires a long detour or a rejected turnaround. Additional physically drivable local connections and checks are needed before those records can safely be scheduled.
