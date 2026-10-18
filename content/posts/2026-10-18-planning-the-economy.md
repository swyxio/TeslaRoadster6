The first version of our Tesland economy had a problem. In a simulation, 250 delivery-focused players all afforded a first home within 40 hours. None of the 250 Rocket Dome regulars or 250 race-and-parking players could. If you liked car soccer, our numbers told you to get back to work.

This is a design experiment, not a report from real players. Tesland is a Bay Area driving game with session cash and achievements; persistent wallets, Cybercabs you can dispatch to earn money, and property are proposals. We built a simulator to see whether those proposals made sense together.

## Make more than one way to earn

The simulator follows a courier, explorer, Dome regular, racer, fleet builder and someone who mixes activities. Each path runs 250 seeded variations for up to 40 active hours. Players choose tasks immediately, never wait for a match, and follow simple purchase rules.

In the first proposal, a Dome match paid $1,200 plus $1,800 for a win: about $2,100 per match at a 50% win rate. Delivery jobs paid much more, particularly at higher levels.

The revised model uses a delivery of the same difficulty as a reference. A starter delivery pays $3,000 over three minutes; a 6.5-minute Dome match targets about $5,530 on average at a 50% win rate. That's 85% of the comparable delivery rate, an initial tuning choice to test. A loss still pays roughly $3,871; a win adds about $3,318. Racing, parking and a proposed sightseeing contract have their own shares. Base pay is set when an activity starts, so taking longer doesn't increase it; any event multiplier applies at completion.

The next chart shows income in short sessions. Each bar is the median half-hour total divided by six, giving a five-minute rate. An interval with no payment can simply mean a match is still underway.

<picture>
  <source media="(max-width: 540px)" srcset="/blog/economy/earnings-cadence-mobile.svg">
  <img src="/blog/economy/earnings-cadence.svg" alt="Chart comparing modeled five-minute gross earnings across activity paths over the first eight active hours.">
</picture>

With bonuses off, every simulated path reaches a first home within 40 active hours. The median is about 18 hours for the courier, 20 for the Dome regular, 29 for a Dome player who never wins, and 15 for the player buying three Cybercabs. The model pays cabs only during active play, assumes 75% utilization and no operating costs. Real players may take longer; the Dome runs assume opponents are always available.

## The house is expensive on purpose

Before real estate, players should discover cities, try challenges, customize a car and dispatch a Cybercab. The proposed property market opens when your **current wallet** reaches $2 million. A starter plot costs $400,000 and a basic build another $600,000; a ready-built starter home also costs $1 million.

Buying the plot and house takes $1 million out of your balance, so your level can fall. The model lets you keep owned items and take local jobs in a city you're already in. Purchases and their timing affect the chart's median wallet curve.

<picture>
  <source media="(max-width: 540px)" srcset="/blog/economy/wallet-curves-mobile.svg">
  <img src="/blog/economy/wallet-curves.svg" alt="Chart of simulated wallet balances over active play time, showing the $2 million property threshold and drops after purchases.">
</picture>

The simulated player buys plot and house at the same opportunity: $2 million covers both. Splitting the price into installments won't make construction a journey by itself. We need actual choices or activities to test.

## Five minutes of progress

Achievements should point players toward something interesting and pay a one-off cash award. We count city-unlock badges and other one-off achievements separately from repeatable cash checkpoints.

For a first experiment, we looked for two to four achievements per half hour in the first two hours, with at most five consecutive empty five-minute windows for 90% of players. These are provisional targets, not a rule that every window needs a badge.

<picture>
  <source media="(max-width: 540px)" srcset="/blog/economy/achievement-cadence-mobile.svg">
  <img src="/blog/economy/achievement-cadence.svg" alt="Bar charts comparing mean one-off achievements in half-hour blocks for different simulated activity paths.">
</picture>

Five of seven paths miss the gap target. City unlocks can award several badges at once, then go quiet; half the courier's half-hour blocks have fewer than two achievements. The explorer runs out of new landmarks while tours keep paying, partly because the model initially included only three landmarks per city. With 20 imagined landmarks per city, 18% of five-minute windows in hours 4–8 contain an achievement instead of none; we still need to verify those activities exist and are fun. Other paths need distinct goals for a clean lap or a Dome contribution.

We also tried a $500 one-off award for physically visiting each new city. The 90th-percentile early gap drops from 50 to 35 minutes for the Dome player, and from 35 to 30 for the courier. Both still miss the 25-minute target, and extra awards can make early bursts worse. It's a useful next prototype, not a finished pacing fix.

## A bonus should include the player who triggered it

Special events could offer a global 2× bonus or a room-wide 1.5× after a Dome win, combining up to 3×. Our first version only boosted deliveries and Cybercabs. A player without a cab who won a match and kept playing soccer got no benefit from their own event.

The new experiment also boosts repeatable activity pay, while keeping one-off awards and checkpoints fixed. The winning match starts its bonus **after** it pays. With a simulated 30-minute global event every four hours and a ten-minute bonus after the player's own wins, the Dome regular's median first-home time falls from about 20 to 15 hours. Other players could keep a real room's bonus running longer; we need to measure that and test against win trading.

The [simulator and full results](https://github.com/swyxio/TeslaRoadster6/blob/main/docs/ECONOMY_FIVE_MINUTE.md) are open source. They're a way to find bad assumptions cheaply, not proof that a particular price or achievement is fun. That still takes people playing the game.
