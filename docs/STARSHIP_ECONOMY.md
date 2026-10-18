# A shared Starship goal

**Launch design, 2026-10-18.** Tesland has a room-wide Mars fund today. The proposed next step is a game-wide launch meter that grows as players earn across rooms, alongside the [persistent economy](ECONOMY.md).

## What counts toward $1 billion

Every player's eligible earnings count **automatically** toward a game-wide, first-season goal of **$1,000,000,000**. Players keep their earnings as the Community Launch counter advances. Reaching the target funds a first Super Heavy/Starship launch from the Fremont spaceport, followed by retirement of the game season and public recognition of its contributors.

Count each eligible, authoritative income event once: delivery and pickup pay, operating Cybercab earnings, one-time achievement awards and other explicitly enabled game-issued activity rewards, including their eligible event multipliers. The counter records the full reward even if the player later spends it or drops a level. Do not count transfers, gifts, player-to-player sales, property resale proceeds, refunds, loans or the same money moving between wallets; do not multiply progress again merely because cash changes hands. New reward types need an explicit classification as eligible or ineligible. If a counted reward is voided as fraudulent or erroneous, reverse its contribution with an auditable adjustment; ordinary spending and fines do not reverse legitimate lifetime earnings. The global total is the sum of distinct eligible events, not a sum of current balances, and is not capped per transaction just because it crosses the target.

The first season begins at the start of reliable earnings records. Backfill earlier earnings **only** when a stable account identity and unique, authoritative source event can be verified; current session-only cash and anonymous session IDs do not justify inventing a lifetime balance. Preserve account lifetime earnings across future seasons, but define any later season's launch counter using new eligible events in that season so the same old income does not immediately trigger it again. Season-two targets and asset carryover remain design decisions.

The existing per-room Mars fund is a **different** design: players contribute session cash to a durable fund for one named room. It is not the game-wide lifetime-earnings counter and the two are not linked. Do not count a deposit as new earnings or silently merge them. Integrating the two requires a separate product and implementation decision; automatic game-wide progress is the selected goal here. See [CONTRACTS.md](CONTRACTS.md#mars-mission) for the current room mission.

## How long might it take?

This first comparison holds player count, daily active time and hourly earnings constant from day one. It shows how those inputs affect the target; the seeded population run below adds progression. An active hour means time spent playing.

`eligible dollars/day = daily active people × active hours/person/day × eligible dollars/active hour`

`calendar days to $1bn = $1,000,000,000 ÷ eligible dollars/day`

| Illustrative population | Daily active people | Active hours each/day | Eligible income/active hour | Eligible income/day | Total player-hours | Time to global goal |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 10 | 1 | $75,000 | $750,000 | 13,333 | 1,333 days, about 3.7 years |
| Growing | 50 | 1 | $125,000 | $6,250,000 | 8,000 | 160 days, about 5.3 months |
| Larger, later-stage | 250 | 0.5 | $250,000 | $31,250,000 | 4,000 | 32 days |

The same 50 people provide **50 player-hours per calendar day**: `50 × $125k = $6.25m/day`, and `$1bn ÷ $6.25m/day = 160 days`. If no one plays or there are no eligible earnings, the goal is never reached in this constant-rate model. A bigger population or faster earning rates can make the billion-dollar milestone arrive much sooner than intended. The target is meant to be distant, but the examples do not establish that it will be; calibrate it against observed populations, activity and income by tier before committing to season timing. Do not quietly raise difficulty mid-season to stretch the clock.

These are daily **distinct-player** and player-hour assumptions, not simultaneous room occupancy. As a counterfactual only, if the growing example's earning activity were evenly split among five independent $1bn room goals, each room would earn $1.25m/day and take 800 days. The selected **global** counter pools the same activity and takes 160 days, regardless of which rooms people use. This calculation does not simulate matchmaking, scheduling, room migration, event load, the separately discussed donation fund or capacity. The game's provisional room capacity is not evidence that 250 people can connect simultaneously.

Reproduce the table with `pnpm exec tsx scripts/economy-starship.ts`; the focused tests check units, zero-rate behavior and the distinction between global and counterfactual room totals. The script does not project one individual's wallet, donations, purchases, changes in job tier or a distribution of possible outcomes.

## A population run using the delivery simulations

The [delivery-led player model](ECONOMY_FIVE_MINUTE.md) supplies a second estimate that includes its changing wallet levels, purchases, cab income and one-off awards for the first 40 active hours. Split the population 30% delivery saver, 30% first-cab owner, 20% fleet reinvestor and 20% 30-minute casual. Everyone in a row plays every day at the stated duration. There are no event multipliers. The first SF grant counts once per player; purchases do not subtract from the meter. After 40 hours, each player repeats their own average **recurring** income from hours 32–40, with no repeated achievement or unlock awards. This tail holds earning patterns fixed and does not predict later upgrades or new content.

| Population and active time | $100m | $250m | $500m | $750m | $900m | $1bn |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 players × 1 hour/day | day 105 | day 281 | day 575 | day 869 | day 1045 | day 1162 |
| 50 players × 1 hour/day | day 17 | day 46 | day 105 | day 164 | day 199 | day 223 |
| 250 players × 30 minutes/day | day 8 | day 18 | day 33 | day 49 | day 61 | day 70 |

With 50 daily players, the model earns $179.1m by day 30 and $438.2m by day 90. A larger community can reach the same target in just over two months, so **$1bn is not automatically a long season**. The first 40 hours include the selected players’ assumed university or SFO contracts. These runs keep the same people and schedule throughout; they omit new arrivals, departures, trading, changing event schedules, and all changes in earning behavior after the first 40 hours. They are a design instrument, not a traffic forecast. `pnpm exec tsx scripts/economy-community.ts --json` reproduces the daily thresholds. Set the opening target before a season using observed player-hours and income; retain it throughout that season. The separate [developer experiment](ECONOMY_FIVE_MINUTE.md#developer-path) reaches 20 floors in a median 101–163 active hours, compared with 223 active hours per person at the finish of the 50-player scenario. The player mix and spending choices differ, so these results do not guarantee any particular tower is completed before a launch.

## Launch, retirement and recognition

1. Show a launch meter with the global total, target and each person's own credited lifetime earnings. Mark 10%, 25%, 50%, 75% and 90% with visual construction stages at the Fremont pad; let people view the next stage and revisit earlier ones. These moments do not mint extra cash. Show the eligible-source explanation alongside the meter. Make clear that this is automatic progress and not a donation or a spendable treasury. Players can participate without an additional paywall.
2. On the first verified threshold crossing, record one immutable launch/season ID and a consistent contributor snapshot. Stop accepting further progress **for that completed season**, but keep recording valid lifetime earnings; decide how new-season accrual begins before announcing a new target. Freeze or correct the result if the crossing is subsequently invalidated by fraud, using the same audited adjustment rules.
3. Schedule and announce a shared launch celebration, with a replay or spectator view for players who are offline or cannot fit in a room. Capacity, synchronized playback, countdown length and actual rocket behavior remain to be designed and tested. Do not require everyone to be present at the same instant.
4. Mark the season and its room history retired/read-only after the event, preserving an accessible hall of fame and replay. Do not silently delete player identities, lifetime earnings, persistent property or other paid-for assets: ownership and next-season rules require an explicit design before retirement is built. Preserve the ability to play and visit the world in a successor season rather than treating the global victory as permanent service shutdown.
5. Honor every account with a positive verified eligible contribution in the snapshot, regardless of amount or whether they are online at launch. Offer an opt-out or a privacy-safe display name, preserve the verified contribution total separately from the chosen name, and make clear whether a leaderboard displays amounts or merely names. Avoid pay-to-be-listed or exposing account identifiers.

## Trust and implementation work

The online game needs durable, authenticated account identity before a game-wide lifetime total can be attributed reliably. Anonymous display names, client-submitted amounts and the existing ephemeral room session are insufficient. The source of every qualifying reward must be server-authoritative, with a durable, unique event ID and ledger entry. Retries, reconnects, server restarts, redeploys and room transfers must not issue or count the same event twice. Accrual-based cab income needs stable, non-overlapping intervals or equivalent idempotent settlement, rather than a client timer.

Use an authoritative durable ledger to atomically settle the reward and record its associated global progress, or an idempotent, recoverable delivery protocol with a reconciler if these steps cross storage boundaries. Preserve transaction IDs, contributor attribution and audit adjustments so a partial failure can be retried without double-credit or lost progress. A single serializable launch transition must fence concurrent threshold-crossing events; a failed announcement or animation must be safely retryable without a second launch or duplicate hall-of-fame entries. Display a last-confirmed total and a connection/error state when aggregation is unavailable instead of claiming an unverified live total.

Server-validate earnings, completion, event eligibility and rate limits; investigate automation, collusion, recycled or duplicate rewards and sybil accounts before a launch is treated as conclusive. Transfers and market transactions must not create progress from the same dollars circulating repeatedly. Test out-of-order and duplicate rewards, crash/retry at every accounting step, corrections near the threshold, two simultaneous qualifying events, room moves, replay and opt-outs. A global goal across independent room processes is new coordination work; a durable per-room balance alone does not provide it. No throughput, anti-cheat effectiveness, physical venue or launch timing is established by this proposal.
