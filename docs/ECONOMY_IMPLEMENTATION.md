# Economy implementation guide

**For contributors · 2026-10-18.** A player starts by driving and delivering, builds a wallet, chooses whether to spend or invest it, and eventually develops property. This guide records the choices that should survive implementation across separate features. [ECONOMY.md](ECONOMY.md) contains the detailed price and achievement tables; [ECONOMY_FIVE_MINUTE.md](ECONOMY_FIVE_MINUTE.md) contains the current simulation results.

## What is decided and what is tuning

These are the product decisions to preserve:

- Deliveries are the main career. Rocket Dome, races and parking are optional diversions with achievements; they should not become required or the most efficient path to progression.
- A player's **current spendable cash** determines their level. Spending can lower it; no separate XP bar or lifetime-earnings level gate is needed. Keep earned achievements, owned assets and research progress when the balance falls.
- Progress, owned Cybercabs and property should persist. Players can find their cabs, follow them, and see and customize their owner branding. Show the human driver's name and the owner's name when they differ.
- Real estate comes late. Each player can buy at most one completed home at a time, and can also buy empty plots and build on them. Allow multistory buildings and an eventual skyscraper career.
- The first home starts at $1 million. Owners can decorate, keep car configurations in a garage, add a personal charger or launch feature, and teleport home.
- A game-wide $1 billion Starship goal advances automatically from players' lifetime earnings. Players keep the money. The goal ends in a launch, a celebration, recognition of contributors and retirement of that game season or room.
- Achievements pay one-off cash, guide players toward features, and help unlock levels through the resulting wallet balance. City, delivery and landmark goals matter throughout the driving career.
- SFO research explores flight, Stanford explores speed, UCSF explores homes and property, and Berkeley explores energy efficiency.
- A dedicated luxury showroom sells exclusive, house-priced supercars and motorcycles in person; list individual models as achievement goals.

The exact level thresholds, fares, award sizes, cab rates, property tiers, floor prices, event duration and research rewards below are **design candidates**. They give teams a consistent starting point and must be playtested together. A simulation result is not a commitment to a particular playtime. Offline cab earnings, a market for collectibles and skins, and details of the next season remain open.

## What exists today

The held candidate branch adds a saved wallet and vehicle configuration, cash-based levels, delivery and regional milestones, the Vault collection and an automatic global income counter. It retains the earlier campus visit discounts and paint/decal workshop. [DELIVERY.md](DELIVERY.md), [UPGRADES.md](UPGRADES.md), [LUXURY_SHOWROOM.md](LUXURY_SHOWROOM.md) and [CONTRACTS.md](CONTRACTS.md) describe the candidate's rules. Recovery and isolation, the actual game and performance are still being verified before release.

Property, income-producing cabs, city-specific delivery chains, expanded research programs, event multipliers and season retirement remain design work. In particular, the candidate groups Oakland with Berkeley and the Peninsula with the East Bay; it does not yet implement the separate city gates described below.

Saved-driver persistence must be isolated from room responsiveness before new persistent features ship. The prototype exposed room-wide stalls when a profile write was slow or failed. See [PERSISTENCE_ISOLATION.md](PERSISTENCE_ISOLATION.md) for the proposed transaction boundary, local fixture and performance checks. Keep the existing game playable while integrating each layer.

## The player's wallet and the Bay

The proposed thresholds are inclusive:

| Current wallet | Level | Career access |
| ---: | ---: | --- |
| $0 or less | 0 | San Francisco, Marin, Rocket Dome and starter jobs |
| $10k | 1 | Oakland |
| $50k | 2 | Fremont and SFO |
| $250k | 3 | San Jose |
| $500k / $1m | 4 / 5 | Professional, then higher-paying delivery and fleet contracts |
| $2m | 6 | Property market and advanced contracts |
| $4m / $8m | 7 / 8 | Luxury and estate contracts |

Additional city gates spread out exploration: Berkeley $20k, San Mateo $75k, Palo Alto $100k and Mountain View $150k. SFO airport entry starts at $50k; the separate SFO Flight Lab program requires $75k and 20 lifetime deliveries.

Recalculate the level after every wallet change, including rewards, fines, purchases, sales and transfers. An earned city or level award pays once, even if the player drops below its threshold and reaches it again. Resolve any additional thresholds crossed by an award and group awards caused by the same action in the UI.

Before a purchase, show the resulting cash and any level or access change. When a city relocks, allow a player already there to finish an accepted job and use ordinary local jobs; prevent a new entry after they leave until they meet the gate again. A player can always reach, enter and manage an owned home or plot, including by home teleport. Premium contracts still require their current level.

For example, a player at $49,900 receives a $2,000 delivery payment and reaches Fremont's $50k gate. If this is their first Fremont unlock, its $2,000 award brings the wallet to $53,900. Buying $15k wheels later leaves $38,900 and level 1, assuming the first-cosmetic award was already claimed. Fremont relocks on leaving; the wheels and unlock achievement remain.

## Jobs, achievements and discoveries

The first meaningful choices should arrive well before property: take the next delivery, explore a newly available city or landmark, customize a car, buy a vehicle upgrade, save for a Cybercab, or try a side game. No side game is a career prerequisite.

- **Delivery chains:** give five ranked, one-off awards for total deliveries at 1 / 10 / 25 / 50 / 100, and a separate chain for deliveries in each city at 1 / 10 / 20 / 35 / 50. The detailed design adds check-ins and other chains for on-time, clean and distinct-destination jobs.
- **City discovery:** reward the first unlock of each city, including Oakland, Berkeley, Fremont and San Jose. A city unlock and a first delivery in that city are different achievements.
- **Landmarks:** support Alcatraz, Treasure Island, SFO, Rocket Dome, the bridges and other major Bay landmarks. Winning Rocket Dome is its own goal. Salesforce Tower and Coit Tower require a verified landing on the tower. Use stable destination IDs and authoritative collision or arrival checks; add supported map locations before enabling their awards.
- **Ownership and building:** reward the first Cybercab and subsequent fleet milestones, the first plot, constructing homes, and the 1 / 5 / 10 / 20-story building milestones. The candidate fleet chain counts currently owned cabs and pays each tier once. Record unique plot and build IDs so reacquiring the same property cannot repay a one-off award. The user rejected a generic “homes owned” count. Cab resale and repurchase pricing still need rules.
- **Guidance:** the Awards UI should show progress, the next reward and a map destination where useful. Complete several achievements from one action without turning each into a separate interrupting popup.

Awards and one-time check-ins pay once per player. The proposed repeatable delivery checkpoint is separate from an achievement; it pays every three deliveries. The exact schedule is in [ECONOMY.md](ECONOMY.md#cash-sources-and-awards). Protect completion events against retries and invalid or repeated participation.

The current model's early achievement target is still unmet: some sessions get too many awards at once, and hours two through eight have long gaps. Measure gross money, wallet change and meaningful achievements per five minutes, plus longer zero-award stretches. Keep progress toward a visible next goal even when a reward is not due in the current window.

## Research programs

Research work extends the delivery career with place-specific jobs. After 20 lifetime deliveries and the program's cash gate, offer jobs for one named program. A valid job can also advance normal delivery and city achievements; it advances only the research program named on that job. Saved certification and unlocked designs survive level drops.

| Location | Program | Example work | Candidate level-two unlock |
| --- | --- | --- | --- |
| SFO | Flight | Carry equipment to the terminal or aviation museum; make a careful arrival | $40k glider kit |
| Stanford | Speed | Deliver motor prototypes; try an acceleration run | $20k sport-motor tune |
| UCSF | Homes | Deliver housing materials and design prototypes | $20k home-design kit |
| UC Berkeley | Energy | Carry energy equipment between the Campanile and labs | $10k tune reducing flight-air use by 10% |

The university programs propose ranks at 2 / 6 / 12 / 20 / 30 qualifying jobs; SFO proposes 1 / 4 / 8 / 14 / 20. Each pays $500 / $1k / $2k / $4k / $8k across its five ranks. Rank two unlocks the related item for purchase. SFO jobs add a candidate $2k fare supplement. Use distinct, server-validated job IDs; reconnecting or replaying a job cannot repay a rank. The planned programs and their tuning are described in [ECONOMY.md](ECONOMY.md#research-and-airport-deliveries).

## Cabs, cars and cosmetics

The first five proposed Cybercab prices are $25k / $50k / $100k / $200k / $400k. Their respective one-off ownership awards are $5k / $10k / $20k / $40k / $80k. Each dispatched, active cab earns a candidate $15k per operating hour before event bonuses. A cab's first $20k of gross earnings also earns a separate $2k achievement.

The current simulations pay only while the owner is actively playing and assume partial utilization. They do not settle the offline-income policy, prices after cab five, or whether a fleet size cap is needed. Cab earnings need server-controlled, non-overlapping settlement intervals and durable ownership; never let the client choose an income amount.

The garage stores and displays personalized vehicle configurations. Two spaces come with a home; a dispatched cab can remain out earning. Ordinary passenger cars should remain available to drive without requiring an ownership purchase. Preserve access to the existing fleet while considering additional BYD and Rivian vehicles, Lucid Air, Hyundai IONIQ, Kia EV9, Chevrolet Silverado EV and Ford F-150 Lightning as separate content work.

The proposed [Vault showroom](LUXURY_SHOWROOM.md) is a separate late-game collection: Lamborghini and Bugatti models plus Ducati and Kawasaki motorcycles. Its six vehicles require an in-person purchase, cost $1.5m–$12m, and remain owned after a balance drop. The existing free fleet is unchanged. The showroom, model prices and awards depend on the persistent economy and are not yet playable.

Candidate cosmetics start at $2k for paint, $5k for decals and lettering, $15k for wheels and trim, $50k for wraps and fleet branding, and $150k for premium effects. Account-owned cosmetics can be reapplied to compatible cars. Offer early vehicle or flight kits around $10k / $20k / $40k; keep the starter Roadster's flight and public launch facilities available. Player trading of collectibles or skins needs separate rules for availability, transfers, fees and fraud; do not assume the property-sale rules already cover it.

## Homes, development and resale

Buying a completed home from the city or another player occupies the one purchased-home slot; selling that home frees it. A player can additionally own empty plots and homes they build on those plots. Each plot holds at most one home, and a developer building can grow vertically. Construction and improvements on an already owned plot remain available after the wallet drops below the property-market gate.

The proposed market gate is level 6: the wallet must contain at least $2m immediately before **every new plot or completed-home acquisition**, including resale or a free transfer. The city offers a $1m ready-built starter home, or a $400k starter plot plus a $600k build. At the $2m gate, the latter leaves $1.02m after the candidate first-plot and first-home awards.

For a developer building, the initial plot is $800k and the foundation plus first story is $1.2m. For each story `n` from 2 through 20, charge `roundToNearest1000(200000 × 1.1^(n − 2))` independently. Plot plus construction totals $2.928m at five stories, $4.716m at ten and $12.232m at twenty, before awards. The candidate milestones pay $5k / $10k / $25k / $50k at floors 1 / 5 / 10 / 20. Do not add rental income without a separate tenant and payout design.

The proposed starter home includes two garage spaces and free teleport to a selected owned home. Candidate first improvements are $20k furniture, a $25k charger, a $50k third garage bay, and a $50k thermal or launch pad. More expensive successive garage, charger and launch tiers are in [ECONOMY.md](ECONOMY.md#garages-cosmetics-and-home-upgrades). Keep public charging and ordinary flight available.

Guarantee a city-sold instanced starter plot and ready-built home option for each eligible account. Special physical plots may be finite, exclusively owned across rooms and visible to visitors, but need authored locations that do not block streets or landmarks. Keep placement and building floors aligned with authoritative map, support and collision geometry.

Owners can list plots or completed buildings for any nonnegative price, cancel or reprice an unsold listing, and sell the whole parcel with its included building. A completed-home purchase requires a free purchased-home slot. The candidate sale fee is 5%: on a $2m sale, the buyer pays $2m, the seller receives $1.9m and $100k leaves the economy. List transferred improvements explicitly; the seller keeps personal cars and portable possessions. The buyer debit, seller credit, fee and ownership transfer must settle once together, even with competing buyers or a reconnect.

## Events, cash creation and Starship

Deliveries, cab earnings and game-issued rewards create cash; shops, city property sales, construction and resale fees remove it. A player-to-player sale transfers money, apart from its fee. Avoid creating an income event for both sides of a transfer.

Candidate events are a developer-controlled **2× global event for 30 minutes** and a **1.5× room bonus for 10 minutes** after a Rocket Dome win. Another win refreshes the room timer. Multipliers combine up to 3× and apply to eligible delivery, active cab and verified repeatable activity pay. A winning match is paid before the new room bonus starts. One-off achievements, check-ins, checkpoints, gifts, refunds and resale proceeds are not multiplied. Display scope and remaining time; investigate win trading and sustained bonus uptime before release.

The global $1bn Starship meter counts each eligible game-issued earning once, including its eligible multiplier and one-off achievements. Purchases, fines and later spending do not subtract from it. Transfers, sales, loans, gifts and refunds do not count again. Players retain the money; no contribution button or deduction is needed for this global goal. The existing voluntary **per-room** Mars fund is separate until an explicit integration decision.

Show the global meter and each player's contribution. At the first verified threshold crossing, record one season result, honor all contributors with an appropriate privacy choice, and provide a launch celebration and replay for people who cannot attend. Retiring a season must preserve player identity, lifetime records and paid-for property until successor-season rules are decided. The event classifications, recovery and simulation are in [STARSHIP_ECONOMY.md](STARSHIP_ECONOMY.md).

## Shared implementation checks

Coordinate shared gameplay and protocol changes with the lead; do not let parallel agents introduce competing wallet, ownership or event formats. Keep calculations server-authoritative and show committed results to clients. A slow or failed driver's save must not hold other drivers' input, snapshots or physics. Durable identity must include guest earnings before their first eligible credit, with attachment and recovery rules that avoid counting them twice.

When implementing a slice, cover its normal action, insufficient funds or unavailable access, balance drop, duplicate input or retry, disconnect/reconnect, and simultaneous-player contention. For property, cover ownership, visitor collision safety, floor reservations and sale settlement across rooms. For the global goal, cover duplicate and out-of-order income, lost replies, corrections and simultaneous threshold crossings. Test real room behavior under delayed and failed profile writes; the isolated fixture's clock is not the game physics loop.

Update [CONTRACTS.md](CONTRACTS.md), feature documentation and [VERIFICATION.md](VERIFICATION.md) alongside a shipped behavior. Run `pnpm test` and `pnpm build`, the relevant live room integration for network changes, and desktop plus touch checks for changed controls or screens. Continue the performance hold on persistent economy releases until the lead has a verified isolation result.

## Decisions still needed

- Saved-identity recovery and guest-to-account attachment; cross-room trading and asset recovery after partial failure.
- Offline cab earnings, the long-term fleet cap, prices beyond the fifth cab, and resale or repurchase pricing.
- Actual map capacity and release schedule for physical plots; visitor access, transferable improvements and property moderation.
- Exact launch/thermal and glider handling, research-kit effects in competitive modes, and whether SFO and university job routes are fun at their assumed pace.
- Event scheduling and anti-collusion; property and achievement abuse prevention.
- Collectible supply, ownership, trading and fees; successor-season rules and asset carryover.
