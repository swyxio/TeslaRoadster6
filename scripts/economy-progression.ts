// Offline design experiment, not game rules or a forecast of observed players.
// Run: pnpm exec tsx scripts/economy-progression.ts [--players 100] [--hours 40] [--json]
import { pathToFileURL } from 'node:url';

export type RuleSet = 'original' | 'candidate';
export type Profile = {
  name: string;
  sessionMinutes: number;
  speed: number;
  cabsBeforeHome: number;
  cabsAfterHome: number;
  utilization: number;
  domeChance: number;
  activityChance: number;
  exploreChance: number;
  landmarkChance: number;
  cosmetics: number[];
  earlyUpgrades: number[];
  stagedBuild: boolean;
  propertyFirst: boolean;
  secondBuildReserve?: number;
  stopSpendingAfterSecondHome?: boolean;
  tourChance?: number;
  travelAfterTasks?: number;
  landmarksPerCity?: number;
};

export const profiles: Profile[] = [
  { name: 'Delivery saver', sessionMinutes: 60, speed: 1, cabsBeforeHome: 0, cabsAfterHome: 0, utilization: 0, domeChance: 0, activityChance: 0, exploreChance: 0, landmarkChance: 0.15, cosmetics: [], earlyUpgrades: [], stagedBuild: false, propertyFirst: true },
  { name: 'Casual cab owner', sessionMinutes: 30, speed: 1.25, cabsBeforeHome: 1, cabsAfterHome: 1, utilization: 0.65, domeChance: 0.05, activityChance: 0.1, exploreChance: 0.04, landmarkChance: 0.25, cosmetics: [2000], earlyUpgrades: [10000, 20000], stagedBuild: false, propertyFirst: false },
  { name: 'Fleet builder', sessionMinutes: 90, speed: 0.9, cabsBeforeHome: 3, cabsAfterHome: 5, utilization: 0.8, domeChance: 0.04, activityChance: 0.05, exploreChance: 0.02, landmarkChance: 0.2, cosmetics: [], earlyUpgrades: [10000, 20000], stagedBuild: false, propertyFirst: true },
  { name: 'Landmark collector', sessionMinutes: 45, speed: 1.15, cabsBeforeHome: 1, cabsAfterHome: 1, utilization: 0.65, domeChance: 0.04, activityChance: 0.1, exploreChance: 0.16, landmarkChance: 0.5, cosmetics: [2000, 5000, 15000, 50000], earlyUpgrades: [10000, 20000, 40000], stagedBuild: true, propertyFirst: false },
  { name: 'Dome regular', sessionMinutes: 60, speed: 1.05, cabsBeforeHome: 1, cabsAfterHome: 2, utilization: 0.7, domeChance: 0.3, activityChance: 0.08, exploreChance: 0.04, landmarkChance: 0.25, cosmetics: [2000, 5000], earlyUpgrades: [10000, 20000, 40000], stagedBuild: false, propertyFirst: false },
];

const originalThresholds = [0, 10000, 50000, 250000, 1250000, 6250000];
const candidateThresholds = [0, 10000, 50000, 250000, 500000, 1000000, 2000000, 4000000, 8000000];
const cabPrices = [25000, 50000, 100000, 200000, 400000];
const cabAwards = [5000, 10000, 20000, 40000, 80000];
const cityThresholds = [0, 10000, 10000, 50000, 250000]; // SF, Oakland, Berkeley, Fremont, San Jose
const cityContractTiers = [0, 1, 1, 2, 3];
const deliveryFares = [3000, 4000, 6000, 9500, 11000, 13000, 15000, 20000, 26000];
const deliveryMinutes = [3, 3.5, 4.5, 5.5, 6, 6.5, 7, 7.5, 8];
const plotCost = 400000;
const buildCost = 600000;
const sampleMinutes = [30, 60, 120, 240, 480, 960, 1440, 2400];

type Task = { kind: 'delivery' | 'dome' | 'explore' | 'tour' | 'travel' | 'race' | 'park'; remaining: number; fare?: number; landmark?: number; target?: number };
type Ledger = { fares: number; cabs: number; matchPay: number; activityPay: number; checkpoints: number; achievements: number; unlocks: number; spending: number; fines: number };
export type FiveMinuteWindow = {
  endMinute: number; gross: number; recurring: number; cabIncome: number;
  achievementCash: number; checkinCash: number; unlockCash: number; spending: number; fines: number; cashChange: number;
  achievements: number; cityAchievements: number; checkins: number; unlocks: number; repeatableGoals: number; tasks: number; wallet: number; level: number; cabs: number;
};
export type Result = {
  profile: string; rules: RuleSet; activeMinutes: number; sessions: number; deliveries: number; wins: number; cityVisitsAwarded: number;
  cabs: number; cash: number; level: number; plotMinute: number | null; homeMinute: number | null;
  secondPlotMinute: number | null; secondHomeMinute: number | null;
  marketUnlockMinute: number | null; homeBalance: number | null;
  secondHomeBalance: number | null; secondHomeBeforeLevel: number | null; secondHomeAfterLevel: number | null; secondHomeRecoveryMinutes: number | null;
  firstCabMinute: number | null; afterPlotLevel: number | null; afterHomeLevel: number | null;
  plotRecoveryMinutes: number | null; homeRecoveryMinutes: number | null;
  maxMilestoneGap: number; maxMilestoneGapFirstHome: number; maxMilestoneGapFirst8h: number;
  maxProgressGapFirst8h: number; milestoneCount: number; milestonesFirstHour: number; milestonesFirst4h: number;
  optionSamples: number[]; affordableSamples: number[]; ledger: Ledger; totalEarned: number; windows: FiveMinuteWindow[];
};

// mulberry32: deterministic repeatable experiments, not a claim about player distributions.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function levelFor(wallet: number, rules: RuleSet = 'candidate'): number {
  const thresholds = rules === 'original' ? originalThresholds : candidateThresholds;
  for (let i = thresholds.length - 1; i > 0; i--) if (wallet >= thresholds[i]) return i;
  return 0;
}

export function deliveryTier(wallet: number, city: number, retainLocalJobs = true): number {
  return retainLocalJobs ? Math.max(levelFor(wallet), cityContractTiers[city]) : levelFor(wallet);
}

export function premiumContractChoices(level: number): number {
  return [4, 5, 6, 7, 8].filter(tier => level >= tier).length;
}

// Pay is set from an expected duration at task acceptance, not how long a player waits.
export function branchPayout(level: number, kind: 'dome' | 'race' | 'park' | 'tour'): number {
  const expectedMinutes = { dome: 6.5, race: 5.5, park: 5.5, tour: 6 }[kind];
  const share = { dome: 0.85, race: 0.9, park: 0.85, tour: 0.8 }[kind];
  return Math.round(deliveryFares[level] / deliveryMinutes[level] * expectedMinutes * share / 10) * 10;
}

type SimulationOptions = { global?: boolean; room?: boolean; marketLevel?: 5 | 6; retainLocalJobs?: boolean; checkins?: boolean;
  trackWindows?: boolean; trackWindowsUntil?: number; branchBalance?: boolean; winChance?: number; allActivityMultiplier?: boolean; cityVisitAwards?: boolean };
export function simulate(profile: Profile, rules: RuleSet, seed: number, hours = 40,
  events: SimulationOptions = {}): Result {
  const rng = random(seed);
  const initialSeed = seed;
  let cash = 2500, minute = 0, session = 0, inSession = 0;
  let sessionStart = Math.floor(rng() * 240), roomBonusUntil = 0;
  let deliveries = 0, wins = 0, cabs = 0, city = 0, totalCityJobs = 0, totalCityTasks = 0, matches = 0;
  let plotMinute: number | null = null, homeMinute: number | null = null, firstCabMinute: number | null = null;
  let secondPlotMinute: number | null = null, secondHomeMinute: number | null = null;
  let marketUnlockMinute: number | null = null;
  let homeBalance: number | null = null;
  let secondHomeBalance: number | null = null, secondHomeBeforeLevel: number | null = null, secondHomeAfterLevel: number | null = null;
  let secondHomeRecoveryMinutes: number | null = null, secondHomeRecoveryTarget = 0;
  let afterPlotLevel: number | null = null, afterHomeLevel: number | null = null;
  let plotRecoveryMinutes: number | null = null, homeRecoveryMinutes: number | null = null;
  let plotRecoveryTarget = 0, homeRecoveryTarget = 0;
  let task: Task | null = null, cosmeticIndex = 0, earlyUpgradeIndex = 0, constructionStages = 0, upgradeIndex = 0;
  const upgrades = [
    { price: 20000, group: 'furnishing' }, { price: 25000, group: 'charger' },
    { price: 50000, group: 'launch' }, { price: 50000, group: 'garage' },
    { price: 50000, group: 'charger' }, { price: 100000, group: 'launch' },
    { price: 100000, group: 'garage' }, { price: 100000, group: 'charger' },
    { price: 150000, group: 'effects' }, { price: 200000, group: 'launch' },
    { price: 200000, group: 'garage' }, { price: 400000, group: 'garage' },
    { price: 800000, group: 'garage' },
  ];
  const cityJobs = [0, 0, 0, 0, 0];
  const activities = { race: 0, park: 0, tour: 0 };
  const landmarksPerCity = profile.landmarksPerCity ?? 3;
  if (!Number.isInteger(landmarksPerCity) || landmarksPerCity < 1) throw new Error('landmarksPerCity must be a positive integer');
  const landmarks = Array.from({ length: 5 * landmarksPerCity }, () => ({ discovered: false, deliveries: 0 }));
  const unlocked = new Set<number>([0]);
  const visitedCities = new Set<number>([0]);
  let cityVisitsAwarded = 0;
  const milestoneTimes: number[] = [0];
  const progress: number[] = [0];
  const optionSamples: number[] = [];
  const affordableSamples: number[] = [];
  const ledger: Ledger = { fares: 0, cabs: 0, matchPay: 0, activityPay: 0, checkpoints: 0, achievements: 0, unlocks: 2500, spending: 0, fines: 0 };
  const windows: FiveMinuteWindow[] = [];
  let achievementCount = 0, cityAchievementCount = 0, checkinCount = 0, unlockCount = 0, repeatableCount = 0, taskCount = 0;
  let achievementCash = 0, checkinCash = 0;
  let previousLedger = { ...ledger }, previousCash = cash;
  let previousCounts = { achievementCount, cityAchievementCount, checkinCount, unlockCount, repeatableCount, taskCount, achievementCash, checkinCash };
  const recordProgress = () => { if (progress[progress.length - 1] !== minute) progress.push(minute); };
  const record = () => { if (milestoneTimes[milestoneTimes.length - 1] !== minute) milestoneTimes.push(minute); recordProgress(); };
  const award = (amount: number, kind: 'achievement' | 'checkin' = 'achievement') => {
    if (!amount) return;
    cash += amount; ledger.achievements += amount;
    if (kind === 'achievement') { achievementCount++; achievementCash += amount; }
    else { checkinCount++; checkinCash += amount; }
    record();
  };
  const spend = (amount: number) => { if (cash < amount) throw new Error('Insufficient cash'); cash -= amount; ledger.spending += amount; record(); };
  const tier = () => levelFor(cash, rules);
  const marketLevel = rules === 'candidate' ? (events.marketLevel ?? 6) : 3;
  const clock = () => session * 1440 + sessionStart + inSession;
  const globalBonus = () => events.global !== false && (clock() % 240) < 30;
  const multiplier = () => (globalBonus() ? 2 : 1) * (events.room !== false && clock() < roomBonusUntil ? 1.5 : 1);
  const options = () => {
    // Playable activity families and owned amenities, not every item or a fun score.
    const level = tier();
    const contractChoices = rules === 'candidate'
      ? premiumContractChoices(level)
      : Math.max(0, level - 1);
    const localException = cityThresholds[city] > cash ? 1 : 0;
    return 6 + Math.min(level, 3) + localException + (level >= marketLevel ? 1 : 0) + contractChoices
      + (cosmeticIndex > 0 ? 1 : 0) + (cabs > 0 ? 1 : 0) + (plotMinute !== null ? 1 : 0)
      + (earlyUpgradeIndex > 0 ? 1 : 0)
      + (homeMinute !== null ? 3 : 0) + new Set(upgrades.slice(0, upgradeIndex).map(u => u.group)).size;
  };
  const affordable = () => {
    // Count currently affordable next items, not every later tier of the same item.
    const ownedCosmetics = new Set(profile.cosmetics.slice(0, cosmeticIndex));
    const catalog = [2000, 5000, 15000, 50000, 150000].filter(price => price <= cash && !ownedCosmetics.has(price)).length;
    const cab = cabs < cabPrices.length && cash >= cabPrices[cabs] ? 1 : 0;
    const vehicleUpgrade = earlyUpgradeIndex < profile.earlyUpgrades.length && cash >= profile.earlyUpgrades[earlyUpgradeIndex] ? 1 : 0;
    const property = homeMinute === null
      ? (plotMinute === null ? +(tier() >= marketLevel && cash >= plotCost) : +(cash >= (profile.stagedBuild ? buildCost / 4 : buildCost)))
      : (secondPlotMinute === null ? +(tier() >= marketLevel && cash >= 800000) : +(secondHomeMinute === null && cash >= 1200000));
    const improvement = homeMinute !== null && upgradeIndex < upgrades.length && cash >= upgrades[upgradeIndex].price ? 1 : 0;
    return catalog + cab + property + improvement + vehicleUpgrade;
  };

  function updateUnlocks() {
    const thresholds = rules === 'original' ? originalThresholds : candidateThresholds;
    // Unlock awards can cross the next threshold. Dropping and recovering cannot repay them.
    const unlockRewards = rules === 'candidate'
      ? [[1, 5000], [2, 10000], [3, 2500], [4, 2500], [5, 5000], [6, 5000], [7, 10000], [8, 20000]]
      : [[1, 5000], [2, 10000], [3, 2500], [4, 0], [5, 0]];
    for (const [level, amount] of unlockRewards) {
      if (cash >= thresholds[level] && !unlocked.has(level)) {
        unlocked.add(level); cash += amount; ledger.unlocks += amount; if (amount) unlockCount++;
        // Each named city has its own one-off achievement, even when unlocked in a group.
        if (rules === 'candidate' && level <= 3) cityAchievementCount += [0, 2, 4, 1][level];
        record();
        if (level === marketLevel) marketUnlockMinute = minute;
      }
    }
    if (plotMinute !== null && plotRecoveryMinutes === null && tier() >= plotRecoveryTarget) plotRecoveryMinutes = minute - plotMinute;
    if (homeMinute !== null && homeRecoveryMinutes === null && tier() >= homeRecoveryTarget) homeRecoveryMinutes = minute - homeMinute;
    if (secondHomeMinute !== null && secondHomeRecoveryMinutes === null && tier() >= secondHomeRecoveryTarget) secondHomeRecoveryMinutes = minute - secondHomeMinute;
  }

  function buy() {
    // A purchase is made only at an activity boundary; construction remains accessible on owned plots.
    for (;;) {
      updateUnlocks();
      const cabTarget = homeMinute === null ? profile.cabsBeforeHome : profile.cabsAfterHome;
      if (cosmeticIndex < profile.cosmetics.length && cash >= profile.cosmetics[cosmeticIndex]) {
        spend(profile.cosmetics[cosmeticIndex++]); if (rules === 'candidate' && cosmeticIndex === 1) award(1000); continue;
      }
      if (earlyUpgradeIndex < profile.earlyUpgrades.length && cash >= profile.earlyUpgrades[earlyUpgradeIndex]) {
        spend(profile.earlyUpgrades[earlyUpgradeIndex++]); if (rules === 'candidate' && earlyUpgradeIndex === 1) award(2000); continue;
      }
      if (cabs < cabTarget && cash >= cabPrices[cabs]) {
        spend(cabPrices[cabs]); award(cabAwards[cabs]); cabs++; firstCabMinute ??= minute; continue;
      }
      if (cabs >= cabTarget && plotMinute === null && cash >= plotCost && tier() >= marketLevel) {
        const before = tier(); spend(plotCost); plotMinute = minute; award(5000); afterPlotLevel = tier(); plotRecoveryTarget = before; continue;
      }
      if (plotMinute !== null && homeMinute === null && cabs >= cabTarget) {
        const price = profile.stagedBuild ? buildCost / 4 : buildCost;
        if (cash >= price) {
          const before = tier(); spend(price); constructionStages += profile.stagedBuild ? 1 : 4;
          if (constructionStages === 4) {
            homeMinute = minute; award(15000); homeBalance = cash; afterHomeLevel = tier(); homeRecoveryTarget = before;
          }
          continue;
        }
      }
      if (homeMinute !== null && cabs >= cabTarget) {
        const prioritizeProperty = profile.propertyFirst && secondHomeMinute === null;
        if ((!prioritizeProperty || secondHomeMinute !== null) && !(profile.stopSpendingAfterSecondHome && secondHomeMinute !== null)
          && upgradeIndex < upgrades.length && cash >= upgrades[upgradeIndex].price) {
          spend(upgrades[upgradeIndex++].price); continue;
        }
        if ((prioritizeProperty || upgradeIndex === upgrades.length) && secondPlotMinute === null && cash >= 800000 && tier() >= marketLevel) {
          spend(800000); secondPlotMinute = minute; award(10000); continue;
        }
        if ((prioritizeProperty || upgradeIndex === upgrades.length) && secondPlotMinute !== null && secondHomeMinute === null && cash >= 1200000 + (profile.secondBuildReserve ?? 0)) {
          secondHomeBeforeLevel = tier(); spend(1200000); secondHomeMinute = minute; award(10000);
          secondHomeBalance = cash; secondHomeAfterLevel = tier(); secondHomeRecoveryTarget = secondHomeBeforeLevel; continue;
        }
      }
      break;
    }
    updateUnlocks();
  }

  function discover(id: number) {
    if (landmarks[id].discovered) return;
    landmarks[id].discovered = true;
    award(rules === 'candidate' ? 500 : 2500);
  }

  function finish(t: Task) {
    if (t.kind === 'travel') {
      city = t.target!; totalCityJobs = 0; totalCityTasks = 0;
      if (!visitedCities.has(city)) {
        visitedCities.add(city);
        if (events.cityVisitAwards && rules === 'candidate' && events.branchBalance) { award(500); cityVisitsAwarded++; }
      }
      record(); return;
    }
    totalCityTasks++; taskCount++;
    if (t.kind === 'explore') { discover(t.landmark!); return; }
    if (t.kind === 'race' || t.kind === 'park' || t.kind === 'tour') {
      activities[t.kind]++;
      if (rules === 'candidate') {
        const pay = (events.branchBalance ? t.fare! : t.kind === 'race' ? 2500 : t.kind === 'park' ? 1500 : 0)
          * (events.allActivityMultiplier ? multiplier() : 1);
        cash += pay; ledger.activityPay += pay;
        const milestones: Record<number, number> = events.branchBalance
          ? { 1: 2000, 3: 4000, 5: 8000, 10: 16000, 25: 32000 }
          : { 1: 2000, 3: 4000, 10: 8000, 25: 16000, 50: 32000 };
        award(milestones[activities[t.kind]] ?? 0);
        if (events.branchBalance) {
          if (activities[t.kind] === 50) award(10000, 'checkin');
          if (t.kind !== 'tour') {
            const sportsMilestones: Record<number, number> = { 1: 500, 3: 1000, 5: 2000, 10: 4000, 25: 8000 };
            award(sportsMilestones[activities.race + activities.park] ?? 0);
          }
          if (activities[t.kind] % 3 === 0) { cash += 750; ledger.checkpoints += 750; repeatableCount++; recordProgress(); }
          if (t.kind === 'tour' && t.landmark !== undefined) discover(t.landmark);
        }
      }
      return;
    }
    if (t.kind === 'dome') {
      // Match reward is a candidate; the original proposal had none.
      matches++;
      // Use the rate at completion; a win starts the room bonus after this match pays.
      const matchMultiplier = events.allActivityMultiplier ? multiplier() : 1;
      if (rules === 'candidate') {
        const pay = (events.branchBalance ? Math.round(t.fare! * 0.7) : 1200) * matchMultiplier;
        cash += pay; ledger.matchPay += pay;
        if (events.branchBalance) {
          const milestones: Record<number, number> = { 1: 2000, 3: 4000, 5: 8000, 10: 16000, 25: 32000 };
          award(milestones[matches] ?? 0);
          if (matches === 50) award(10000, 'checkin');
          if (matches % 3 === 0) { cash += 750; ledger.checkpoints += 750; repeatableCount++; recordProgress(); }
        }
      }
      if (rng() < (events.winChance ?? 0.5)) {
        wins++; roomBonusUntil = clock() + 10;
        if (rules === 'candidate') { const pay = (events.branchBalance ? Math.round(t.fare! * 0.6) : 1800) * matchMultiplier; cash += pay; ledger.matchPay += pay; }
        const winMilestones: Record<number, number> = rules === 'candidate'
          ? { 1: 2000, 3: 4000, 10: 8000, 25: 16000, 50: 32000 }
          : { 1: 5000, 3: 15000, 10: 35000, 25: 75000, 50: 150000 };
        award(winMilestones[wins] ?? 0);
      }
      return;
    }
    deliveries++; cityJobs[city]++; totalCityJobs++;
    const fare = t.fare! * multiplier(); cash += fare; ledger.fares += fare;
    const globalMilestones: Record<number, number> = rules === 'candidate'
      ? { 1: 2500, 3: 1000, 5: 1500, 10: 5000, 50: 10000, 100: 20000, 250: 40000 }
      : { 1: 2500, 10: 10000, 50: 40000, 100: 80000, 250: 200000 };
    const cityMilestones: Record<number, number> = rules === 'candidate'
      ? { 1: 2000, 10: 4000, 25: 8000, 50: 16000, 100: 32000 }
      : { 1: 2000, 10: 8000, 25: 20000, 50: 40000, 100: 80000 };
    award(globalMilestones[deliveries] ?? 0, deliveries === 3 || deliveries === 5 ? 'checkin' : 'achievement');
    if (rules === 'candidate' && events.checkins !== false) {
      // Small one-off goals between the five ranked tiers, not additional ranked levels.
      const deliveryCheckins: Record<number, number> = { 20: 2000, 30: 2500, 40: 3000, 75: 5000, 150: 10000, 200: 15000 };
      const cityCheckins: Record<number, number> = { 5: 1000, 15: 2000, 20: 3000 };
      award(deliveryCheckins[deliveries] ?? 0, 'checkin');
      award(cityCheckins[cityJobs[city]] ?? 0, 'checkin');
    }
    if (rules === 'candidate' && deliveries % 3 === 0) { cash += 750; ledger.checkpoints += 750; repeatableCount++; recordProgress(); }
    award(cityMilestones[cityJobs[city]] ?? 0);
    if (t.landmark !== undefined) {
      discover(t.landmark);
      const landmark = landmarks[t.landmark]; landmark.deliveries++;
      const landmarkMilestones: Record<number, number> = rules === 'candidate'
        ? { 1: 1000, 3: 2000, 5: 4000, 10: 8000 }
        : { 1: 5000, 3: 10000, 5: 20000, 10: 40000 };
      award(landmarkMilestones[landmark.deliveries] ?? 0);
    }
    // A small random citation; repeat-severity and full police simulation are not modeled.
    if (rng() < 0.04) { const fine = Math.min(cash, 750 + Math.floor(rng() * 2250)); cash -= fine; ledger.fines += fine; }
  }

  function nextTask(): Task {
    // Voluntary city travel after 25 jobs, only if entry is currently unlocked.
    const readyToTravel = profile.travelAfterTasks === undefined ? totalCityJobs >= 25 : totalCityTasks >= profile.travelAfterTasks;
    if (readyToTravel && city < 4 && cash >= cityThresholds[city + 1]) {
      return { kind: 'travel', remaining: 5, target: city + 1 };
    }
    const rank = rules === 'candidate' ? deliveryTier(cash, city, events.retainLocalJobs !== false) : tier();
    if (rng() < profile.domeChance) return { kind: 'dome', remaining: 5 + Math.floor(rng() * 4), fare: branchPayout(rank, 'dome') };
    if (rng() < profile.activityChance) {
      const kind = rng() < 0.5 ? 'race' : 'park';
      return { kind, remaining: 4 + Math.floor(rng() * 4), fare: branchPayout(rank, kind) };
    }
    const local = Array.from({ length: landmarksPerCity }, (_, i) => city * landmarksPerCity + i);
    const undiscovered = local.filter(id => !landmarks[id].discovered);
    if (events.branchBalance && (profile.tourChance ?? 0) > 0 && rng() < profile.tourChance!) {
      return { kind: 'tour', remaining: 5 + Math.floor(rng() * 3), fare: branchPayout(rank, 'tour'),
        landmark: undiscovered.length ? undiscovered[Math.floor(rng() * undiscovered.length)] : undefined };
    }
    if (undiscovered.length && rng() < profile.exploreChance) {
      return { kind: 'explore', remaining: 4 + Math.floor(rng() * 3), landmark: undiscovered[Math.floor(rng() * undiscovered.length)] };
    }
    // A player already in a city can keep taking its local jobs after spending lowers their rank.
    // More advanced cash-gated contracts are available only while the current balance allows them.
    const base = rules === 'candidate' ? deliveryFares[rank] : 2150;
    const duration = rules === 'candidate' ? deliveryMinutes[rank] : 3;
    const fare = base * (0.8 + 0.4 * rng());
    const remaining = Math.max(1, Math.ceil(duration * profile.speed * (0.8 + 0.4 * rng())));
    const landmark = rng() < profile.landmarkChance ? local[Math.floor(rng() * local.length)] : undefined;
    return { kind: 'delivery', remaining, fare, landmark };
  }

  updateUnlocks();
  while (minute < hours * 60) {
    if (!task) buy();
    if (!task) task = nextTask();
    // Cabs earn only during the player's active session; utilization is an assumed average.
    const income = cabs * 15000 / 60 * profile.utilization * multiplier();
    cash += income; ledger.cabs += income;
    minute++; inSession++; task.remaining--;
    if (task.remaining <= 0) { finish(task); task = null; }
    updateUnlocks();
    if (events.trackWindows && minute % 5 === 0 && minute <= (events.trackWindowsUntil ?? Infinity)) {
      const diff = (key: keyof Ledger) => ledger[key] - previousLedger[key];
      const recurring = diff('fares') + diff('cabs') + diff('matchPay') + diff('activityPay') + diff('checkpoints');
      const aCash = achievementCash - previousCounts.achievementCash;
      const cCash = checkinCash - previousCounts.checkinCash;
      const unlockCash = diff('unlocks');
      windows.push({ endMinute: minute, gross: recurring + aCash + cCash + unlockCash, recurring, cabIncome: diff('cabs'),
        achievementCash: aCash, checkinCash: cCash, unlockCash, spending: diff('spending'), fines: diff('fines'), cashChange: cash - previousCash,
        achievements: achievementCount - previousCounts.achievementCount + cityAchievementCount - previousCounts.cityAchievementCount,
        cityAchievements: cityAchievementCount - previousCounts.cityAchievementCount, checkins: checkinCount - previousCounts.checkinCount,
        unlocks: unlockCount - previousCounts.unlockCount, repeatableGoals: repeatableCount - previousCounts.repeatableCount,
        tasks: taskCount - previousCounts.taskCount, wallet: cash, level: tier(), cabs });
      previousLedger = { ...ledger }; previousCash = cash;
      previousCounts = { achievementCount, cityAchievementCount, checkinCount, unlockCount, repeatableCount, taskCount, achievementCash, checkinCash };
    }
    if (sampleMinutes.includes(minute)) { optionSamples.push(options()); affordableSamples.push(affordable()); }
    if (inSession === profile.sessionMinutes) { session++; inSession = 0; sessionStart = Math.floor(rng() * 240); }
  }
  // End-of-horizon work counts; purchases are intentionally made only at activity boundaries.
  const maxGap = (events: number[], end: number) => {
    const points = events.filter(t => t <= end);
    points.push(end);
    return Math.max(...points.slice(1).map((t, i) => t - points[i]), 0);
  };
  const earned = ledger.fares + ledger.cabs + ledger.matchPay + ledger.activityPay + ledger.checkpoints + ledger.achievements + ledger.unlocks;
  if (Math.abs(cash - (earned - ledger.spending - ledger.fines)) > 1e-5) throw new Error(`Ledger mismatch: ${profile.name} ${initialSeed}`);
  return { profile: profile.name, rules, activeMinutes: minute, sessions: Math.ceil(minute / profile.sessionMinutes), deliveries, wins, cityVisitsAwarded,
    cabs, cash, level: tier(), plotMinute, homeMinute, secondPlotMinute, secondHomeMinute, marketUnlockMinute, homeBalance,
    secondHomeBalance, secondHomeBeforeLevel, secondHomeAfterLevel, secondHomeRecoveryMinutes, firstCabMinute, afterPlotLevel, afterHomeLevel,
    plotRecoveryMinutes, homeRecoveryMinutes, maxMilestoneGap: maxGap(milestoneTimes, minute), maxMilestoneGapFirstHome: maxGap(milestoneTimes, homeMinute ?? minute),
    maxMilestoneGapFirst8h: maxGap(milestoneTimes, Math.min(480, minute)), maxProgressGapFirst8h: maxGap(progress, Math.min(480, minute)),
    milestoneCount: milestoneTimes.length - 1, milestonesFirstHour: milestoneTimes.filter(t => t > 0 && t <= 60).length,
    milestonesFirst4h: milestoneTimes.filter(t => t > 0 && t <= 240).length, optionSamples, affordableSamples, ledger, totalEarned: earned, windows };
}

function percentile(values: number[], q: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}
const rounded = (n: number | null, digits = 1) => n === null ? null : +n.toFixed(digits);

export function summarize(results: Result[]) {
  const homes = results.filter(r => r.homeMinute !== null);
  const plots = results.filter(r => r.plotMinute !== null);
  const secondHomes = results.filter(r => r.secondHomeMinute !== null);
  const hrs = (r: Result, key: 'homeMinute' | 'plotMinute' | 'firstCabMinute' | 'secondHomeMinute' | 'marketUnlockMinute') => r[key] === null ? [] : [r[key]! / 60];
  const med = (values: number[], digits = 1) => rounded(percentile(values, .5), digits);
  const sampled = (key: 'optionSamples' | 'affordableSamples', index: number) => med(results.flatMap(r => r[key][index] === undefined ? [] : [r[key][index]]), 0);
  const qHome = (q: number) => rounded(percentile(homes.flatMap(r => hrs(r, 'homeMinute')), q));
  return {
    profile: results[0].profile, rules: results[0].rules, players: results.length,
    marketUnlockHrs: med(results.flatMap(r => hrs(r, 'marketUnlockMinute'))),
    plotHrs: med(plots.flatMap(r => hrs(r, 'plotMinute'))), homeReached: homes.length,
    homeP10: qHome(.1), homeP50: qHome(.5), homeP90: qHome(.9),
    secondHomeReached: secondHomes.length,
    secondHomeHrs: med(results.flatMap(r => hrs(r, 'secondHomeMinute'))),
    secondHomeBalance: med(secondHomes.flatMap(r => r.secondHomeBalance === null ? [] : [r.secondHomeBalance]), 0),
    secondHomeBeforeLevel: med(secondHomes.flatMap(r => r.secondHomeBeforeLevel === null ? [] : [r.secondHomeBeforeLevel]), 0),
    secondHomeAfterLevel: med(secondHomes.flatMap(r => r.secondHomeAfterLevel === null ? [] : [r.secondHomeAfterLevel]), 0),
    secondHomeRecovered: secondHomes.filter(r => r.secondHomeRecoveryMinutes !== null).length,
    secondHomeRecoveryHrs: med(secondHomes.flatMap(r => r.secondHomeRecoveryMinutes === null ? [] : [r.secondHomeRecoveryMinutes / 60])),
    firstCabHrs: med(results.flatMap(r => hrs(r, 'firstCabMinute'))),
    homeBalance: med(homes.flatMap(r => r.homeBalance === null ? [] : [r.homeBalance]), 0),
    plotRecoveryHrs: med(plots.flatMap(r => r.plotRecoveryMinutes === null ? [] : [r.plotRecoveryMinutes / 60])),
    homeRecoveryHrs: med(homes.flatMap(r => r.homeRecoveryMinutes === null ? [] : [r.homeRecoveryMinutes / 60])),
    plotRecovered: plots.filter(r => r.plotRecoveryMinutes !== null).length,
    homeRecovered: homes.filter(r => r.homeRecoveryMinutes !== null).length,
    maxGapBeforeHomeHrs: med(results.map(r => r.maxMilestoneGapFirstHome / 60)),
    maxGapFirst8hHrs: med(results.map(r => r.maxMilestoneGapFirst8h / 60)),
    maxProgressGapFirst8hHrs: med(results.map(r => r.maxProgressGapFirst8h / 60)),
    milestonesFirstHour: med(results.map(r => r.milestonesFirstHour), 0), milestonesFirst4h: med(results.map(r => r.milestonesFirst4h), 0),
    maxGap40hHrs: med(results.map(r => r.maxMilestoneGap / 60)),
    optionsAt1h: sampled('optionSamples', 1), optionsAt4h: sampled('optionSamples', 3),
    optionsAt8h: sampled('optionSamples', 4), optionsAt24h: sampled('optionSamples', 6),
    affordableAt1h: sampled('affordableSamples', 1), affordableAt4h: sampled('affordableSamples', 3),
    affordableAt8h: sampled('affordableSamples', 4), affordableAt24h: sampled('affordableSamples', 6),
    totalEarned: med(results.map(r => r.totalEarned), 0), fares: med(results.map(r => r.ledger.fares), 0),
    cabIncome: med(results.map(r => r.ledger.cabs), 0), achievements: med(results.map(r => r.ledger.achievements), 0),
    matchPay: med(results.map(r => r.ledger.matchPay), 0), activityPay: med(results.map(r => r.ledger.activityPay), 0),
    checkpoints: med(results.map(r => r.ledger.checkpoints), 0), spending: med(results.map(r => r.ledger.spending), 0),
    fines: med(results.map(r => r.ledger.fines), 0), remaining: med(results.map(r => r.cash), 0),
    finalLevel: med(results.map(r => r.level), 0), finalCabs: med(results.map(r => r.cabs), 0),
  };
}

function cli() {
  const value = (flag: string, fallback: number) => {
    const index = process.argv.indexOf(flag);
    const n = index < 0 ? fallback : Number(process.argv[index + 1]);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
    return n;
  };
  const players = value('--players', 100), hours = value('--hours', 40);
  const runs = (profile: Profile, rules: RuleSet, events?: SimulationOptions) =>
    Array.from({ length: players }, (_, i) => simulate(profile, rules, 1729 + i, hours, events));
  const output = (['original', 'candidate'] as const).flatMap(rules => profiles.map(profile => {
    return summarize(runs(profile, rules));
  }));
  // Matched archetypes isolate purchase choices and event availability; they are not separate predictions of real players.
  const cabComparison = [0, 1, 2, 3, 5].map(count => summarize(runs({ ...profiles[0], name: `${count} early cabs`,
    cabsBeforeHome: count, cabsAfterHome: count, utilization: 0.75 }, 'candidate', { global: false, room: false })));
  const constructionComparison = [false, true].map(staged => summarize(runs({ ...profiles[3],
    name: staged ? 'Four build stages' : 'One build payment', stagedBuild: staged }, 'candidate')));
  const eventComparison = [false, true].map(on => summarize(runs({ ...profiles[4],
    name: on ? 'Both event bonuses enabled' : 'Event bonuses disabled' }, 'candidate', { global: on, room: on })));
  const reserveComparison = [0, 1000000].map(reserve => summarize(runs({ ...profiles[0],
    name: reserve ? 'Keep $1m after second build' : 'Build as soon as affordable', secondBuildReserve: reserve }, 'candidate')));
  const recoveryComparison = [false, true].map(retainLocalJobs => summarize(runs({ ...profiles[0],
    name: retainLocalJobs ? 'Keep local city jobs' : 'Gate all jobs by wallet', stopSpendingAfterSecondHome: true },
  'candidate', { retainLocalJobs })));
  const checkinComparison = [profiles[0], profiles[3]].flatMap(profile => [false, true].map(checkins => summarize(runs({ ...profile,
    name: `${profile.name}, check-ins ${checkins ? 'on' : 'off'}` }, 'candidate', { checkins }))));
  const marketComparison = ([5, 6] as const).map(marketLevel => summarize(runs({ ...profiles[0],
    name: marketLevel === 5 ? '$1m market gate' : '$2m market gate' }, 'candidate', { marketLevel })));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ players, hours, output, cabComparison, constructionComparison, eventComparison, reserveComparison, recoveryComparison, checkinComparison, marketComparison }, null, 2));
  else {
    console.log(`Hypothetical ${players}-seed player simulations; ${hours} active hours per player.`);
    console.table(output.map(({ profile, rules, plotHrs, homeReached, homeP10, homeP50, homeP90, maxGapBeforeHomeHrs, maxGap40hHrs, optionsAt1h, optionsAt4h, optionsAt8h, optionsAt24h }) =>
      ({ profile, rules, plotHrs, homeReached, homeP10, homeP50, homeP90, maxGapBeforeHomeHrs, maxGap40hHrs, optionsAt1h, optionsAt4h, optionsAt8h, optionsAt24h })));
    console.log('Matched early-cab comparison:');
    console.table(cabComparison.map(({ profile, plotHrs, homeP50, homeBalance, finalCabs, cabIncome }) =>
      ({ profile, plotHrs, homeP50, homeBalance, finalCabs, cabIncome })));
    console.log('Matched construction and event comparisons:');
    console.table([...constructionComparison, ...eventComparison].map(({ profile, plotHrs, homeP50, homeBalance, plotRecoveryHrs, homeRecoveryHrs }) =>
      ({ profile, plotHrs, homeP50, homeBalance, plotRecoveryHrs, homeRecoveryHrs })));
    console.log('Second-home reserve comparison:');
    console.table(reserveComparison.map(({ profile, secondHomeReached, secondHomeHrs, secondHomeBeforeLevel, secondHomeAfterLevel, secondHomeRecovered, secondHomeRecoveryHrs }) =>
      ({ profile, secondHomeReached, secondHomeHrs, secondHomeBeforeLevel, secondHomeAfterLevel, secondHomeRecovered, secondHomeRecoveryHrs })));
    console.log('Second-home recovery comparison, with no further spending:');
    console.table(recoveryComparison.map(({ profile, secondHomeReached, secondHomeHrs, secondHomeRecovered, secondHomeRecoveryHrs }) =>
      ({ profile, secondHomeReached, secondHomeHrs, secondHomeRecovered, secondHomeRecoveryHrs })));
    console.log('Extra delivery check-ins comparison:');
    console.table(checkinComparison.map(({ profile, milestonesFirst4h, maxGapFirst8hHrs, homeP50, maxGap40hHrs }) =>
      ({ profile, milestonesFirst4h, maxGapFirst8hHrs, homeP50, maxGap40hHrs })));
    console.log('Property-market gate comparison:');
    console.table(marketComparison.map(({ profile, plotHrs, homeP50, homeBalance }) => ({ profile, plotHrs, homeP50, homeBalance })));
    console.log('Use --json for recovery times and approximate income/spending breakdowns. Home percentiles include only players who reached a home.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli();
