# Economy progression simulations

**Design experiment, 2026-10-18.** These are hypothetical players using proposed rules, not measurements of the current game or evidence that the experience is fun. The model deliberately makes simplifying assumptions about jobs, players and multiplayer. Its results identify places to tune and playtest; they do not prove that progression is smooth. See [ECONOMY.md](ECONOMY.md) for the economy proposal and current-game caveats.

## Reproduce

```sh
pnpm exec tsx scripts/economy-progression.ts --players 250 --hours 40
pnpm exec tsx scripts/economy-progression.ts --players 250 --hours 40 --json
```

Each profile runs 250 deterministic random seeds, 1729–1978, for 40 **active hours**. The 10th, 50th and 90th percentiles describe the assumed simulator distribution; they are not forecasts, confidence intervals or measured player behavior. Home-time percentiles only include simulated players who reached a first home; each row below includes the completion count. The script checks that each player's income minus spending and fines equals the wallet balance. Reported income components are separate medians, so their sum need not equal the median total.

The previous [first-home napkin calculation](ECONOMY.md#historical-first-home-napkin-math) used fixed 102-second jobs and omitted landmark bonuses. This experiment uses variable, generally longer jobs, different routes and play styles, so its original-rule results are not directly comparable to that earlier 7h05 estimate.

## Players and assumptions

| Hypothetical profile | Session | Purchase and activity pattern |
| --- | ---: | --- |
| Delivery saver | 60 min | Drives jobs, no cabs or cosmetics; prioritizes a second property after the first. |
| Casual cab owner | 30 min | One cab at 65% active utilization, a paint purchase, two vehicle upgrades, occasional Dome, exploration and other activities. |
| Fleet builder | 90 min | Three cabs before the first home, five afterward, 80% active utilization, two early vehicle upgrades; prioritizes the second property. |
| Landmark collector | 45 min | One cab at 65% utilization, more exploration and landmark deliveries, cosmetics and three vehicle upgrades; models four construction payments. |
| Dome regular | 60 min | One cab before home and two afterward at 70% utilization, with a higher chance of choosing a Dome match, plus cosmetics and vehicle upgrades. |

These are specific scripted strategies, not samples of actual player types. Activity probabilities are applied at task boundaries, not fixed percentages of a session. Purchases occur automatically in the profile's specified order as soon as cash and gates allow; players do not deliberately save for other choices. Tasks can span session boundaries. Cabs earn only during active sessions, at the assumed utilization; no offline earnings or cab operating costs are modeled. One cab produces $15,000 per active hour at 100% utilization before events. The model credits first-time cab awards and uses the proposed $25k/$50k/$100k/$200k/$400k purchase ladder.

A simulated player starts at $2,500, credited as the SF unlock. Every 25 jobs in a city, the strategy travels to the next city if its balance permits entry, with five minutes of travel. The route is SF, Oakland, Berkeley, Fremont and San Jose; each has three abstract landmarks. This is a deliberately simplified itinerary, not a survey of available jobs or actual travel times. Job fares vary uniformly by ±20%, and the duration varies by ±20%, is multiplied by the profile's speed factor and rounded up to whole minutes. The original rule set uses an illustrative $2,150 and three-minute base job; the candidate uses higher-paying, longer cash-tier contracts. The candidate also lets a player already in a city keep that city's local contract tier after spending lowers their level. Entry to a relocked city and higher-tier contracts still depend on current balance. Construction on an owned plot is always reachable in this abstract model.

The candidate's example contract tiers run from $3,000/3 minutes at level 0 to $26,000/8 minutes at level 8 before variation, multipliers and profile speed. These contracts are proposed, not implemented or validated routes. Money from a delivery, each landmark, city and total-delivery achievements can stack. Candidate landmark chains pay $15,500 through ten landmark deliveries, compared with $77,500 in the original proposal. Through 250 jobs, candidate total-delivery one-offs pay $117,500: $77,500 for five ranked achievements, $2,500 for the early 3/5-delivery bonuses, and $37,500 in further check-ins. A repeatable $750 every three deliveries adds $62,250; the original chain pays $332,500 in one-off awards. Each city's candidate delivery chain also adds $6,000 in one-off check-ins. City-award and other schedules are in the script. Citation risk is an illustrative 4% per delivery, for $750–$2,999 capped at the current wallet; real enforcement, losses and negative balances are not simulated.

Unless a comparison disables bonuses, the model assumes a **2× global event for 30 minutes every four hours**, with each session starting at a random offset. This cadence is an experiment, not an agreed operating schedule. A player who wins a 5–8-minute Dome match gets a 1.5× room bonus for ten minutes; wins are independent 50% chances, another win refreshes it, and bonuses stack to 3×. The model triggers the room bonus only from this player's wins, so it does not capture other players triggering it. The candidate pays $1,200 for a completed match plus $1,800 for a win; the original proposal pays no repeatable match income. Candidate races pay $2,500 and parking challenges $1,500, with 4–7-minute durations and one-off milestones. No queue, travel to the arena, opponents, anti-farming limits, match-making delay or real multiplayer effects are modeled.

## First-home results

The candidate uses wallet levels 0–8 at $0, $10k, $50k, $250k, $500k, $1m, $2m, $4m and $8m, respectively. Its default property market requires **level 6: $2m current cash**, even though the city starter plot is $400k and the house costs $600k. The original proposal opens the market at level 3/$250k. Levels fall immediately after spending; achievements are paid once.

| Profile | Original median home, h | Candidate plot, h | Candidate first home P10 / median / P90, h | Reached home by 40h |
| --- | ---: | ---: | ---: | ---: |
| Delivery saver | 12.3 | 16.0 | 15.3 / 16.0 / 16.7 | 250/250 |
| Casual cab owner | 14.0 | 19.6 | 18.6 / 19.6 / 20.6 | 250/250 |
| Fleet builder | 9.6 | 13.4 | 12.7 / 13.4 / 14.1 | 250/250 |
| Landmark collector | 11.7 | 19.7 | 18.8 / 19.7 / 20.6 | 250/250 |
| Dome regular | 15.4 | 20.6 | 19.3 / 20.6 / 21.9 | 250/250 |

The $2m gate is a major additional savings requirement, not a $1m entry hurdle. At the instant it opens, the player can already afford both the $400k plot and the $600k build. The scripted purchase loop therefore buys both in the **same minute**, including all four installments for the staged collector. The median first-home balance is still approximately $1.03m. Consequently, the candidate does not simulate any plot-to-house waiting or intermediate construction progress. This outcome follows the gate and automatic purchase strategy; it is not evidence that four stages would be uninteresting in another design.

A controlled delivery-saver sensitivity comparison keeps the candidate's other rules and changes just the market threshold. A $1m gate reaches both plot and completed home at a median **8.7 active hours**, with about $32k left; the late-game $2m gate gives **16.0 hours** and about $1.033m left. These design alternatives have a major impact on first-home timing and post-purchase level. Even the $1m gate allows an immediate plot and build under this automated strategy. If visible construction is a goal, test partial-building purchases or an explicit wait/choice within the late-game gate rather than assuming four prices alone create a journey.

## Cabs, events and later property

In a matched delivery-saver profile with events disabled and 75% cab utilization, the median first-home times were:

| Cabs bought before home | 0 | 1 | 2 | 3 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Home time, active hours | 17.7 | 16.2 | 15.5 | 15.1 | 16.9 |

Five cabs build a larger earning asset, but their upfront cost postpones the first home relative to three. This is an investment tradeoff, not necessarily a defect. In the Dome-regular profile, enabling both modeled event types changes the median home time from **23.9h to 20.6h**. The match payout and wins remain enabled in both runs; only multiplier bonuses change. These are matched-profile distributions, not strict paired replays of identical jobs and wins: different cash and timing change subsequent random draws.

The second home exposes a much sharper balance drop. In the candidate delivery-saver profile, the second $800k plot plus $1.2m build finishes at a median **23.2h**. The balance after the build is about **$27.6k**, with the median level falling from **5 to 1**. None of the 250 simulated savers recovered their pre-build level by the 40-hour horizon, while the scripted strategy continued to buy home upgrades. This is not a claim that recovery is impossible or that all players would spend that way. A comparison that waits until an extra $1m remains after the second build completes it at **30.6h**, leaving about **$1.02m** and dropping from level **6 to 5**; none recovered level 6 by 40 hours. The reserve is a simulated choice, not a requirement to impose on players.

The fleet builder completed the second home at a median 20.6h, falling from level 5 to 1 with about $32.4k remaining. **247/250** recovered their pre-build level by 40h; their median time to recovery was **17.0h**, conditional on recovery and on the subsequent scripted purchases. Recovery figures must always report how many players did not recover: a median of only recoveries can hide a long tail.

To separate a recovery strategy from continued spending, another delivery-saver comparison stops buying upgrades after the second home. With all job tiers gated by wallet, **250/250** recovered their pre-build level by 40h, with a conditional median of **8.9h** after construction. Allowing jobs at the current city's local tier instead gives **250/250** recoveries with a median of **8.3h**. The modeled itinerary has reached San Jose, whose local jobs retain a level-3 floor; someone stranded in a lower-tier city would have a different floor. The 0.6h modeled improvement is modest, and the two seeded strategies can diverge in later jobs and random draws. The no-reserve baseline above keeps buying upgrades, so its 0/250 recovery result is not a direct measurement of unavoidable recovery time.

## What the activity counters can and cannot say

The model counts milestones, defined as cash achievement awards, unlock rewards, purchases and entering a new city. Repeated tiers can count, and several events in the same minute count once. Its progress-gap metric additionally counts every-three-delivery checkpoint. It also computes an approximate option count from assumed activity families, cities, contract tiers and owned amenities, plus a count of currently affordable next purchases. These are **design proxies**, not measured player engagement or a list of verified implemented features. In particular, the contract-choice count is an approximation: the simulator automatically selects a contract tier rather than presenting a player with an actual choice.

| Candidate profile | Milestone events in first 1h / 4h, medians | Longest milestone gap in first 8h, median | Modeled option count at 1h / 4h / 8h / 24h, medians |
| --- | ---: | ---: | ---: |
| Delivery saver | 6 / 18 | 0.6h | 8 / 9 / 10 / 15 |
| Casual cab owner | 8 / 21 | 0.7h | 10 / 12 / 13 / 21 |
| Fleet builder | 8 / 24 | 0.6h | 9 / 11 / 13 / 19 |
| Landmark collector | 9 / 27 | 0.6h | 9 / 11 / 13 / 21 |
| Dome regular | 7 / 19 | 0.8h | 10 / 11 / 13 / 21 |

The candidate adds unranked check-ins between the five ranked total- and city-delivery achievement tiers. In a matched-profile comparison, these reduce the median longest milestone gap in the first eight hours from **1.4h to 0.6h** for the delivery saver and **0.7h to 0.6h** for the landmark collector. Median home time changes from 16.5h to 16.0h and 20.1h to 19.7h respectively. These check-ins also add money, and a cash award is not necessarily a meaningful new experience; this comparison does not establish that the game feels better.

The median longest milestone gap over the full 40h is 4.1–6.5 hours across these candidate profiles. The first-eight-hour **progress** gaps are shorter, 0.3–0.6h, partly because every-three-delivery cash checkpoints are counted. Neither number measures the time until the next genuinely new activity. Option counts mix separate kinds of affordances and can rise merely because something was purchased; do not treat the totals as a fun score or compare them to an implementation inventory.

## Remaining tuning and playtest work

- **Protect access after spending.** The local-contract floor reduces the harshest earnings collapse for someone already in a city, but the second-home example still relocks higher tiers for a long time. Show the before/after level and available jobs before purchase; test saving a reserve and recovery under players who do not automatically spend every dollar. Explicitly specify how owners can reach and build on a plot in a relocked region.
- **Make late-game property engaging.** $2m cash before a $1m home produces a long saving phase and an immediate finished home in this model. Test visible stages and meaningful choices within that late-game gate, along with traversal and relocking. Compare 30-minute-session players in active hours and calendar sessions, rather than treating 20h as a single sitting.
- **Make alternative activities worthwhile.** At the model's 50% win rate, $1,200 participation plus an extra $1,800 for a win averages $2,100 per 5–8-minute match, about $19k/hour at a 6.5-minute average before achievements, cab income, waiting and other effects. The repeatable race/parking payouts are likewise modest relative to delivery contracts. Measure their full rewards and enjoyment in playtests; consider better repeatable rewards without making short, collusive matches the best way to mint money.
- **Test diverse earning paths and sinks.** The candidate reduces the landmark windfall, but its invented job-tier rates and automatic progression are not measured. Compare city and landmark routes, cosmetics-first players, loss-heavy Dome play, low cab utilization, no events, large fleets, property trading and a player who stops after a few sessions. Check inflation, collusive transfers, idle earnings, limited land supply and fee revenue across multiple players; this single-player wallet model does not simulate a market.
- **Instrument the real loop before tuning.** Record delivery duration and pay distributions, time to first purchase and home, event uptime, cab utilization, rank changes, post-purchase recovery, how often players select each mode, and where sessions end. Playtest desktop and touch, and explicitly look for long stretches with no meaningful new decision or activity. Only then choose prices and confidence targets.
