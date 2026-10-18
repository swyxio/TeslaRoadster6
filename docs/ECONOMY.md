# Economy and property design

**Planning proposal, 2026-10-18.** Values below are fictional game money and untested design assumptions, not current game prices or a promise of future implementation. This document records the economy discussion in one place; it does not change the playable game or its contracts.

At the reference checkout, [delivery](DELIVERY.md) money, regional unlocks and achievements are session-only. Current regions require both completed deliveries and session lifetime delivery earnings; spending does not relock them. There is no XP, persistent wallet, persistent property or owned income-producing Cybercab. Saved chat identity does not restore game progress. The world has the fictional China Basin Rocket Dome, Rocket Island and a ferry, plus Yerba Buena Island; Treasure Island is not currently a separate playable island. See [README](../README.md), [MAP](MAP.md), and the shared simulation for actual behavior. This proposal deliberately changes progression and requires a separate persistence and multiplayer design.

## Goals

- Drive, explore and play with friends immediately; money and ownership add goals, not a mandatory tutorial or a paywall around the basic fleet.
- Make money useful: deliveries, achievements and Cybercabs fund cosmetics, property, building and upgrades. Homes are expensive, with a first city-supplied home or plot-plus-build costing $1 million before awards.
- Make achievements guide players into cities, landmarks, the Dome and property. Give one-off cash, not XP.
- Let purchases reduce the player's current level. Keep owned items and permanent achievement progress after a level drop.
- Make land speculation and resale possible while protecting every player's access to a starter home and buildable starter plot.

## Wallet and levels

Use the **current spendable wallet** for levels; no XP or career-earnings gate. Every deposit, including a sale or gift, increases the balance; purchases, fines and transfers reduce it. A loan can temporarily raise a level, and paying it back can lower it. Purchases require sufficient cash; the current game can produce a negative wallet from a ticket, which would remain level 0.

| Balance | Level and proposed access |
| ---: | --- |
| $0 or less | 0: San Francisco, Marin and Rocket Dome; starter jobs |
| $10,000 | 1: Oakland and Berkeley |
| $50,000 | 2: Peninsula and East Bay, including Fremont and SFO |
| $250,000 | 3: San Jose and the home/plot market |
| $1,250,000 | 4: luxury purchase tiers |
| $6,250,000 | 5: estate purchase tiers |

Thresholds are inclusive. Current city gates unlock regional groups, not separate cities; each named city in a group gets its own first-unlock badge and $2,500 award once per account. For the model, San Francisco pays $2,500 at the start, Oakland and Berkeley together pay $5,000, San Mateo/Palo Alto/Mountain View/Fremont together pay $10,000, and San Jose pays $2,500. Awards are credited to the wallet and can cause another threshold to be crossed, but crossing the same threshold again never pays again. Marin is a region, not a city. Assign explicit destination-city IDs before offering per-city delivery milestones.

Recalculate levels after each payment, purchase, fine, transfer and one-off award. Relocked areas block **new entry** after the player leaves; do not abruptly eject a player already there. Let an accepted delivery finish, and make home teleport work even if the home's city has relocked. That is an intentional way to reach one's own home despite a lower level. A $1 million purchase with exactly $1 million leaves $0; the first-home award below then raises the wallet to $10,000 and level 1, assuming earlier city-unlock awards were already claimed. The home and its contents remain owned.

## Cash sources and awards

As an initial tuning experiment, multiply current delivery pay and existing shop, tank, service, OTA and fine values by 50. This preserves their approximate relative scale; the $1 million first home is a separate, deliberately expensive new goal. The current $43 example fare would become $2,150. The actual fare depends on distance, timing and pickup bonuses; later routes can be much longer and pay more. Measure the actual mix before choosing a multiplier or shipping prices.

One-off achievement tiers, payable once each per player and additive when the same action satisfies several achievements:

| Chain | Triggers for levels 1–5 | Award per level |
| --- | --- | --- |
| Total deliveries | 1 / 10 / 50 / 100 / 250 | $2,500 / $10,000 / $40,000 / $80,000 / $200,000 |
| Deliveries **in each city** | 1 / 10 / 25 / 50 / 100 | $2,000 / $8,000 / $20,000 / $40,000 / $80,000 |
| **Each landmark** | Discover / 1 / 3 / 5 / 10 deliveries there | $2,500 / $5,000 / $10,000 / $20,000 / $40,000 |
| Rocket Dome wins | 1 / 3 / 10 / 25 / 50 | $5,000 / $15,000 / $35,000 / $75,000 / $150,000 |
| Cybercabs owned | 1 / 2 / 3 / 4 / 5 | $5,000 / $10,000 / $20,000 / $40,000 / $80,000 |
| Distinct plots acquired | 1 / 2 / 3 / 5 / 10 | $5,000 / $10,000 / $20,000 / $40,000 / $80,000 |
| Homes constructed | 1 / 2 / 3 / 5 / 10 | $5,000 / $10,000 / $20,000 / $40,000 / $80,000 |

The first home, bought or constructed, pays an additional $10,000 once. Count unique plot/build events per player, so selling and reacquiring the same plot does not repeat an award. Add small first-use bonuses for decoration, a home charger, home teleport and a launch pad; amounts remain to be tuned. The existing Awards UI should show the next goal, its reward and a map pin. Allow choosing a destination city when jobs exist there; the current generator does not offer that choice.

Landmarks should include SFO, the China Basin Dome, Bay Bridge/Yerba Buena, Golden Gate, Ferry Building, Transamerica Pyramid, Oakland Tribune Tower, Berkeley Campanile, Stanford Hoover Tower, Mission San José and San Jose City Hall. Salesforce and Coit require **landing on the tower**, not merely approaching it. Their visible caps and collision surfaces need a visibly landable target and playtest. Treasure Island needs to be added before it can have an award. Landmark-specific deliveries and city IDs do not yet exist for all these places. Monetary Dome awards remain a proposal; the current session achievements already use authoritative player goal attribution.

### Smoothing the 250-delivery cliff

The original $200,000 award at delivery 250 creates a large step in the model below. A cab or a 30-minute event can earn meaningful cash without advancing the first-home time. A candidate revision keeps the same $332,500 total through 250 deliveries and keeps five ranked achievement levels: give two **unranked progress bonuses** of $50,000 at 150 and 200 deliveries, and $100,000 for the fifth rank at 250. The fifth rank still pays more than the $80,000 fourth rank. This is a recommendation to playtest, not a locked price decision.

## Cybercabs and events

Proposed ordinal Cybercab prices: $25,000 / $50,000 / $100,000 / $200,000 / $400,000. Each active, dispatched cab earns $15,000 per real active hour before any multiplier; paid amounts arrive in the wallet as they accrue. The model assumes continuous active operation with no operating cost. Offline income and prices beyond the fifth cab remain undecided. Owned cabs are persistent, visible in the world, locatable on the map and branded with the owner's name; a human driver and owner should be distinguishable when different.

Before bonuses, payback is 1h40 / 3h20 / 6h40 / 13h20 / 26h40 respectively. After each one-off ownership award it is 1h20 / 2h40 / 5h20 / 10h40 / 21h20, assuming full utilization and no costs. Five cost $775,000 gross, or $620,000 after those awards, and produce $75,000 per active hour: 8h16 combined payback. These are straight-line calculations, not measured game performance.

Proposed event rules:

- A developer-controlled global event grants **2×** for 30 minutes. A Rocket Dome match win grants **1.5×** to everyone in that room for 10 minutes; another win refreshes the room timer. The winner can additionally receive the first-win achievement once.
- Multipliers combine multiplicatively, capped at **3×**. Apply them to pickup/delivery earnings and active Cybercab income. Achievement awards, gifts, refunds and resale proceeds are not multiplied.
- Use the rate when each pickup or delivery pays; credit cab income proportionally to the time it actually operated at each rate. Show the multiplier, scope and remaining time. In particular, no retroactive multiplication of accumulated cab income.
- Repeated quick Dome wins might keep the room bonus running indefinitely. Measure win frequency and money creation before deciding whether to change its duration or add a cooldown.

For a $2,150 on-time example, the fare is $3,225 at 1.5×, $4,300 at 2× and $6,450 at 3×. [GTA Online has used temporary activity and passive-business bonuses](https://www.rockstargames.com/newswire/article/258158o2328145/redefine-breaking-and-entering-in-gta-online-s-new-mansion-raid); this proposal's numbers and triggering rules are our own.

## Property, land and construction

An account may own **at most one ready-built home it acquired by purchase** at a time. A completed home bought from another player uses that slot too. Selling it frees the slot. An account may also buy multiple empty plots and build homes on them, including its first home; these self-built homes do not consume the purchased-home slot. Each plot has at most one home. Select one owned home as the free teleport destination; a short cooldown is a tuning choice.

| Example city purchase | Empty plot | Build a suitable house | Total |
| --- | ---: | ---: | ---: |
| Starter | $400,000 | $600,000 | $1,000,000 |
| Neighborhood | $800,000 | $1,200,000 | $2,000,000 |
| View | $1,600,000 | $2,400,000 | $4,000,000 |
| Mansion | $3,200,000 | $4,800,000 | $8,000,000 |
| Estate | $6,400,000 | $9,600,000 | $16,000,000 |

These are example matched packages, not a requirement to buy only that pairing: any design that physically fits may be built on a plot. The first city-supplied ready-made home is also $1 million. For the first implementation, choose a preset exterior and pay for immediate construction; add material-delivery missions and deeper customization later. Include a two-car garage with each home. Decorations, chargers and launch pads are separate purchases.

### Scarcity and supply

1. **Guaranteed starter access:** offer every account one city-sold, instanced starter plot for $400,000, as well as access to a $1 million instanced ready-made starter home. A shared neighborhood entrance leads to individually persistent, visitable spaces; this avoids promising unique visible street lots for unlimited players. A player's one subsidized starter-plot purchase is once per account; additional plots can be bought on the market or from other city releases. The one purchased-home limit still applies. Authentication/account abuse needs its own design; this rule alone does not stop multiple accounts.
2. **Scarce scenic plots:** release a finite set of distinct, exclusive world parcels in places people want to visit. Each has a stable ID and one owner across rooms, is visible and visitable in the shared world, and can be built on or resold. The actual locations must be checked against the authoritative map, traffic, landmarks and collisions; do not block public streets or landmarks.
3. **Example initial inventory, not a promise that the map fits it:** 40 neighborhood plots at $800k, 30 view plots at $1.6m, 20 waterfront plots at $3.2m and 10 landmark-adjacent plots at $6.4m. If all 100 sell at these city prices, $208 million leaves player wallets. Do not sell the public landmark itself. More scenic lots require authored, collision-safe map space and may be released later; scarcity makes location and owner-built designs meaningful.
4. **Monitor affordability:** let N be accounts with at least one delivery in the past 30 days, A be vacant **physical** starter-equivalent plots actually listed for $600k or less, and D be distinct accounts requesting an affordable physical plot in the past seven days. Exclude guaranteed instanced plots from A. If A remains below the larger of 5 and 5% of N for seven days, and D reaches that same number, review releasing about 10% of N additional $400k physical plots, subject to safe map capacity. For N = 1,000, fewer than 50 such listings for a week and at least 50 recent requests trigger a review of roughly 100 additional plots. This is an operator tuning rule, not an automatic promise or a cap on resale prices. Guaranteed instanced starter access remains available regardless.

No mandatory rent, recurring property tax, foreclosure or automatic seizure is proposed. Physical supply must not grow by silently duplicating existing exclusive lots across rooms. [Final Fantasy XIV](https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/housing_land/) illustrates finite plots and controlled primary allocation; [Second Life](https://community.secondlife.com/knowledgebase/english/page/5/?d=3) documents resident land sales. Our starter guarantee and free resale policy are distinct design choices.

### Resale and money sinks

Owners may list vacant plots or completed properties at **any nonnegative price**; the buyer chooses whether to pay it. Use a fixed-price listing first. A sale transfers the plot and any included building; personal cars and portable possessions remain with the seller and return to account storage if needed. List explicitly what transfers. Reject a completed-home sale if the buyer's purchased-home slot is occupied. A listing may be canceled or repriced before sale. There is no guaranteed city buyback or resale value.

The buyer pays the listed price, the seller receives **95%**, and the remaining 5% leaves the economy. A player-to-player sale otherwise transfers existing cash rather than creating or destroying it. Primary city plot purchases and construction fees are sinks. Example: a player buys a city plot for $400k and builds for $600k, then sells it for $2m. The buyer pays $2m, the seller receives $1.9m, the fee removes $100k, and the seller's nominal profit is $900k before any other expenses or achievement awards. The initial $1m plus the resale fee removes $1.1m in total. A player is free to sell below $1m, so the $1m starting price is a **city-supply price**, not a resale floor.

Ownership transfer, buyer debit, seller credit and fee must commit together; one listing can complete once, even if two buyers click it or a client reconnects. This requires durable authenticated identity and a shared property registry, neither provided by session room names or chat recovery. Decide separately whether solo rewards share the multiplayer wallet; if so, earning must be verifiable rather than trusting an editable local wallet.

## Garages, cosmetics and home upgrades

Keep ordinary available passenger vehicles free to drive and select; do not introduce passenger-EV purchase prices until there is a compelling gameplay reason. A garage stores persistent personalized car configurations and can display and retrieve them. The proposed new BYD Dolphin/Seal, Rivian R1T/R1S, Lucid Air, civilian Hyundai IONIQ, Kia EV9, Silverado EV and F-150 Lightning remain a separate fleet-content proposal, not shipped by this document. The current fleet already includes a Waymo IONIQ 5 variant. Owned Cybercabs are separate income-producing assets; a dispatched cab need not occupy a garage space.

Two garage spaces are included per home; the next five spaces cost $50k / $100k / $200k / $400k / $800k. Cosmetic starting prices: paint $2k, decals and lettering $5k, wheels/trim $15k, wraps and fleet branding $50k, and premium lights/effects $150k. Account-owned cosmetics can be reapplied to compatible cars; earned special designs can celebrate achievements. Show driver names and Cybercab owner names. Prices and compatibility need playtesting.

Optional home chargers cost $25k / $50k / $100k; launch/thermal upgrades cost $50k / $100k / $200k. Home teleport is free after ownership. The effects and whether they change competitive balance remain to be designed.

## First-home napkin math

The following scenarios simulate the original, **unsmoothed** award ladder above. They are not measured playtimes:

- Start with $0, then credit the $2,500 SF unlock. Each delivery pays exactly $2,150 and takes 102 seconds: the game's current $43 example fare × 50, with an illustrative 40-second pickup plus 62-second drop-off. Every job is on time with no pickup bonus. The model assumes a selectable supply of SF and Oakland jobs, which the current game does not have.
- Credit all global, per-city and first-time city-unlock awards shown above. At sufficient balance, immediately buy a $400k plot and later a $600k house; first-plot / first-construction / first-home awards total $20k. No other landmark, decoration or property rewards. Home-market access requires level 3 before purchase; these prices exceed that threshold. A cab strategy buys the indicated number as soon as affordable, before the plot, and receives each ownership award once.
- Each active cab earns $15k/hour continuously, even while the player plays a Dome match or changes cities. Construction and purchases take no time, and cab income can fund a purchase between deliveries. No tickets, upgrades, repairs, charging, waiting, downtime or resale. Actual play will differ.
- The two-city route completes 100 SF deliveries, spends 5 minutes repositioning, then delivers in Oakland at the same assumed rate. For event scenarios, a 2× global event runs from minutes 30–60; a five-minute Dome match pauses driving from 35–40, then a win grants the $5k first-win award and a 1.5× room bonus from 40–50, stacking to 3×. These timings are chosen examples, not a guarantee the player wins or an event occurs.

| Strategy | Deliveries completed | Plot bought | Home built | Wallet afterward |
| --- | ---: | ---: | ---: | ---: |
| SF, deliveries only | 250 | 2h50 | 7h05 | $60,000 |
| SF, one Cybercab | 250 | 2h50 | 7h05 | $143,275 |
| SF, cab + global event | 250 | 2h34m42s | 7h05 | $189,475 |
| SF, cab + both events | 250 | 2h30m18s | 7h10 | $204,675 |
| Two cities, deliveries only | 250 | 2h50 | 7h10 | $210,000 |
| Two cities, one Cybercab | 219 | 2h50 | 6h18m30s | $15,000 |
| Two cities, two Cybercabs | 204 | 2h50 | 5h51m48s | $16,800 |
| Two cities, three Cybercabs | 206 | 2h50 | 5h55m12s | $15,875 |
| Two cities, one cab + both events | 200 | 2h30m18s | 5h50 | $27,175 |

The baseline ledger is $537,500 fares + $332,500 total-delivery awards + $150,000 SF awards + $20,000 city-unlock awards + $20,000 property awards − $1,000,000 land/build = **$60,000**. The two-city, one-cab, both-events ledger is $475,150 fares + $94,525 cab income + $132,500 global awards + $300,000 city awards + $20,000 city unlocks + $5,000 cab award + $5,000 first Dome win + $20,000 property awards − $25,000 cab − $1,000,000 property = **$27,175**. At 219 deliveries the no-event cab scenario finishes between jobs as continuous cab income reaches the construction price; it includes 1.2 minutes of work toward delivery 220.

The $200k award at delivery 250 makes the single-city results cliff-shaped: a cab or event leaves more money but does not reach the home earlier. Buying a third cab can also postpone a first home compared with buying two, despite improving future income. With the proposed smoother distribution, SF plus one cab finishes at 239 deliveries / 6h46m30s; two cities plus one cab finishes at 200 deliveries / 5h45. Total global awards through delivery 250 remain unchanged. Even the smoothed two-city event scenario still hits the same 200-delivery milestone and finishes at 5h50 with a larger remaining wallet, showing that more tuning is needed.

As a simple cross-check without **any** achievement cash, city bonuses, cab or events, $1 million / $2,150 rounds up to 466 deliveries, or 13h12m12s at 102 seconds each. This is a different, stripped-down scenario, not a prediction of the intended game. The modeled scenarios are optimistic: long-distance jobs, traffic, legal flight tickets, time to participate in matches, waiting for events and purchases will change results; landmark awards and quicker high-paying routes could shorten them. Tune to a target first-home time after recording actual job distributions and players' use of bonuses.

Reproduce the tables with Node 22:

```sh
node --experimental-strip-types scripts/economy-scenarios.ts --ledger
node --experimental-strip-types scripts/economy-scenarios.ts --smooth --ledger
```

The standalone model is planning code, not imported by the game. It checks that its simulated cash ledger balances. `--smooth` selects the alternative award distribution; `--ledger` prints each scenario's detailed inflows and purchases.

## Implementation order and open questions

1. Agree on persistent player identity, authoritative wallet and atomic one-off awards; preserve the playable session/solo loop. Update gameplay and protocol contracts with implementation, not in this proposal.
2. Add balance-based level changes, city/landmark achievement tracking and clear UI. Coordinate the already-planned Dome attribution work.
3. Add owned, visible Cybercabs and room match bonuses; add global event coordination separately. Measure fare/hour, cab utilization, bonus uptime, level churn and currency created/removed.
4. Add a guaranteed starter home/plot, preset construction, garage and home teleport. Add persistent scenic parcels and resale once cross-room ownership and atomic transfers exist.
5. Expand cosmetics, player-created property decoration, additional vehicles and flight/thermal options. Player-priced collectible/skin trading can use the same eventual marketplace, but item transfer rules and availability remain open.

Before launch, decide persistent identity/recovery, solo-wallet trust, building and garage permissions for visitors, actual plot capacity, whether parcels can be traded without a home, event cadence and offline cab earnings. None of the proposed balances or duration targets is validated by production or device playtesting.
