# Rocket pickups and fictional workshops

**Implementation · 2026-10-18.** Saved-driver upgrades, finishes and remote access are backed by the wallet. See [verification](VERIFICATION.md) for dated checks.

Research detours award cash once per saved driver. Stop at the blue rings at UCSF to earn a Homes Lab badge, Berkeley for 20% off efficient nozzles, Stanford for 20% off sport motors, and SFO for 20% off air tanks. The candidate profile records the award IDs that provide workshop discounts; the shop shows and charges the discounted price, and vehicle and shop prerequisites remain unchanged. See [the achievement contract](CONTRACTS.md#citations-rooftops-and-achievements).

The 26 ambient vehicles and six Vault models can use fictional Rocket capability. Collect a purple `rocket` pickup in the city, on the island or at a parking playground for a free session-long kit and a full air tank, or purchase a kit for a personal vehicle at a purple workshop. The next-generation Roadster starts with its own fictional thrusters. A retrofit adds visible hardware to the car and uses the same jump, hover, boost and flip controls. Repair and air pickups stay green and amber. Rocket pickups use a 20-second simulation cooldown; the candidate room economy reserves and cools down repair/air pickups in durable storage for 20 seconds.

The workshops are fictional SpaceX-branded game locations, not real facilities or an affiliation. The compressed map and sites are artistic placements. SF Mission and Richmond, Oakland Port, San Mateo, Palo Alto, Mountain View, San Jose, Fremont and East Bay each have a shop beside a street or highway. Purple diamonds mark them on the minimap. The location choices evoke industrial and roadside service areas; for example, the [City of Oakland describes the port's Gateway Industrial District](https://www.oaklandca.gov/Planning-Building/General-Plan-Neighborhood-Plans/Neighborhood-and-Citywide-Plans/Gateway-Industrial-District-Oakland-Army-Base). Do not use these positions as real-world navigation or facility data. Workshop gantries are decorative; the shared purple ground ring is the interaction area.

Stop the current vehicle in a ring and press **B**, use **Actions → Shop**, or tap the shop prompt. The room validates location, vehicle, motion, balance and upgrade, then waits for the wallet result before publishing a paid change.

The shop can also be opened from Actions anywhere to subscribe to the SpaceX / Tesla OTA service. The opt-in costs $100 in game cash per game hour (120 real seconds); upgrades are charged separately. The first period is charged on enrollment if funds are available. If a renewal cannot be paid, access pauses without debt and automatically resumes with a fresh paid period when the player has $100. Canceling ends remote access immediately and stops future charges. Existing subscribers keep their already-paid time and must subscribe again to accept the new rate. Physical shops still work without a subscription. The profile stores subscription state and remaining paid time. The remote-access pattern draws on [GTA Online's optional remote business access](https://support.rockstargames.com/articles/4WMldgJrkL3aVrIJNZN1E3/gta-benefits-for-accounts-with-multiple-grand-theft-auto-online-characters) and its [mechanic service pausing after an unpaid fee](https://support.rockstargames.com/articles/6TVXdrdzZPNztlOSGWu1Y1/issues-accessing-the-mechanic-in-gta-online).

| Item | Cash | Effect |
|---|---:|---|
| Rocket kit | $2,500 | Flight controls and a full air tank; a free pickup grants a session-only kit |
| Efficient nozzles | $2,000 | 25% less air for flight; requires rockets |
| Air tank levels 2–5 | $1,500 / $3,000 / $6,000 / $12,000 | Each doubles capacity and refills; requires rockets |
| Sport motor | $2,000 | 25% more acceleration and 10% higher road top speed |
| Impact armor | $1,500 | Half collision and hard-landing damage |
| Ludicrous Leap | $6,000 | Self-driving can hop a stopped car; requires rockets |
| Maximum Plaid | $12,000 | Self-driving can fly and use useful air currents; requires rockets and Ludicrous Leap |
| Repair & refill | $200 | Restore condition and refill air; available when needed |

Every vehicle starts with a Level 1 tank of 50 fictional air units; Levels 2–5 hold 100, 200, 400 and 800 units. Each upgrade doubles capacity and refills the tank. Air is shown as a percentage of the installed tank. For the Roadster, a jump costs 12 units and stationary hover uses 18 units per second; efficient nozzles reduce consumption by 25%. Heavier vehicles have a bounded fictional flight load and use more air in flight. A vehicle cannot buy a one-time upgrade twice, and the Rocket Roadster cannot buy a redundant kit. The candidate wallet stores paid upgrades, tank level, paint and decals by personal vehicle model; restoring a saved driver can restore that configuration. Free pickup kits, vehicle position, damage and air remain room state. The current room transaction adapter requires a personal vehicle for workshop purchases; taken NPC cars remain drivable. Cash purchases can lower the player's level and affect the room leaderboard. Persistence and the interaction with borrowed cars remain under review.

## Paint and decals

The workshop shows all finishes, their price and required cash level. The level is checked before payment; applying a finish can lower the balance and level. An applied finish remains on the saved vehicle after a level drop. Applying another paid finish, including one used before, charges again; restoring original paint or removing a decal is free. Cybercab paint uses the same prices and gates. Finishes apply to the selected vehicle or cab.

| Cash level | Paint | Decals |
| ---: | --- | --- |
| 0 | Ember red $750; Electric mint $1,000; Violet night $1,750 | Speed stripe $450; Checkerboard $900 |
| 1 | Sunset orange $3,000; Bay blue $4,500 | Twin stripes $2,500 |
| 2 | Glacier pearl $7,000; Midnight blue $12,000 | Chevron $6,000 |
| 3 | Golden hour $30,000 | Circuit $15,000 |
| 4 | Copper canyon $50,000 | Lightning $30,000 |
| 5 | Aurora green $100,000 | Constellation $75,000 |
| 6 | Obsidian $200,000 | Crown $150,000 |
| 7 | Rose quartz $300,000 | Wings $300,000 |
| 8 | Platinum $500,000 | Solar flare $500,000 |

After purchasing a Vault vehicle, its owner can request collection at the Vault or a physical workshop. An OTA subscription alone cannot collect it remotely. A starter home and player-to-player resale are available; garages and home improvements remain plans. See [LUXURY_SHOWROOM.md](LUXURY_SHOWROOM.md).

The interaction draws on familiar in-world vehicle customization such as [GTA Online's vehicle shops](https://www.rockstargames.com/gta-online/special-interests/vehicles-enthusiast) and collectible driving boosts in [Rocket League](https://www.rocketleague.com/news/rocket-league-patch-notes-v2-53?lang=en). All mechanics, names, visuals and fictional flight are original game interpretations; no third-party game assets are included. See [CONTRACTS.md](CONTRACTS.md) for the protocol and simulation ownership.

Permanently equipped cars only consume a Rocket pad when their air is below full; it refills their tank. Full cars leave it available for others. Green repair and amber air diamonds restore their resource and award $5 cash and eligible lifetime income. They do not count as delivery-only earnings; cash itself determines the player's level.
