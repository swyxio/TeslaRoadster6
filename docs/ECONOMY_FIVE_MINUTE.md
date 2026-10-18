# Five-minute economy simulations

**Design experiment, 2026-10-18.** These rules and trajectories are proposals, not gameplay telemetry. The game currently has session delivery, exploration and optional minigames; the persistent wallet, income-producing owned cabs, persistent achievements, player property and rotating contracts here are not implemented. See [ECONOMY.md](ECONOMY.md) for the wider design and current-game distinctions.

The core loop is **deliver → spend or save → earn faster → eventually buy land and build**. The model tests seven delivery-led strategies rather than treating Dome, racing or parking as professions. It asks two different pacing questions: how often people get cash and one-off achievements, and whether visible repeatable goals can provide feedback between achievements. A provisional test target is a P90 longest one-off-achievement gap of at most 25 active minutes in the first two hours, and 2–4 one-off achievements in each 30-minute block. It is a diagnostic, not a promise or a validated measure of fun.

## Run it

```sh
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 40 --json > public/blog/economy/simulation-summary.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 40 --events --all-activities --json > public/blog/economy/simulation-events-summary.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --landmarks-per-city 8 --json > public/blog/economy/sensitivity-landmarks8.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --cab-revenue-levels --json > public/blog/economy/sensitivity-cab-revenue.json
pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 8 --contracts --json > public/blog/economy/sensitivity-contracts.json
pnpm exec tsx scripts/economy-charts.ts --players 250
```

The JSON includes before and redesigned results and preserves the input switches. The chart script writes desktop and narrow SVGs plus [the plotted numbers](../public/blog/economy/simulation-data.json). Each path has 250 deterministic seeds, 1729–1978. Main runs last 40 **active hours**; five-minute achievement and income windows are measured through hour 8 and wallets through hour 40. Eight-hour sensitivity runs cannot establish home times. Seeded paths are scripted examples, not representative samples or confidence intervals. Results depend on assumed availability and task durations; no idle income, player trade, queues, realistic charging, network latency or measured travel times are included.

Gross includes delivery/side-task pay, active cab income, repeatable payments, one-off awards and unlock cash. **Wallet change** subtracts purchases and fines. The initial $2,500 SF grant precedes the first five-minute window. Each ledger is checked for conservation. A five-minute window without pay may contain work in progress. The early block statistics use 1,000 nonoverlapping 30-minute windows per path, not 1,000 independent people.

## Seven core strategies

| Path | Spending and behavior |
| --- | --- |
| Delivery saver | No cab or optional purchases before the first home. |
| First cab | Buys one $25k cab before the home; 75% active utilization. |
| Fleet reinvestor | Buys the first three cabs ($25k/$50k/$100k) before the home; 75% utilization. |
| Customizer | Buys a cab, $2k/$5k/$15k cosmetics and $10k/$20k vehicle kits; 70% utilization. |
| Delivery explorer | One cab, frequent landmarks and occasional exploration; 70% utilization. |
| 30-minute casual | Half-hour active sessions, slower jobs, one cab at 60% utilization, some landmarks and occasional minigames. |
| Mixed economy | Two cabs at 65% utilization, cosmetics, a kit, exploration and occasional minigames. |

The first three share the same speed, travel and task assumptions; their purchase policy is the intended difference. Changing finances can still change subsequent tasks, payouts and RNG consumption. The other profiles vary independently; for example the casual player takes 35% longer per delivery. Sessions are **active play**, so 21.7 active hours is not 21.7 calendar hours. The hypothetical $15k/hour cab earns only while its owner is active and is prorated by utilization. There is no cab operating cost and no offline earning.

At activity boundaries, scripted players take an available job or travel after a set number of local tasks. The travel model visits SF, Oakland, Berkeley, Fremont and San Jose; San Mateo, Palo Alto and Mountain View are named unlocks only and have no modeled route. Most jobs are deliveries. A small modeled fraction of the casual and mixed paths is spent on side games; optional paid scenic tours are not used by these paths.

## Earnings, investing and home

In the following **redesigned**, no-event runs, the first-hour columns are per-five-active-minute means. Spending in one window can exceed its earnings; gross is not spendable wallet change. The starter plot costs $400k and construction $600k, with a $2m current-wallet gate; in this simplified run both are paid immediately on reaching the gate. The home values are medians among players who reached it, and all 250 did so in each 40-hour sample.

| Path | First-hour gross / 5m | First-hour wallet change / 5m | First cab, median hours | Plot, median hours | First home, median hours |
| --- | ---: | ---: | ---: | ---: | ---: |
| Delivery saver | $7,279 | $7,198 | — | 17.7 | 17.7 |
| First cab | $8,179 | $6,011 | 0.3 | 16.2 | 16.2 |
| Fleet reinvestor | $9,087 | $2,747 | 0.3 | 15.2 | 15.2 |
| Customizer | $7,185 | $948 | 0.9 | 17.0 | 17.0 |
| Delivery explorer | $6,981 | $4,815 | 0.3 | 17.7 | 17.7 |
| 30-minute casual | $5,648 | $3,341 | 0.4 | 21.7 | 21.7 |
| Mixed economy | $6,251 | $2,603 | 0.6 | 18.4 | 18.4 |

The matched saver/one-cab/fleet comparison illustrates the tradeoff: fleet reinvestment leaves much less first-hour cash but raises future income and reaches the modeled home sooner. A purchase may also lower the player's current balance-based level. The model preserves already-owned assets and achievements and lets a player keep taking local jobs when cash falls. Outcomes vary with the assumed prices, utilization and retained jobs; do not read the median wallet curve as one person's history.

With the illustrative event cadence enabled, first-home medians for those same seven paths become 16.0 / 14.8 / 13.6 / 15.4 / 16.1 / 19.8 / 16.6 hours. The model assumes a 2× global event for 30 minutes every four hours, and 1.5× for ten minutes after this player's own Dome win, capped at 3×. Other players' wins and room-wide uptime are not simulated. Eligible task pay and cab income are multiplied; awards and repeatable checkpoints are not. The winning match pays before its room bonus starts. These invented event frequencies are sensitivity inputs, not a live schedule.

## Achievement redesign and city access

The earlier comparison unlocked city badges in level-sized groups and paid level 1–3 grants. The redesigned case replaces those early grants with named city rewards at the **same current-wallet threshold used for access**:

| City | Cash gate | One-off cash |
| --- | ---: | ---: |
| Oakland | $10,000 | $1,000 |
| Berkeley | $20,000 | $1,500 |
| Fremont | $50,000 | $2,000 |
| San Mateo | $75,000 | $2,500 |
| Palo Alto | $100,000 | $3,000 |
| Mountain View | $150,000 | $4,000 |
| San Jose | $250,000 | $5,000 |

The first physical arrival in each of the four modeled non-SF cities is a separate $500 achievement. Once earned, each named city and arrival achievement persists through spending and re-entry, while the **current balance** still determines entry for a later trip. A player already in a city can continue taking local jobs. Level 1–3 cash bundles are **not additionally paid**; distinct once-only level 4–8 grants remain $2.5k/$5k/$5k/$10k/$20k. The before case retains the earlier access thresholds, including $10k for both Oakland and Berkeley. The unlocked but unvisited three cities have no modeled jobs or location validation.

New action-based one-off achievements, each paid once per account and threshold in the proposal:

| Action | Thresholds | Awards in order |
| --- | --- | --- |
| Distinct delivery drop-offs | 6 / 10 / 15 / 20 / 25 | $500 / $1k / $2k / $4k / $8k |
| Consecutive deliveries without a citation | 13 / 22 / 37 / 60 / 100 | $500 / $1k / $2k / $4k / $8k |
| On-time deliveries | 10 / 20 / 50 / 100 / 200 | $500 / $1k / $2k / $4k / $8k |
| First cab earns $20k gross | Once | $2k |

The first cab costs $25k and awards $5k upon ownership, so $20k of that cab's gross income repays the remaining amount under the model's no-cost assumption; the later $2k award is additional. Multiple cabs do not each mint the first-cab earnings achievement. City and global delivery chains, cab ownership, cosmetic, vehicle-kit and landmark awards remain distinct. If first discovering a landmark and first delivering there happen in the same action, the redesign combines their cash into **one** achievement notification, rather than rewarding the same action twice.

These mechanics require product work. The drop-off model uses six abstract IDs in each of five cities, 30 total, sampled uniformly; their corresponding destinations, eligibility and reachable routes are not verified. Only qualifying deliveries count; repeating a destination does not advance the distinct total. An independent assumed 4% citation chance resets the clean streak; on-time status independently succeeds 80% of the time and does not affect modeled fare. Neither probability is measured. San Mateo, Palo Alto and Mountain View are not physical stops in this model. Landmark availability defaults to three abstract IDs per modeled city. Counter persistence, cheating resistance and named location mapping are unimplemented.

## Pacing results

P90 longest gap means: for each run, count its longest consecutive run of five-minute bins without a one-off achievement in the stated interval, including the edge of the interval; take the 90th percentile across 250 run-level maxima. It is not the percentile of individual windows. First-two-hour blocks count city badges, but exclude the initial SF grant, unranked one-off check-ins and repeatable checkpoints. Averages do not establish a consistent experience.

| Path | Early P90 gap before → redesigned | Hours 2–8 P90 gap redesigned | Early 30m blocks below 2 / at 2–4 / above 4, before | Same blocks, redesigned |
| --- | ---: | ---: | --- | --- |
| Delivery saver | 40 → 25m | 80m | 24.9% / 33.0% / 42.1% | 1.4% / 37.9% / 60.7% |
| First cab | 40 → 20m | 80m | 25.2% / 22.9% / 51.9% | 1.6% / 27.8% / 70.6% |
| Fleet reinvestor | 35 → 25m | 85m | 12.7% / 27.3% / 60.0% | 2.4% / 20.4% / 77.2% |
| Customizer | 30 → 25m | 85m | 13.0% / 24.6% / 62.4% | 1.1% / 18.5% / 80.4% |
| Delivery explorer | 30 → 20m | 65m | 3.8% / 34.3% / 61.9% | 0.0% / 11.8% / 88.2% |
| 30-minute casual | 45 → 25m | 75m | 19.0% / 28.7% / 52.3% | 3.0% / 36.1% / 60.9% |
| Mixed economy | 25 → 15m | 60m | 3.2% / 25.9% / 70.9% | 0.1% / 12.4% / 87.5% |

All seven scripted paths meet the provisional **early gap** threshold; none meets the block-cadence target reliably. Adding one-off milestones reduced early dry stretches but introduced or preserved too many busy blocks, especially for explorers and mixed players. Later one-off gaps remain long: the model has a finite set of landmarks and destinations, and higher tiers take longer. Do not say the economy is smooth based on first-two-hour P90 alone. Group simultaneous achievement notifications into a concise summary without changing their individual award times or cash; that may make bursts less intrusive, but does not change these counts or mint less money.

With eight instead of three **abstract** landmarks per city, hours 2–8 P90 gaps change from 80/80/85/85/65/75/60 minutes to 75/75/80/85/55/70/60 for the seven paths. The explorer's early above-four share also rises from 88.2% to 91.7%. More theoretical landmarks improve some gaps but do not establish the map has reachable, fun objectives. A separate first-cab lifetime-income chain at $20k/$50k/$100k/$200k/$400k, instead of just the $20k break-even award, changes the mixed path's late P90 gap from 60 to 55 minutes and leaves the other six unchanged. These are sensitivities, not proof that more badges fix pacing.

## Optional rotating delivery contracts

A tested **alternative**, disabled in the default chart and main results, shows one active contract at a time and rotates: two on-time deliveries, three consecutive uncited deliveries, then two distinct drop-offs. Each completion pays $650 and replaces the existing $750 per three deliveries checkpoint; the two mechanisms **never stack**. A citation resets the clean contract; only a qualifying delivery advances it; repeating a destination does not advance the distinct contract. Progress can be displayed after each qualifying delivery, including incomplete contracts. Contracts are repeatable goals, not one-off achievements, and must not inflate the achievement count.

In the 250-seed eight-hour comparison, the P90 longest 2–8h gap with no **completed goal** (one-off achievement, one-off check-in, unlock or repeatable completion) changes from 20/20/20/20/20/25/25 minutes with the old checkpoint to 25/25/25/25/25/30/25 with contracts. Counting visible **partial contract progress** as feedback separately gives 15/15/15/15/15/20/15 minutes. The old checkpoint was not modeled with a progress indicator, so this is not an apples-to-apples improvement in completion frequency. Median eight-hour delivery-repeatable cash is approximately unchanged: saver $20,250 → $20,150 and casual $14,250 → $14,300; other paths differ by $100–$450. Achievement-free gaps remain long. Test the progress UI and the tradeoff before adopting it; neither path is an implemented mechanic.

## Optional side games

Dome, race and parking are for variety, not primary earners. The candidate pays an expected 30% / 35% / 30% of same-tier delivery income per minute before bonuses, respectively, using assumed task duration at acceptance. For a 50% Dome win chance, pay 70% of its target on completion and 60% more on a win: at tier 0 the $1,950 target means $1,365 for a loss and $2,535 for a win. Race and parking tier-0 examples are $1,930 and $1,650. The proposed scenic-contract rate is 65%. Actual matchmaking, task times, meaningful participation, AFK protection and collusion resistance are unmeasured. Special events can make side-game participation useful without making it the primary economy.
