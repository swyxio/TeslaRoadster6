# Delivery destinations

Research and placement for the Bay playtest, 2026-10-18 Pacific. Real restaurant identities and menu examples come from the operators' public sites or their own ordering pages. Addresses describe the real business; all game positions are compressed fiction. Some Mill Valley postal addresses are in nearby unincorporated communities, and the game groups them under Mill Valley. Fictional customers are not real addresses. SFO terminal businesses use fictional roadside handoffs: cars do not enter airport terminals.

## Catalog contract

New pickups have a stable `id`, `name`, `cityId`, `areaId`, `cuisine`, `cuisineIcon`, `signatureDish`, public `address`, `sourceUrl`, optional `menuUrl`, and game-space `x`/`z`. `cityId` distinguishes all 17 requested towns; the game groups SFO with South San Francisco while giving it a separate `areaId` for service-area scheduling. Customers have stable `id`, `name`, `cityId`, `areaId`, `x`/`y`/`z`, and `rooftop`. Existing pickup and customer IDs and numeric ordering are a persisted contract: append new places after the entire old prefix, including landmark and rooftop entries. Rooftop customers must use an actual shared supported roof and require a flight-capable car.

`cuisineIcon` is a small presentation hint, separate from the descriptive `cuisine`. Its complete values are `pizza`, `burger`, `sandwich`, `noodles`, `taco`, `bakery`, `bowl`, and `plate`. These are original food pictograms, not restaurant branding. Do not send the static catalog in every room snapshot or scan every place on every physics tick; the progression owner supplies a static spatial stop index.

The catalog is integrated with geographic scheduling. Do not offer a destination merely because it is near a lane: a directed route can be rejected for an unsafe turnaround or a very long detour. The island and Dome are protected playgrounds, not delivery cities.

## Catalog coverage

The catalog has 171 pickups, 174 fictional customers and six additional historical landmark arrivals. Counts include the existing six pickups, seven ground customers and three supported rooftop customers; the six landmark arrivals are shown separately. Every town has ten fictional ground customers; San Francisco has two additional rooftops and Oakland has one. The route fixture exercises every ordered pair of new stops within each area from one sampled road-aligned heading at the area's intended unlock level. It does not cover every vehicle, heading, traffic state, or route to unchanged historic stops.

| Town or subarea | Pickups | Fictional customers | Additional landmark arrivals |
| --- | ---: | ---: | ---: |
| San Francisco | 10 | 12 | 1 |
| Oakland | 10 | 11 | 0 |
| Berkeley | 10 | 10 | 1 |
| Emeryville | 10 | 10 | 0 |
| Mill Valley | 10 | 10 | 0 |
| Corte Madera | 10 | 10 | 0 |
| South San Francisco | 10 | 10 | 0 |
| SFO subarea | 1 | 1 | 1 |
| San Mateo | 10 | 10 | 0 |
| Redwood City | 10 | 10 | 0 |
| Menlo Park | 10 | 10 | 0 |
| Palo Alto | 10 | 10 | 1 |
| Mountain View | 10 | 10 | 0 |
| Santa Clara | 10 | 10 | 0 |
| Cupertino | 10 | 10 | 0 |
| San Jose | 10 | 10 | 1 |
| Hayward | 10 | 10 | 0 |
| Fremont | 10 | 10 | 1 |

The six historic landmark arrivals are UCSF, Berkeley, SFO, Stanford, San Jose City Hall and Mission San Jose. The Marin, SFO and southern catalogs use their accompanying authoritative streets. The airport pickup is a fictional roadside handoff for the real terminal business; it does not imply cars enter the terminal. See [VERIFICATION.md](VERIFICATION.md) for the checks performed on this candidate.
