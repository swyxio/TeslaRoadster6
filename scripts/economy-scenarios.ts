// Planning model only. These numbers are not the rules in the playable game.
// Run with: node --experimental-strip-types scripts/economy-scenarios.ts [--smooth] [--ledger]
type Scenario = { name: string; cabs?: number; global?: boolean; dome?: boolean; twoCities?: boolean };

const smooth = process.argv.includes('--smooth');
const globalAwards: Record<number, number> = smooth
  ? { 1: 2500, 10: 10000, 50: 40000, 100: 80000, 150: 50000, 200: 50000, 250: 100000 }
  : { 1: 2500, 10: 10000, 50: 40000, 100: 80000, 250: 200000 };
const cityAwards: Record<number, number> = { 1: 2000, 10: 8000, 25: 20000, 50: 40000, 100: 80000 };
const cabPrices = [25000, 50000, 100000, 200000, 400000];
const cabAwards = [5000, 10000, 20000, 40000, 80000];
const scenarios: Scenario[] = [
  { name: 'SF only' },
  { name: 'SF + one cab', cabs: 1 },
  { name: 'SF + cab + global event', cabs: 1, global: true },
  { name: 'SF + cab + both events', cabs: 1, global: true, dome: true },
  { name: 'Two cities, no cab', twoCities: true },
  { name: 'Two cities + one cab', cabs: 1, twoCities: true },
  { name: 'Two cities + two cabs', cabs: 2, twoCities: true },
  { name: 'Two cities + three cabs', cabs: 3, twoCities: true },
  { name: 'Two cities + cab + both events', cabs: 1, global: true, dome: true, twoCities: true },
];
const EPSILON = 1e-7;

function simulate(s: Scenario) {
  let time = 0, wallet = 2500, driveProgress = 0, deliveries = 0;
  let cabs = 0, plot = false, home = false, domeAward = false;
  let cabAt: number | null = null, plotAt: number | null = null, repositionUntil: number | null = null, enteredOakland = false;
  const counts = { SF: 0, Oakland: 0 };
  const unlocked = new Set<string>();
  const cityUnlocks = [
    { threshold: 10000, name: 'Oakland and Berkeley', award: 5000 },
    { threshold: 50000, name: 'Peninsula and East Bay', award: 10000 },
    { threshold: 250000, name: 'San Jose', award: 2500 },
  ];
  const ledger = { fares: 0, cabIncome: 0, deliveryAwards: 0, cityAwards: 0, unlockAwards: 2500,
    cabAward: 0, domeAward: 0, propertyAwards: 0, purchases: 0 };
  const within = (start: number, end: number) => time >= start - EPSILON && time < end - EPSILON;
  const multiplier = () => (s.global && within(1800, 3600) ? 2 : 1) * (s.dome && within(2400, 3000) ? 1.5 : 1);

  function settle() {
    // Unlock rewards can themselves cross another level; each is paid only once.
    for (const city of cityUnlocks) {
      if (!unlocked.has(city.name) && wallet >= city.threshold - EPSILON) {
        unlocked.add(city.name); wallet += city.award; ledger.unlockAwards += city.award;
      }
    }
    if (cabs < (s.cabs ?? 0) && wallet >= cabPrices[cabs] - EPSILON) {
      wallet -= cabPrices[cabs]; ledger.purchases += cabPrices[cabs];
      wallet += cabAwards[cabs]; ledger.cabAward += cabAwards[cabs];
      cabs++; if (cabAt === null) cabAt = time;
      settle(); return;
    }
    if (!plot && wallet >= 400000 - EPSILON) {
      wallet -= 400000; ledger.purchases += 400000; plot = true; plotAt = time;
      wallet += 5000; ledger.propertyAwards += 5000;
      settle(); return;
    }
    if (plot && !home && wallet >= 600000 - EPSILON) {
      wallet -= 600000; ledger.purchases += 600000; home = true;
      wallet += 15000; ledger.propertyAwards += 15000;
      settle();
    }
  }

  settle();
  while (!home && time < 200000) {
    const inDomeMatch = !!s.dome && within(2100, 2400);
    const repositioning = repositionUntil !== null && time < repositionUntil - EPSILON;
    const driving = !inDomeMatch && !repositioning;
    const rate = cabs * 15000 / 3600 * multiplier();
    const boundaries = [
      ...(s.global ? [1800, 3600] : []),
      ...(s.dome ? [2100, 2400, 3000] : []),
      ...(repositionUntil !== null ? [repositionUntil] : []),
    ].filter(t => t > time + EPSILON);
    const cashTargets = [
      ...cityUnlocks.filter(c => !unlocked.has(c.name)).map(c => c.threshold),
      ...(cabs < (s.cabs ?? 0) ? [cabPrices[cabs]] : []),
      ...(!plot ? [400000] : !home ? [600000] : []),
    ].filter(target => target > wallet + EPSILON);
    const dt = Math.min(
      driving ? 102 - driveProgress : Infinity,
      boundaries.length ? Math.min(...boundaries) - time : Infinity,
      rate && cashTargets.length ? (Math.min(...cashTargets) - wallet) / rate : Infinity,
    );
    if (!Number.isFinite(dt) || dt <= 0) throw new Error(`Simulation stalled: ${s.name}`);
    time += dt;
    if (driving) driveProgress += dt;
    wallet += rate * dt; ledger.cabIncome += rate * dt;
    settle();
    if (home) break;
    if (s.twoCities && repositionUntil !== null && !enteredOakland && time >= repositionUntil - EPSILON) {
      if (wallet < 10000 - EPSILON) throw new Error(`Oakland locked on entry: ${s.name}`);
      enteredOakland = true;
    }
    if (s.dome && !domeAward && time >= 2400 - EPSILON) {
      wallet += 5000; ledger.domeAward += 5000; domeAward = true; settle();
    }
    if (driveProgress >= 102 - EPSILON) {
      driveProgress -= 102; deliveries++;
      const city = s.twoCities && deliveries > 100 ? 'Oakland' : 'SF';
      counts[city]++;
      const fare = 2150 * multiplier();
      wallet += fare; ledger.fares += fare; settle();
      const globalAward = globalAwards[deliveries] ?? 0;
      wallet += globalAward; ledger.deliveryAwards += globalAward; settle();
      const cityAward = cityAwards[counts[city]] ?? 0;
      wallet += cityAward; ledger.cityAwards += cityAward; settle();
      if (s.twoCities && deliveries === 100) repositionUntil = time + 300;
    }
  }
  if (!home || plotAt === null) throw new Error(`No home reached: ${s.name}`);
  const ledgerBalance = ledger.fares + ledger.cabIncome + ledger.deliveryAwards + ledger.cityAwards
    + ledger.unlockAwards + ledger.cabAward + ledger.domeAward + ledger.propertyAwards - ledger.purchases;
  if (Math.abs(ledgerBalance - wallet) > 0.001) throw new Error(`Ledger mismatch: ${s.name}`);
  return { scenario: s.name, deliveries, cabs, SF: counts.SF, Oakland: counts.Oakland,
    plotMinutes: plotAt / 60, homeMinutes: time / 60, cabMinutes: cabAt === null ? null : cabAt / 60,
    balance: wallet, ledger };
}

const results = scenarios.map(simulate);
console.log(smooth ? 'Smoothed global delivery awards' : 'Original global delivery awards');
console.table(results.map(({ scenario, deliveries, plotMinutes, homeMinutes, balance }) => ({
  scenario, deliveries, plotMinutes: plotMinutes.toFixed(1), homeMinutes: homeMinutes.toFixed(1), balance: balance.toFixed(0),
})));
if (process.argv.includes('--ledger')) for (const result of results) console.log(JSON.stringify(result));
