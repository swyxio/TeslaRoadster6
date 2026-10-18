# Economy and property design

**Economy design, 2026-10-18.** Deliveries build a wallet, a fleet puts money to work, and homes give players a place to show what they have built. This document sets out the proposed progression and prices. The [implementation guide](ECONOMY_IMPLEMENTATION.md) records the shared decisions and handoffs for contributors. The [player simulations](ECONOMY_SIMULATIONS.md) and [five-minute experiment](ECONOMY_FIVE_MINUTE.md) compare the choices and their pacing.

The candidate branch implements a saved wallet, cash-based regional levels, delivery and showroom achievements, a luxury showroom, and an automatic global earnings counter for Starship. Its wallet recovery, gameplay and performance checks remain release gates. Cybercab income, property, city-specific achievement chains and the broader research programs below remain designs. See [DELIVERY.md](DELIVERY.md), [LUXURY_SHOWROOM.md](LUXURY_SHOWROOM.md) and [CONTRACTS.md](CONTRACTS.md) for the candidate's implemented rules.

## Goals

- Drive, explore and play with friends immediately; money and ownership add goals, not a mandatory tutorial or a paywall around the basic fleet.
- Fill the early game with deliveries, city discoveries, landmarks, cosmetics, vehicle upgrades and the first Cybercab. Property is a late-game goal; Dome, races and parking are optional side games.
- Make money useful: deliveries, achievements and Cybercabs fund cosmetics, property, building and upgrades. Homes are expensive, with a first city-supplied home or plot-plus-build costing $1 million before awards.
- Make achievements guide players into cities, landmarks, the Dome and property. Give one-off cash, not XP.
- Let purchases reduce the player's current level. Keep owned items and permanent achievement progress after a level drop.
- Make land speculation and resale possible while protecting every player's access to a starter home and buildable starter plot.

## Wallet and levels

Use the **current spendable wallet** for levels; no XP or career-earnings gate. Every deposit, including a sale or gift, increases the balance; purchases, fines and transfers reduce it. A loan can temporarily raise a level, and paying it back can lower it. Purchases require sufficient cash; the current game can produce a negative wallet from a ticket, which would remain level 0.

| Balance | Level and proposed access |
| ---: | --- |
| $0 or less | 0: San Francisco, Marin and Rocket Dome; starter jobs |
| $10,000 | 1: Oakland |
| $50,000 | 2: Fremont and SFO; more cities open at the balances below |
| $250,000 | 3: San Jose |
| $500,000 | 4: professional delivery contracts |
| $1,000,000 | 5: higher-paying fleet and delivery contracts |
| $2,000,000 | 6: advanced contracts and property market, including the $1m starter home and $400k starter plot |
| $4,000,000 | 7: luxury contracts |
| $8,000,000 | 8: estate contracts |

Thresholds are inclusive. Separate city access gates spread discoveries between the broader wallet levels. San Francisco starts open with a $2,500 award; Oakland opens at $10k, Berkeley at $20k, Fremont at $50k, San Mateo at $75k, Palo Alto at $100k, Mountain View at $150k, and San Jose at $250k. Their respective first-unlock awards are $1k / $1.5k / $2k / $2.5k / $3k / $4k / $5k, once per account. The first arrival at levels 4–8 also awards $2,500 / $5,000 / $5,000 / $10,000 / $20,000, respectively; levels 1–3 do not pay an additional bundled city award. Awards can cause another threshold to be crossed, but crossing it again never pays again. Marin is a region, not a city. Assign explicit destination-city IDs before offering per-city delivery milestones.

The first delivery in each city earns its own achievement. The simulation visits only SF, Oakland, Berkeley, Fremont and San Jose; it counts the other three city unlocks without modeling their travel. Group awards from the same action and playtest the timing.

Recalculate levels after each payment, purchase, fine, transfer and one-off award. Relocked areas block **new entry** after the player leaves; do not abruptly eject a player already there. Let an accepted delivery finish and keep local jobs available at that city's normal difficulty and pay; premium contracts still require the current wallet level. Let the owner teleport to and manage an owned plot or home, even if its city has relocked. The owner can then enter that local city on foot or by car. Owned assets and earned achievements persist when levels fall. Before a purchase, show the resulting wallet, level and relocked access; offer a reserve calculation without imposing a mandatory minimum balance.

Buying any new plot or completed home, including player resale or a zero-price transfer, requires level 6 immediately before the transaction. Managing, building on or selling an already owned plot does not. A $1m starter home is therefore still priced at $1m, but the player must first hold $2m; at the threshold its purchase leaves $1m plus any first-home award. Later purchases can leave less and cause a much larger level drop.

## Cash sources and awards

As an initial tuning experiment, multiply current shop, tank, service, OTA and fine values by 50, but tune delivery pay by route difficulty and duration. The current $43 example fare would become $2,150 under the old flat ×50 experiment. The candidate simulation instead uses the illustrative jobs below, with ±20% fare and duration variation. The actual fare depends on distance, timing and pickup bonuses; these tiers and job times are invented inputs, not measured gameplay.

| Job tier | Base fare | Typical task time |
| ---: | ---: | ---: |
| 0 / 1 / 2 / 3 | $3k / $4k / $6k / $9.5k | 3 / 3.5 / 4.5 / 5.5 min |
| 4 / 5 / 6 / 7 / 8 | $11k / $13k / $15k / $20k / $26k | 6 / 6.5 / 7 / 7.5 / 8 min |

The model picks the highest tier available from the current balance or the current city's local tier. It does not implement a job board, test routes or prove those earnings are available in the current game.

One-off achievement tiers, payable once each per player and additive when the same action satisfies several achievements:

| Chain | Triggers for levels 1–5 | Award per level |
| --- | --- | --- |
| Total deliveries | 1 / 10 / 25 / 50 / 100 | $2,500 / $5,000 / $7,500 / $10,000 / $20,000 |
| Deliveries **in each city** | 1 / 10 / 20 / 35 / 50 | $2,000 / $4,000 / $8,000 / $16,000 / $32,000 |
| **Each landmark delivery** | 1 / 3 / 6 / 12 / 20 | $1,000 / $2,000 / $4,000 / $8,000 / $16,000 |
| Rocket Dome wins | 1 / 3 / 10 / 25 / 50 | $2,000 / $4,000 / $8,000 / $16,000 / $32,000 |
| Each of Dome matches, races, parking challenges and scenic contracts completed | 1 / 3 / 5 / 10 / 25 | $2,000 / $4,000 / $8,000 / $16,000 / $32,000 |
| Races and parking challenges combined | 1 / 3 / 5 / 10 / 25 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| Cybercabs owned | 1 / 2 / 3 / 4 / 5 | $5,000 / $10,000 / $20,000 / $40,000 / $80,000 |
| Consecutive deliveries without a citation | 20 / 30 / 45 / 60 / 100 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| Distinct delivery drop-offs | 4 / 9 / 15 / 22 / 30 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| On-time deliveries | 10 / 22 / 38 / 60 / 85 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| Tier-3-or-higher delivery contracts | 3 / 8 / 16 / 28 / 45 | $500 / $1,000 / $2,000 / $4,000 / $8,000 |
| First cab gross earnings | $20k / $60k / $120k / $240k / $480k | $2,000 / $4,000 / $8,000 / $16,000 / $32,000 |
| Distinct plots acquired | 1 / 2 / 3 / 5 / 10 | $5,000 / $10,000 / $20,000 / $40,000 / $80,000 |
| Homes constructed | 1 / 2 / 3 / 5 / 10 | $5,000 / $10,000 / $20,000 / $40,000 / $80,000 |

The first home, bought or constructed, pays an additional $10,000 once. Unranked, one-time delivery check-ins pay $1k / $1.5k / $2k / $2.5k / $3k / $5k / $10k / $15k at 3 / 5 / 20 / 30 / 40 / 75 / 150 / 200 total jobs, plus $40k at 250; each city's check-ins pay $1k / $2k / $3k at 5 / 15 / 20 jobs. Each Dome, race, parking and scenic chain has a $10k one-time check-in at 50 completions. These sit between or after the five ranked achievement tiers. A separate repeatable $750 checkpoint pays every three deliveries, Dome matches, races, parking challenges or scenic contracts of the same kind. The first cosmetic and first vehicle upgrade pay $1,000 and $2,000 respectively. Check-ins and checkpoints are not ranked achievements, and neither those payments nor one-off awards are multiplied.

The five-minute experiment proposes activity payouts relative to a delivery of the same current job tier, using a fixed expected duration at acceptance. Let `reference` be the tier's base fare divided by its typical minutes, before multipliers. Pay **30% × reference × 6.5 minutes** for a Dome match at a 50% win rate: each participant receives 70% of that amount on completion, plus another 60% for a win. Pay **35% × reference × 5.5 minutes** for a race, **30% × reference × 5.5 minutes** for parking, and **65% × reference × 6 minutes** for a scenic contract. Round the base amount to the nearest $10. For tier 0 those base amounts are $1,950 / $1,930 / $1,650 / $3,900 respectively; a lost match pays $1,365. These are proposed average difficulty and time assumptions, not measured game outcomes. Actual waiting longer never increases the accepted payout. Scenic contracts are a proposed repeatable activity, not an implemented feature. Gate all completion payments and achievements on verified participation and a genuine completion; design opponent/collusion and AFK protections before multiplayer launch.

The first cab earning $20k gross pays a one-time $2k award: at that point it has recovered the $25k purchase price net of its $5k purchase award, before any other costs. Distinct drop-offs require stable location IDs; a citation breaks the clean-delivery streak and already-paid milestones cannot be earned again. An on-time completion is cumulative. When discovering and delivering to a landmark happen together, combine their cash and show one notification rather than two simultaneous notifications.

Count unique plot/build events per player, so selling and reacquiring the same plot does not repeat an award. This does not stop multiple accounts cycling a plot through $0 sales for achievements; property achievement payouts need a sybil/fraud design before trading launches. Add small first-use bonuses for decoration, a home charger, home teleport and a launch pad; amounts remain to be tuned. The existing Awards UI should show the next goal, its reward and a map pin. Allow choosing a destination city when jobs exist there; the current generator does not offer that choice.

Landmarks should include Alcatraz, Treasure Island, SFO, the China Basin Dome, Bay Bridge/Yerba Buena, Golden Gate, Ferry Building, Transamerica Pyramid, Oakland Tribune Tower, Berkeley Campanile, Stanford Hoover Tower, Mission San José and San Jose City Hall. Salesforce and Coit require **landing on the tower**, not merely approaching it. Their visible caps and collision surfaces need a visibly landable target and playtest. Alcatraz and Treasure Island need supported destinations and validated arrival interactions before they can have awards. Landmark-specific deliveries and city IDs do not yet exist for all these places. Monetary Dome awards remain a proposal; the current session achievements already use authoritative player goal attribution.

### Early goals and remaining gaps

Keep five ranked levels per chain, with small early milestones and repeatable checkpoints. Put a few optional, varied goals on the HUD: the next delivery milestone, a nearby landmark, a cosmetic, the first cab, and side games when a player chooses them. Rewarding participation makes trying the Dome useful even without a win, but minigames deliberately earn less than deliveries. Players can change activities freely; they need not play minigames to progress.

A provisional early-playtest target is 2–4 unique one-off achievements per 30 minutes in the first two hours, with no-achievement gaps of at most 25 minutes for 90% of simulated players. The [redesigned five-minute experiment](ECONOMY_FIVE_MINUTE.md) meets that early gap target on its seven delivery-led paths but frequently exceeds four achievements per block, and it has much longer gaps in hours 2–8. The 2–4 target is **not met**. Batch notifications earned by the same action without delaying the cash; pin visible progress toward the next meaningful goal. A simulated rotating-contract alternative shows partial progress more often but completes a little less frequently than the current checkpoint; it is a repeatable goal, not an achievement, and needs playtesting. Do not promise a new achievement in every five-minute window or add arbitrary badges forever. Measure five-minute cash, achievement count and zero-award windows separately from 30-minute averages; maintain meaningful choices as individual chains run out. Income is allowed to rise between tiers so exponential prices remain attainable.

## Research and airport deliveries

The research tour gives players a reason to visit four landmarks. UCSF's Homes Lab pays $1,000 and awards its badge; Berkeley's Energy Lab pays $1,500 and gives 20% off efficient nozzles; Stanford's Speed Lab pays $2,000 and gives 20% off sport motors; SFO's Flight Lab pays $2,000 and gives 20% off air tanks. An SFO delivery earns an additional one-time $2,500. The candidate saves awards and discounts with the driver. Berkeley has the Campanile, Sather Gate and Doe Library; Stanford has Hoover Tower, the Main Quad and Dish; SFO has an airport, runway and Aviation Museum; the map also includes UCSF Parnassus.

The delivery-linked certifications below are the proposed persistent expansion of this tour. Their rewards and upgrades are separate from the current visit rewards. New lab and clinic destinations need map and collision design.

After **20 lifetime deliveries**, offer research work at each eligible campus. Berkeley opens at $20k, the SFO Flight Lab program at $75k, Stanford at $100k, and UCSF's real-estate program at $1m. SFO airport entry itself opens earlier, at the $50k level-2 threshold. Access uses the current wallet, while progress and earned certification survive a balance drop. The work itself remains delivery play: select a lab or terminal job, pick up a named item, and bring it safely to its destination. A job advances the one program named on the offer; it can also advance ordinary city and total-delivery achievements. Program ranks track achievement progress; ordinary jobs and existing flight remain open to everyone.

| Program | Jobs and character | Level-two unlock |
| --- | --- | --- |
| UC Berkeley · Energy Systems | Take equipment between the Campanile and nearby energy labs. | $10k efficient-flight tune: use 10% less air while flying. |
| UCSF · Homes Lab | Deliver materials and housing-design prototypes to research partners. | $20k home design kit, with distinctive exterior and interior choices; a first-home discount is another candidate. |
| Stanford · Speed Lab | Deliver motor prototypes between Hoover Tower, the Quad and Dish; try a controlled acceleration run. | $20k sport-motor tune; refine handling and speed in playtests. |
| SFO · Flight Lab | Move flight equipment between the terminal, Aviation Museum and city; some routes ask for a careful, timed arrival. | $40k glider kit: add an air-saving glide mode; tune handling in playtests. |

The suggested university tiers unlock at **2 / 6 / 12 / 20 / 30** qualifying deliveries each, with the level-two unlock at six. They award **$500 / $1,000 / $2,000 / $4,000 / $8,000** once per tier. SFO uses **1 / 4 / 8 / 14 / 20**, with the level-two unlock at four, and the same cash awards. A finished university program can award its matching livery; the three research lines plus SFO issue at most $62k of one-off awards per player. SFO pays the ordinary delivery fare plus a $2k airport supplement; eligible fare and supplement receive the same event multiplier, and the achievement awards do not. Qualifying jobs must be completed, distinct validated job IDs; repeating a job or reconnecting must not repay a tier. Award underlying ordinary milestones as normal, but present awards from one job in a grouped notification.

The proposed Berkeley tune composes multiplicatively with an efficient-nozzle upgrade if both are fitted: 25% then 10% less air leaves 67.5% of baseline use. The UCSF kit expands property customization, Stanford improves road speed, and SFO expands flight. Do not silently accumulate multiple copies. Keep tuned, upgraded vehicles eligible for ordinary jobs; test vehicle handling, races and flight before deciding whether competitive modes use these effects.

At the example level-four delivery rate ($11k per six minutes), a 30-job research line takes three active hours and pays $330k in fares plus $15.5k in program awards, before ordinary milestones and other income. At seven minutes per $11k job plus the $2k supplement, SFO's 20 jobs take 2h20 and return $275.5k including its $15.5k awards, or about $118.1k/hour. A regular job at the same tier earns $110k/hour before other awards; SFO's repeatable rate after its one-offs is about $111.4k/hour. The research chain's last two milestones are an hour apart at the assumed pace; it adds a meaningful branch but does not erase the late achievement gap. Run `pnpm exec tsx scripts/economy-research.ts` to reproduce these comparisons. The seven-path progression runs model program jobs as an abstract share of deliveries, rather than simulating physical travel to each campus.

## Cybercabs and events

Proposed ordinal Cybercab prices: $25,000 / $50,000 / $100,000 / $200,000 / $400,000. Each active, dispatched cab earns $15,000 per real active hour before any multiplier; paid amounts arrive in the wallet as they accrue. The new simulations assume 65–80% average utilization while the owner is actively playing, no operating cost and no offline income. Offline income and prices beyond the fifth cab remain undecided. Owned cabs are persistent, visible in the world, locatable on the map and branded with the owner's name; a human driver and owner should be distinguishable when different.

Before bonuses, payback is 1h40 / 3h20 / 6h40 / 13h20 / 26h40 respectively. After each one-off ownership award it is 1h20 / 2h40 / 5h20 / 10h40 / 21h20, assuming full utilization and no costs. Five cost $775,000 gross, or $620,000 after those awards, and produce $75,000 per active hour: 8h16 combined payback. These are straight-line calculations, not measured game performance.

Proposed event rules:

- A developer-controlled global event grants **2×** for 30 minutes. A Rocket Dome match win grants **1.5×** to everyone in that room for 10 minutes; another win refreshes the room timer. The winner can additionally receive the first-win achievement once.
- Multipliers combine multiplicatively, capped at **3×**. Apply them to pickup/delivery earnings, active Cybercab income and verified repeatable match, race, parking and scenic-contract completion pay. Achievement awards, check-ins, checkpoints, gifts, refunds and resale proceeds are not multiplied. This lets the player who triggered a win benefit while continuing to play the Dome.
- Use the rate when each eligible task pays; credit cab income proportionally to the time it actually operated at each rate. A win starts or refreshes its room bonus **after** that match's payout, so it cannot boost itself retroactively. Show the multiplier, scope and remaining time.
- Repeated quick Dome wins might keep the room bonus running indefinitely, especially when others in a room can trigger it. The [experiment](ECONOMY_FIVE_MINUTE.md) measures own-win-only scenarios; require real play and investigate win trading, room-wide uptime and money creation before deciding whether to change duration or add a cooldown.

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

These are example matched packages, not a requirement to buy only that pairing: any design that physically fits may be built on a plot. The first city-supplied ready-made home is also $1 million. For the first implementation, choose a preset exterior and pay for immediate construction; add material-delivery missions and deeper customization later. The $2m market gate means a player buying the $400k plot can immediately afford the $600k build; dividing it into four payments therefore creates no extra progression in the model. Include a two-car garage with each home. Decorations, chargers and launch pads are separate purchases.

### Build upward

A developer can buy a larger $800k plot, build a $1.2m foundation and first story, then add floors. For floor `n` from 2 to 20, compute `$200,000 × 1.1^(n − 2)` and round that floor independently to the nearest $1,000. The second floor costs $200k; do not compound from the previous rounded price. The foundation includes the larger building's initial structure; the increasing incremental payments fund the stories above it. A 20-floor limit keeps the tower within the game's flight space. Players may continue building on a plot they already own after their wallet falls below the market gate.

| Building | Plot and construction | Latest floor |
| --- | ---: | ---: |
| 1 story | $2m | $1.2m foundation |
| 5 stories | $2.928m | $266k |
| 10 stories | $4.716m | $429k |
| 20 stories | $12.232m | $1.112m |

The figures exclude achievement awards and optional upgrades. Propose one-time awards of $5k / $10k / $25k / $50k at floors 1 / 5 / 10 / 20. Building floors gives owners a visible skyline to shape and a reason to keep earning; any eventual sale transfers the whole parcel and building under the existing market rules, including the purchased-home slot if it contains a home. Avoid automatic rental income until there is a separately balanced tenant and payout system. An individual instance can establish the build-and-visit loop first; scarce shared physical plots require the cross-room registry and collision-safe placement described below.

### Scarcity and supply

1. **Guaranteed starter access:** offer every account one city-sold, instanced starter plot for $400,000, as well as access to a $1 million instanced ready-made starter home. A shared neighborhood entrance leads to individually persistent, visitable spaces; this avoids promising unique visible street lots for unlimited players. A player's one subsidized starter-plot purchase is once per account; additional plots can be bought on the market or from other city releases. The one purchased-home limit still applies. Authentication/account abuse needs its own design; this rule alone does not stop multiple accounts.
2. **Scarce scenic plots:** release a finite set of distinct, exclusive world parcels in places people want to visit. Each has a stable ID and one owner across rooms, is visible and visitable in the shared world, and can be built on or resold. The actual locations must be checked against the authoritative map, traffic, landmarks and collisions; do not block public streets or landmarks.
3. **Example initial inventory, not a promise that the map fits it:** 40 neighborhood plots at $800k, 30 view plots at $1.6m, 20 waterfront plots at $3.2m and 10 landmark-adjacent plots at $6.4m. If all 100 sell at these city prices, $208 million leaves player wallets. Do not sell the public landmark itself. More scenic lots require authored, collision-safe map space and may be released later; scarcity makes location and owner-built designs meaningful.
4. **Monitor affordability:** let N be accounts with at least one delivery in the past 30 days, A be vacant **physical** starter-equivalent plots actually listed for $600k or less, and D be distinct accounts requesting an affordable physical plot in the past seven days. Exclude guaranteed instanced plots from A. If A remains below the larger of 5 and 5% of N for seven days, and D reaches that same number, review releasing about 10% of N additional $400k physical plots, subject to safe map capacity. For N = 1,000, fewer than 50 such listings for a week and at least 50 recent requests trigger a review of roughly 100 additional plots. This is an operator tuning rule, not an automatic promise or a cap on resale prices. Guaranteed instanced starter access remains available regardless.

No mandatory rent, recurring property tax, foreclosure or automatic seizure is proposed. Physical supply must not grow by silently duplicating existing exclusive lots across rooms. [Final Fantasy XIV](https://na.finalfantasyxiv.com/lodestone/playguide/contentsguide/housing_land/) illustrates finite plots and controlled primary allocation; [Second Life](https://community.secondlife.com/knowledgebase/english/page/5/?d=3) documents resident land sales. Our starter guarantee and free resale policy are distinct design choices.

### Resale and money sinks

Owners may list vacant plots or completed properties at **any nonnegative price**; the buyer chooses whether to pay it and must meet the current level-6 market gate. Use a fixed-price listing first. A sale transfers the plot and any included building; personal cars and portable possessions remain with the seller and return to account storage if needed. List explicitly what transfers. Reject a completed-home sale if the buyer's purchased-home slot is occupied. A listing may be canceled or repriced before sale. There is no guaranteed city buyback or resale value.

The buyer pays the listed price, the seller receives **95%**, and the remaining 5% leaves the economy. A player-to-player sale otherwise transfers existing cash rather than creating or destroying it. Primary city plot purchases and construction fees are sinks. Example: a player buys a city plot for $400k and builds for $600k, then sells it for $2m. The buyer pays $2m, the seller receives $1.9m, the fee removes $100k, and the seller's nominal profit is $900k before any other expenses or achievement awards. The initial $1m plus the resale fee removes $1.1m in total. A player is free to sell below $1m, so the $1m starting price is a **city-supply price**, not a resale floor.

Ownership transfer, buyer debit, seller credit and fee must commit together; one listing can complete once, even if two buyers click it or a client reconnects. This requires durable authenticated identity and a shared property registry, neither provided by session room names or chat recovery. If an offline mode is ever added, shared-wallet earnings would need to be verifiable rather than trusted from an editable local wallet.

Deliveries, cab income and rewards create money; purchases from the game, construction and sale fees remove it. Player-to-player transactions transfer money except for any fee. Sinks can help moderate price pressure when the supply of cash grows faster than desired goods, but they do not guarantee stable prices; changing a cosmetic's price is not itself inflation. Track money creation and removal, player balances, market prices and access across new and established players.

## Shared Starship milestone

The user chose a **game-wide $1 billion lifetime-earnings milestone**, automatically credited without deducting player cash. The proposed counter counts verified game-created income such as fares, dispatched-cab earnings and one-off rewards once. Transfers, gifts, refunds and player-to-player resale proceeds do not count again: otherwise players could circulate the same dollars to advance the goal. Individual earnings and the global total must survive reconnects and redeploys, and each source credit must be idempotent. A launch, contributor recognition and how the current room is retired or renewed require a separately designed experience.

This is not a money sink: the goal meter does not deduct or escrow money. The existing room-local donation fund is not the proposed game-wide total. Resolve their integration before promising a unified behavior. The [funding analysis](STARSHIP_ECONOMY.md) models the $1b milestone under explicit active-player, hourly-earnings and participation assumptions; no production traffic or future high-level earnings are known yet.

## Garages, cosmetics and home upgrades

Keep ordinary available passenger vehicles free to drive and select; do not introduce passenger-EV purchase prices until there is a compelling gameplay reason. A garage stores persistent personalized car configurations and can display and retrieve them. The proposed new BYD Dolphin/Seal, Rivian R1T/R1S, Lucid Air, civilian Hyundai IONIQ, Kia EV9, Silverado EV and F-150 Lightning remain a separate fleet-content proposal, not shipped by this document. The current fleet already includes a Waymo IONIQ 5 variant. Owned Cybercabs are separate income-producing assets; a dispatched cab need not occupy a garage space.

An exclusive [luxury showroom](LUXURY_SHOWROOM.md) gives late-game players a separate collection of Lamborghini and Bugatti supercars and Ducati and Kawasaki motorcycles. Purchase requires visiting the showroom, and the candidate prices run from $1.5m to $12m. These models do not enter the free ambient fleet; the first purchase of each has an achievement. Purchases require the planned persistent wallet and ownership system.

Two garage spaces are included per home; the next five spaces cost $50k / $100k / $200k / $400k / $800k. Cosmetic starting prices: paint $2k, decals and lettering $5k, wheels/trim $15k, wraps and fleet branding $50k, and premium lights/effects $150k. Account-owned cosmetics can be reapplied to compatible cars; earned special designs can celebrate achievements. Show driver names and Cybercab owner names. Prices and compatibility need playtesting.

Optional early vehicle or flight kits at $10k / $20k / $40k give players goals before property. The research kits above sketch possible abilities; the seven-path simulation counts kit purchases without a speed or income benefit. Keep the Roadster's existing flight and public launch pads available without buying a kit.

A starter home includes two garage spaces and free home teleport. Its owner can give it a distinct look and choose which amenities to add first:

| Upgrade | First cost | What the player gets |
| --- | ---: | --- |
| Furnishing set | $20k | Furniture and interior decoration for the owner's chosen rooms. |
| Home charger | $25k | Refill the vehicle's air tank at home; public charging stays available. |
| Third garage space | $50k | Store and display one more personalized vehicle configuration. |
| Thermal launch pad | $50k | A visible home launch point that helps lift a vehicle into the air. |

Further charger upgrades cost $50k then $100k; further launch upgrades cost $100k then $200k. These are successive payments, not replacement totals. The remaining garage slots cost $100k / $200k / $400k / $800k. Garages hold configurations, not a requirement to buy a passenger EV, and a dispatched cab need not occupy a bay. Keep permissions simple initially: the owner edits and retrieves; visitors can look around. Specify guest access, collision safety and exact charging or launch performance when implementing them.

At exactly the $2m market gate, buying the $400k plot and $600k build leaves $1.02m after the $5k plot and $15k first-build/home awards. Buying all four improvements costs $145k and leaves $875k: current level falls from 5 to 4, but the home, its improvements and the free teleport remain. This example excludes any future first-use rewards. On resale, the listing identifies which installed improvements transfer; portable cars and account-owned cosmetics stay with the seller.

## Historical first-home napkin math

The following earlier scenarios use the original 1/10/50/100/250 delivery awards of $2.5k/$10k/$40k/$80k/$200k, larger city awards, and a level-3 property gate. They do **not** use the candidate's later property gate or revised pay and awards. Keep them as a record of why the design changed; see the [progression simulations](ECONOMY_SIMULATIONS.md) and newer [five-minute branch experiment](ECONOMY_FIVE_MINUTE.md) for later candidates. They are not measured playtimes:

- Start with $0, then credit the $2,500 SF unlock. Each delivery pays exactly $2,150 and takes 102 seconds: the game's current $43 example fare × 50, with an illustrative 40-second pickup plus 62-second drop-off. Every job is on time with no pickup bonus. The model assumes a selectable supply of SF and Oakland jobs, which the current game does not have.
- Credit the original global, per-city and first-time city-unlock awards encoded in the historical script. At sufficient balance, immediately buy a $400k plot and later a $600k house; first-plot / first-construction / first-home awards total $20k. No other landmark, decoration or property rewards. Home-market access requires level 3 before purchase; these prices exceed that threshold. A cab strategy buys the indicated number as soon as affordable, before the plot, and receives each ownership award once.
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

1. Agree on persistent player identity, authoritative wallet and atomic one-off awards; preserve the playable session loop. Update gameplay and protocol contracts with implementation, not in this proposal.
2. Add balance-based level changes, early city/landmark/delivery milestones and clear next-goal UI. Build on the existing Dome goal attribution; measure real route duration and earnings.
3. Add simple cosmetics and early vehicle goals, then owned visible Cybercabs and room match bonuses; add global event coordination separately. Measure fare/hour, cab utilization, bonus uptime, level churn and currency created/removed.
4. Add the late-game guaranteed starter home/plot, preset construction, garage and home teleport. Add persistent scenic parcels and resale once cross-room ownership and atomic transfers exist.
5. Expand player-created property decoration, additional vehicles and flight/thermal options. Player-priced collectible/skin trading can use the same eventual marketplace, but item transfer rules and availability remain open.

Before launch, decide persistent identity/recovery, building and garage permissions for visitors, actual plot capacity, whether parcels can be traded without a home, event cadence and offline cab earnings. None of the proposed balances or duration targets is validated by production or device playtesting.
