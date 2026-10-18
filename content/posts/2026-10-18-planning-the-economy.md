A delivery pays you now. A Cybercab costs you now, then earns while you play. That tradeoff is the heart of the economy we’re designing for Tesland: spend to grow faster, save for access, or make your car and home feel like yours.

We modeled players in five-minute slices to see how those choices feel before building them. Try the investment model below, then see the longer simulated paths. The numbers are fictional game dollars and design proposals, not measurements from real players. Tesland currently has session delivery cash and achievements; persistent wallets, income-producing Cybercabs, property and most of the systems below still need to be built.

## Spend money to make money

A first Cybercab is proposed at $25,000, with a $5,000 one-time ownership award. At the model’s assumed 75% utilization, it earns $11,250 per active hour. It does not earn while its owner is offline in these scenarios.

The interactive example holds delivery income steady so you can see what the purchase itself does. The fuller simulations later include changing levels, one-off awards, city travel and other choices.

<link rel="stylesheet" href="/blog/economy/investment-lab.css">
<link rel="stylesheet" href="/blog/economy/article.css">

<section id="investment-lab" class="investment-lab" aria-label="Investment lab">
<p>Example: starting with $2,500 and earning $60,000 per active hour from deliveries, you can buy a $25,000 cab after 22½ minutes. The purchase drops your wallet by $20,000 after the $5,000 award. At 75% utilization, it earns $11,250 per active hour and your cash catches the save-only path about 1 hour 47 minutes after purchase, or 2 hours 9 minutes into play. This illustrative model excludes other awards, events, costs and tier changes; it does not estimate resale value.</p>
</section>

<script type="module" src="/blog/economy/investment-lab.js"></script>

The dip is real: paying for the cab leaves less in your wallet and can lower your current level. Over time, its earnings can make up that cost. A cosmetic is a different choice: you spend because you like it, rather than because it increases income. Neither return is guaranteed; utilization and task availability are assumptions to test.

## The loop: earn, choose, unlock

A new driver starts in San Francisco, runs deliveries, discovers places and earns one-off achievement cash. The growing wallet opens new regions and better contracts. You can buy a cab, customize your ride or save for the next threshold. Eventually, property gives you a place to build and a reason to keep earning.

There is no proposed XP bar. **Your level follows your current cash balance.** Spend it and the level can go down; earn it back and the level returns. Already-earned achievements and owned items stay yours. A player already in a city can still finish a job and use local contracts even after spending drops their level; leaving and entering again may require rebuilding the balance. An owner can always reach and build on their own plot, even after dropping below the property-market gate.

| Wallet | Level | Proposed access |
| --- | ---: | --- |
| $0 | 0 | San Francisco, Marin and starter jobs |
| $10,000 | 1 | Oakland |
| $50,000 | 2 | Fremont and SFO |
| $250,000 | 3 | San Jose |
| $500,000 / $1m | 4 / 5 | Higher-paying contracts |
| $2m | 6 | Property market and advanced contracts |
| $4m / $8m | 7 / 8 | Luxury and estate contracts |

Those thresholds are inclusive and use **spendable wallet**, not lifetime earnings. Other cities open between levels: Berkeley at $20k, San Mateo at $75k, Palo Alto at $100k and Mountain View at $150k. A first city unlock pays once per named city; revisiting a level does not repay it. Before a purchase, we should show the cash and level it will leave you with.

## What can I do with my money?

The catalog below is the plan we want to test. The prices are starting points, not an in-game store today.

- **Deliver and explore.** Starter jobs are modeled around $3,000 for three minutes, scaling to $26,000 for an eight-minute top-tier job. Routes, timing and actual achievable income still need playtesting. Discover cities, deliver to landmarks and earn cash from milestones.
- **Build a Cybercab fleet.** The first five cabs cost $25k, $50k, $100k, $200k and $400k, with one-off ownership awards of $5k, $10k, $20k, $40k and $80k. Dispatch them while you play, find them on the map and put your name on them. Later cabs cost more and take longer to pay for themselves.
- **Make a car yours.** Paint starts at $2k, decals and lettering at $5k, wheels and trim at $15k, wraps and fleet branding at $50k, and premium effects at $150k. Early vehicle or flight kits are proposed at $10k, $20k and $40k. Ordinary available cars remain free to drive; a purchase is not required to join the fun. BYD and Rivian models, the Lucid Air, Hyundai IONIQ, Kia EV9, Chevrolet Silverado EV and Ford F-150 Lightning are proposed fleet additions, not purchases in this economy plan.
- **Buy a home or build one.** Property is late game: reach $2m in your wallet to enter the market. A ready-built starter home costs $1m, or buy a $400k starter plot and build for $600k. More desirable plot-and-build packages start at $2m, $4m, $8m and $16m. You may own one purchased home at a time; additional homes are built on plots you acquire. Two garage spaces come with a home, and teleporting home is free.
- **Improve your place.** Extra garage spaces are proposed at $50k, $100k, $200k, $400k and $800k; personal chargers at $25k, $50k and $100k; and launch or thermal upgrades at $50k, $100k and $200k. Their effects still need design.
- **Trade with other players.** Guaranteed instanced starter plots protect access; a finite supply of attractive world plots makes location matter. Players can set any resale price. A proposed 5% fee leaves the economy, while the rest goes to the seller. Trading cosmetics or collectibles needs separate item and marketplace rules.

Rocket Dome, racing and parking are side games: play because they are fun or to complete their achievements. They should pay less than focused deliveries. A Dome win could give the whole room 1.5× eligible earnings for ten minutes; a separately scheduled global event could give everyone 2× for 30 minutes. The bonuses stack up to 3× and apply to delivery, active-cab and verified activity pay, not achievement awards. These are occasional bonuses, not required work shifts.

## Money sources, money sinks and inflation

A delivery fare or achievement award **creates** game money. A city-sold plot, construction fee, shop cosmetic or upgrade **removes** it. That removal is a *money sink*: the dollars leave players’ wallets instead of going to another player.

A player-to-player sale is different. If a house sells for $2m, a 5% fee removes $100k and the seller receives $1.9m. The sale mostly moves existing money between players; only the fee is a sink. A player’s wallet can go down while the seller’s goes up without the game becoming poorer.

If the game creates money faster than players spend it, more cash can chase a limited supply of desirable plots and collectibles, pushing player-set prices up. Cosmetics and construction give players appealing places to spend, which can help moderate that pressure. A sink does not automatically prevent inflation, and raising a cosmetic’s price does not itself create inflation. We will need to measure money created, money removed, ownership and real market prices before tuning the knobs.

## Achievement pacing: new things, not just bigger numbers

Early progress should invite a player to try deliveries, places, customization and their first investment. Each achievement is a one-off cash award; repeatable checkpoints are tracked separately. We use two provisional checks over the first two active hours: two to four achievements per half hour, and no more than five consecutive empty five-minute windows for 90% of simulated players. A badge in every five minutes is not the goal.

The proposed early milestones reward different things: first visits to cities, on-time deliveries, a streak without a citation, distinct drop-offs and the first cab earning back its net cost. The larger delivery chains still mark 1, 10, 50, 100 and 250 jobs, with separate city and landmark goals. SFO, the Bay Bridge, the Dome, Salesforce Tower and Coit Tower are among the intended destinations; tower landings need an actual landable target. Discovering and delivering to the same landmark in one action would produce one combined notification.

We ran 250 seeded versions of seven delivery-led strategies: saving, buying one cab, reinvesting in a fleet, customizing, exploring, shorter sessions and a mixed approach. With events off, the first hour averaged **$5,648–$9,087 gross per five minutes**, depending on the path. That is before spending and fines; it is not take-home cash.

| Simulated path | First-hour mean gross / 5 min | Median first home |
| --- | ---: | ---: |
| Delivery saver | $7,279 | 17.7 h |
| First cab | $8,179 | 16.2 h |
| Fleet reinvestor | $9,087 | 15.2 h |
| Customizer | $7,185 | 17.0 h |
| Delivery explorer | $6,981 | 17.7 h |
| 30-minute casual | $5,648 | 21.7 h |
| Mixed economy | $6,251 | 18.4 h |

The first three use matched driving and travel assumptions, so they isolate the choice to save or buy cabs. The other paths also change play style or spending. These are active hours, not calendar time.

<figure>
<picture><source media="(max-width: 600px)" srcset="/blog/economy/earnings-cadence-mobile.svg"><img src="/blog/economy/earnings-cadence.svg" alt="Seven delivery-led paths show median gross earnings per five minutes across the first eight active hours. The fleet path earns more as cabs are added; earnings vary by path and time."></picture>
<figcaption>Median gross per half hour, divided by six for a five-minute rate. Purchases are not deducted.</figcaption>
</figure>

The new milestones bring the longest achievement-free run in the first two hours to **15–25 minutes at the 90th percentile**, down from 25–45 minutes across the old versions of these paths. But this creates a different problem: **61–88% of early half-hour blocks have more than four achievements**. From hours two to eight, the 90th-percentile longest dry spell is still **60–85 minutes**. The gap target improves; the broader cadence is not solved.

One tested alternative rotates delivery contracts such as two on-time jobs or three without a citation. It replaces the existing modeled checkpoint, pays $650 on completion and shows progress along the way. In the later hours, its completed goals are actually a little less frequent than the old checkpoint; counting partial progress separately gives players visible feedback sooner. That is worth playtesting alongside bundled notifications and more distinct destinations. Repeatable goals are not fresh one-off achievements.

<figure>
<picture><source media="(max-width: 600px)" srcset="/blog/economy/achievement-cadence-mobile.svg"><img src="/blog/economy/achievement-cadence.svg" alt="Seven delivery-led paths show average one-off achievements in each half-hour. The first two hours often exceed the target of two to four, while later bars generally fall."></picture>
<figcaption>Achievements arrive in bursts early and thin out later. Bars are averages, so they also hide individual dry spells.</figcaption>
</figure>

The first home is deliberately late. With the $2m market gate, every simulated player reaches a $400k plot and $600k build within 40 active hours; median times range from **15.2 hours for the fleet reinvestor to 21.7 hours for the slower, 30-minute-session player**. The scripted purchases and build happen as soon as they are affordable, without construction delay. A cab can shorten that journey even though its purchase initially lowers the wallet.

In a separate run, a hypothetical 2× global event lasts 30 minutes every four hours. The matched saver, one-cab and fleet medians shift from **17.7 / 16.2 / 15.2 hours** to **16.0 / 14.8 / 13.6 hours**. Those paths do not play the Dome, so this comparison does not assume a win or its room bonus. The schedule is a modeling input, not a promised event calendar.

<figure>
<picture><source media="(max-width: 600px)" srcset="/blog/economy/wallet-curves-mobile.svg"><img src="/blog/economy/wallet-curves.svg" alt="Seven simulated wallet curves show saving, spending and investment over active play. Each eventually reaches the two million dollar property gate; purchases cause visible drops."></picture>
<figcaption>Median liquid wallet over time. The dashed line is the $2m market gate; the drops reflect purchases. Each point is a new median, not one person's history.</figcaption>
</figure>

The charts describe synthetic strategies, not people. They assume players keep choosing tasks and cabs operate only during active play. They do not include real traffic, charging, matchmaking or idle time. A five-minute window with no payment may simply contain an unfinished delivery; the half-hour view helps show the underlying rate.

## One shared destination: Mars

The long-term destination is a $1 billion Starship and Super Heavy launch at a fictional Fremont Tesla/SpaceX complex. Everyone’s eligible in-game earnings automatically advance one game-wide counter. **Nothing is taken from your wallet.** When the goal is reached, players can board for Mars, the room reaches its finale and the game honors everyone who helped.

The counter adds delivery pay, cab income and achievement awards once, including eligible bonuses. It does not count transfers, player sales or refunds: the same money changing hands should not advance the goal again. This counter is a shared achievement, not a money sink or a spendable fund.

How long does a billion take? At a constant $125,000 earned per active hour, 50 people playing an hour a day would reach it in **160 days**. Ten people at $75,000 an hour would take about **3.7 years**; 250 people playing half an hour a day at $250,000 an hour would take **32 days**. These are sensitivity examples, not forecasts: they assume the same daily activity and earning rate from day one. The target may need tuning before a season starts if we want it to remain a distant goal.

The current game already has a separate room-local Mars fund: players contribute session cash, and that room's fund persists. It does not supply the proposed game-wide total. The global counter needs persistent identities and authoritative, deduplicated earnings records. Its launch timing, room retirement and what carries forward still need implementation and playtesting.

The full [economy design](https://github.com/swyxio/TeslaRoadster6/blob/main/docs/ECONOMY.md), [simulation report](https://github.com/swyxio/TeslaRoadster6/blob/main/docs/ECONOMY_FIVE_MINUTE.md) and [Starship funding model](https://github.com/swyxio/TeslaRoadster6/blob/main/docs/STARSHIP_ECONOMY.md) are open source. The next test is people playing: what they buy, what they skip and whether every choice feels like a reason to take another drive.
