# Five-minute economy simulations

**Design experiment, 2026-10-18.** Seven delivery-led strategies explore a proposed persistent wallet, Cybercabs, research routes and a property market. The main loop is **deliver → spend or save → earn faster → eventually build**. A cash purchase can lower the player's current level; owned items and already-earned achievements stay owned. The wider design and current implementation are in [ECONOMY.md](ECONOMY.md).

The pacing target is at most a 25-minute P90 longest gap between one-off achievements during the first two active hours, and two to four one-off achievements in each 30-minute block. These are diagnostics for comparing ideas, not a proven measure of fun. We count individual awards separately from notifications grouped when one action earns several awards. Repeatable checkpoints and progress indicators are separate from both.

## Reproduce the runs

```sh
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 40 --json > public/blog/economy/simulation-summary.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 40 --events --all-activities --json > public/blog/economy/simulation-events-summary.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --no-programs --json > public/blog/economy/sensitivity-no-programs.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --single-cab-revenue --json > public/blog/economy/sensitivity-cab-revenue.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --landmarks-per-city 8 --json > public/blog/economy/sensitivity-landmarks8.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --contracts --json > public/blog/economy/sensitivity-contracts.json
pnpm exec tsx scripts/economy-charts.ts --players 250
pnpm exec tsx scripts/economy-developer.ts --players 250 --json > public/blog/economy/developer-simulation.json
pnpm exec tsx scripts/economy-community.ts --json
```

Each path uses the same 250 deterministic seeds, 1729–1978. The summary includes `before` (the earlier city access), `previous` (the first core redesign) and `redesigned` (the cadence changes below). The main run lasts 40 **active** hours; the plotted earnings and achievement windows cover eight hours. The charts include their [source data](../public/blog/economy/simulation-data.json); the developer run writes its own detailed [data](../public/blog/economy/developer-simulation.json).

Gross includes delivery/side-task pay, active cab income, repeatable payments and one-off awards. Wallet change subtracts purchases and fines. The $2,500 SF starting grant precedes the first five-minute window. Each ledger is checked for conservation. Time spent working on a job may produce a five-minute window with no pay. Early-block percentages use 1,000 nonoverlapping 30-minute windows per path; they are not 1,000 independent people.

These are scripted strategies with assumed activity and task durations, not sampled player behavior. There is no offline income, rental income, player trading, traffic queue, realistic charging or measured travel time. Purchases happen as soon as a strategy can afford its chosen next item; cab revenue assumes no operating cost.

## Seven core strategies

| Path | Spending and behavior | Selected research programs |
| --- | --- | --- |
| Delivery saver | No cab or optional purchases before the first home. | Berkeley energy + Stanford speed |
| First cab | One $25k cab before the home; 75% active utilization. | Berkeley energy + Stanford speed |
| Fleet reinvestor | Three cabs ($25k/$50k/$100k) before the home; 75% utilization. | Berkeley energy + Stanford speed |
| Customizer | One cab, $2k/$5k/$15k cosmetics and $10k/$20k vehicle kits; 70% utilization. | Stanford speed + SFO flight |
| Delivery explorer | One cab, frequent landmarks and occasional exploration; 70% utilization. | SFO flight + Berkeley energy |
| 30-minute casual | Half-hour active sessions, slower jobs, one cab at 60% utilization, landmarks and occasional minigames. | Berkeley energy + Stanford speed |
| Mixed economy | Two cabs at 65% utilization, cosmetics, a kit, exploration and occasional minigames. | Berkeley energy + UCSF real estate |

The first three share delivery speed, travel and task assumptions; the purchase policy differs. The other paths also vary behavior; the casual player takes 35% longer per delivery. Cab income is prorated by active utilization: the assumed $15k/hour cab earns $11.25k/hour at 75%. Five-minute window statistics describe active play rather than time between sessions.

The route visits SF, Oakland, Berkeley, Fremont and San Jose. After San Jose it cycles back to SF and can revisit city delivery chains. San Mateo, Palo Alto and Mountain View have named unlocks but no separate route in this simulation. Most jobs are deliveries. The occasional Dome, race and parking activities in the casual and mixed paths are diversions, with lower rates than deliveries.

## Earnings, investing and home

The first-hour values below are per five active minutes. The starter plot costs $400k and construction $600k, after reaching a $2m current-wallet market gate; the simulation buys both immediately when able. All 250 runs per path reach a first home within 40 hours. The times are medians and include the modeled one-off awards.

| Path | First-hour gross / 5m | First-hour wallet change / 5m | First cab, median h | First home, median h |
| --- | ---: | ---: | ---: | ---: |
| Delivery saver | $7,240 | $7,158 | — | 17.4 |
| First cab | $8,101 | $5,933 | 0.3 | 16.0 |
| Fleet reinvestor | $9,030 | $2,691 | 0.3 | 14.8 |
| Customizer | $7,101 | $956 | 0.9 | 16.7 |
| Delivery explorer | $6,936 | $4,771 | 0.3 | 17.7 |
| 30-minute casual | $5,624 | $3,316 | 0.4 | 21.9 |
| Mixed economy | $6,187 | $2,573 | 0.6 | 18.6 |

The matched saver/cab/fleet paths show the investment tradeoff: more early spending raises the modeled recurring income and brings the home forward. Their median wallet curves are summaries across players, not individual transaction histories.

With a modeled 2× global event for 30 minutes every four hours and a 1.5× room event for ten minutes after this player's own Dome win, capped at 3×, first-home medians in the same path order become **15.8 / 14.5 / 13.4 / 15.1 / 16.0 / 19.6 / 16.7 hours**. The simulation multiplies eligible activity pay and active cab income; awards and repeatable checkpoints remain fixed. The triggering Dome match pays before its bonus begins. Event frequency, other players' wins and room-wide uptime require separate calibration.

## Achievement and research design

Named city achievements trigger once at their current-wallet access thresholds, and are never paid again after spending and re-entry. The seven modeled cash gates and rewards are Oakland $10k/$1k, Berkeley $20k/$1.5k, Fremont $50k/$2k, San Mateo $75k/$2.5k, Palo Alto $100k/$3k, Mountain View $150k/$4k and San Jose $250k/$5k. The old level 1–3 cash bundles are replaced by these city awards; separate level 4–8 grants remain $2.5k/$5k/$5k/$10k/$20k. A city that is unlocked but absent from the route has no modeled local jobs. The earlier separate first-arrival payment is retired in this design; the first delivery in a city still has its own achievement.

| Ranked achievement | Five thresholds | One-off awards, in order |
| --- | --- | --- |
| All deliveries | 1 / 10 / 25 / 50 / 100 | $2.5k / $5k / $7.5k / $10k / $20k |
| Deliveries in each city | 1 / 10 / 20 / 35 / 50 | $2k / $4k / $8k / $16k / $32k |
| Distinct drop-offs | 4 / 9 / 15 / 22 / 30 | $500 / $1k / $2k / $4k / $8k |
| Consecutive deliveries without a citation | 20 / 30 / 45 / 60 / 100 | $500 / $1k / $2k / $4k / $8k |
| On-time deliveries | 10 / 22 / 38 / 60 / 85 | $500 / $1k / $2k / $4k / $8k |
| Tier-3-or-higher delivery contracts | 3 / 8 / 16 / 28 / 45 | $500 / $1k / $2k / $4k / $8k |
| Gross earned by the first cab | $20k / $60k / $120k / $240k / $480k | $2k / $4k / $8k / $16k / $32k |
| Qualifying jobs for each university program | 2 / 6 / 12 / 20 / 30 | $500 / $1k / $2k / $4k / $8k |
| Qualifying SFO flight jobs | 1 / 4 / 8 / 14 / 20 | $500 / $1k / $2k / $4k / $8k |

Each threshold is once per player, per named chain. A first-cab chain tracks the first cab's gross income, not the aggregate fleet. Its $20k break-even point follows the $25k purchase price and $5k purchase award; later awards are additional. Five-tier delivery achievements for each landmark occur at 1/3/6/12/20 deliveries, awarding $1k/$2k/$4k/$8k/$16k. Discovery pays $500; a first discovery made by delivering there combines discovery and first delivery into one achievement with the combined cash. Exploration that discovers a landmark separately keeps its own one-off award. Unranked delivery check-ins at 3/5/20/30/40/75/150/200/250 are one-time bonuses, not additional ranked tiers.

A player has access to Berkeley energy at $20k, SFO flight at $75k, Stanford speed at $100k and UCSF real estate at $1m current cash. After 20 total deliveries, the scripts assign 50% of eligible deliveries to the player's selected programs, choosing the less-progressed eligible program when more than one is open. Each program advances independently. SFO jobs add $2k to the fare and one minute to duration; university jobs use the normal sampled delivery fare and duration. These abstract contracts assume the relevant locations are reachable and do not grant a gameplay upgrade in the model. The existing session research visits have their own implemented rewards; these proposed longer programs and persistent counters require product and server work.

For the four base programs the model uses six abstract drop-off IDs per modeled city, uniformly sampled; a repeated stop does not increase the distinct count. An independent 4% citation chance resets a clean streak, while 80% of deliveries are assumed on time. The city and landmark identities, reachable routes, player choices and those probabilities need measurement. Unlocking a city still depends on the current wallet, while a player already there can continue using its local jobs after spending lowers their balance.

## Pacing results

P90 longest gap is the 90th percentile of each run's longest sequence of empty five-minute bins inside the stated interval, including its edges. Raw award counts include named city badges and other ranked one-off achievements; they exclude the initial SF grant, unranked check-ins and repeatable goals. Notifications group ranked awards triggered by the same action; grouping does not remove any award or its cash, and two separate actions in the same five-minute window remain separate notifications.

| Path | Early P90 gap previous → redesigned | Hours 2–8 P90 gap previous → redesigned | Early blocks above 4 awards, previous → redesigned | Early blocks above 4 notifications, previous → redesigned |
| --- | ---: | ---: | ---: | ---: |
| Delivery saver | 25 → 25m | 80 → 60m | 60.7% → 55.7% | 17.8% → 7.4% |
| First cab | 20 → 20m | 80 → 60m | 70.6% → 60.8% | 23.6% → 18.8% |
| Fleet reinvestor | 25 → 20m | 85 → 55m | 77.2% → 77.5% | 52.0% → 35.7% |
| Customizer | 25 → 20m | 85 → 60m | 80.4% → 79.9% | 44.4% → 32.1% |
| Delivery explorer | 20 → 20m | 65 → 50m | 88.2% → 75.8% | 42.6% → 31.8% |
| 30-minute casual | 25 → 25m | 75 → 45m | 60.9% → 50.5% | 32.1% → 29.6% |
| Mixed economy | 15 → 20m | 60 → 50m | 87.5% → 70.6% | 66.2% → 49.4% |

The early gap target holds for all seven paths, although the mixed path's P90 grows by five minutes. The revised tiers and research choices shorten later award gaps, but **45–60 minutes remains a long gap**. Grouped notifications reduce display pressure without fixing empty periods, and most paths still exceed four raw awards in at least half their early blocks. Fleet's raw burst rate rises slightly. The early notification blocks within 2–4 are 89.1% / 77.9% / 63.0% / 66.9% / 67.0% / 59.6% / 48.3% in table order. More iteration and playtesting are needed.

With both programs switched off, hours 2–8 P90 award gaps become 65 / 60 / 55 / 60 / 50 / 50 / 55 minutes. Eight instead of three abstract landmarks per city gives 60 / 55 / 55 / 65 / 40 / 45 / 45; availability and reachability are not validated. Replacing the five first-cab income tiers with only the first $20k award produces 60 / 60 / 60 / 65 / 50 / 55 / 55. These are separate eight-hour sensitivities, and their longer or shorter gaps do not establish a player's likely choice.

The default repeatable delivery checkpoint pays $750 every three deliveries. A separate `--contracts` alternative replaces it with one rotating $650 contract: two on-time deliveries, three consecutive uncited deliveries, then two distinct drop-offs. Contracts never stack with the checkpoint, and repeatable completions are not one-off achievements. In hours 2–8 the P90 longest gap without a completed goal is 20–25 minutes by path under the checkpoint and 20–30 minutes under contracts. Counting partial contract progress as visible feedback separately gives 15–20 minutes; the old checkpoint has no simulated progress indicator. Test the presentation before choosing between them.

## Developer path

The separate developer experiment begins after the first home, with that run's actual home-time cash balance and cabs. The player then saves for a second, buildable plot at a **$2m current-wallet gate**. The $800k plot and a $1.2m foundation/first floor are sinks; the first floor is a home on that plot. Further floors do not require the market gate again. For floor `n` from 2 to 20, the price is `round($200,000 × 1.1^(n − 2) / $1,000) × $1,000` independently for each floor. Land plus construction totals $2.928m at five floors, $4.716m at ten, and $12.232m at twenty. One-off achievements at floors 1/5/10/20 pay $5k/$10k/$25k/$50k, included in the ledger. There is no rent.

| Path | Developer plot, median h | 5 floors, median h | 10 floors, median h | 20 floors, median h |
| --- | ---: | ---: | ---: | ---: |
| Delivery saver | 26.4 | 36.4 | 55.6 | 134.7 |
| First cab | 24.2 | 33.2 | 50.4 | 121.5 |
| Fleet reinvestor | 21.7 | 29.0 | 43.0 | 101.3 |
| Customizer | 24.9 | 33.9 | 51.2 | 122.5 |
| Delivery explorer | 26.6 | 36.3 | 55.0 | 132.2 |
| 30-minute casual | 32.9 | 44.9 | 67.9 | 163.3 |
| Mixed economy | 27.6 | 37.3 | 55.8 | 132.8 |

All 250 runs per path reach 20 floors within the 1,500-active-hour horizon. After the first home, the experiment stops discretionary spending and buys each construction stage when affordable. It derives each run's recurring net delivery efficiency and active cab rate from hours 32–40 of a separate save-after-home run, then projects forward in five-minute increments. The projection recalculates pay from current-wallet level, assumes the player retains tier-3 San Jose local work after spending, and excludes later achievements except the four building awards. That choice, the fixed late efficiency, no rent and the absence of future upgrades or costs make the result a planning estimate. Time spent traveling back to San Jose for that work is not separately charged. A 20-floor building is reachable under these assumptions; it is not evidence of actual playtime or a guarantee every room survives until completion.

## Optional side games

Dome, race and parking are for variety, not primary earners. The candidate pays an expected 30% / 35% / 30% of same-tier delivery income per minute before bonuses, respectively, using assumed task duration at acceptance. For a 50% Dome win chance, pay 70% of its target on completion and 60% more on a win: at tier 0 the $1,950 target means $1,365 for a loss and $2,535 for a win. Race and parking tier-0 examples are $1,930 and $1,650. Actual matchmaking, task times, meaningful participation, AFK protection and collusion resistance are unmeasured.
