// Hypothetical branch and pacing experiment; not an implementation of game rules.
// Run: pnpm exec tsx scripts/economy-five-minute.ts --players 250 --hours 40 [--landmarks-per-city 3] [--city-visits] [--events [--all-activities]] [--json]
import { pathToFileURL } from 'node:url';
import { profiles, simulate, summarize, type FiveMinuteWindow, type Profile, type Result } from './economy-progression.ts';

type Path = { name: string; profile: Profile; winChance?: number; requiresNewTour?: boolean };
const base: Profile = { ...profiles[0], sessionMinutes: 60, landmarkChance: 0, cabsBeforeHome: 0, cabsAfterHome: 0,
  cosmetics: [], earlyUpgrades: [], propertyFirst: true, travelAfterTasks: 6 };
export const paths: Path[] = [
  { name: 'Courier', profile: { ...base, name: 'Courier' } },
  { name: 'Explorer', profile: { ...base, name: 'Explorer', tourChance: 1 }, requiresNewTour: true },
  { name: 'Dome player', profile: { ...base, name: 'Dome player', domeChance: 1 } },
  { name: 'Dome player, no wins', profile: { ...base, name: 'Dome player, no wins', domeChance: 1 }, winChance: 0 },
  { name: 'Racer and parker', profile: { ...base, name: 'Racer and parker', activityChance: 1 } },
  { name: 'Cab operator', profile: { ...base, name: 'Cab operator', cabsBeforeHome: 3, cabsAfterHome: 3, utilization: .75 } },
  { name: 'Mixed activities', profile: { ...base, name: 'Mixed activities', domeChance: .2, activityChance: .3, tourChance: .4,
    cabsBeforeHome: 1, cabsAfterHome: 1, utilization: .75, cosmetics: [2000], earlyUpgrades: [10000] }, requiresNewTour: true },
];

function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * q)];
}
function mean(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function round(value: number | null, digits = 1) { return value === null ? null : +value.toFixed(digits); }
function longestEmpty(windows: FiveMinuteWindow[], hasEvent: (w: FiveMinuteWindow) => boolean) {
  let run = 0, longest = 0;
  for (const w of windows) { run = hasEvent(w) ? 0 : run + 1; longest = Math.max(longest, run); }
  return longest * 5;
}

export function phaseSummary(results: Result[], startMinute: number, endMinute: number) {
  const phase = results.map(r => r.windows.filter(w => w.endMinute > startMinute && w.endMinute <= endMinute));
  const windows = phase.flat();
  const blocks = phase.flatMap(ws => {
    const values: number[] = [];
    for (let i = 0; i + 6 <= ws.length; i += 6) values.push(ws.slice(i, i + 6).reduce((sum, w) => sum + w.gross, 0) / 6);
    return values;
  });
  const percentage = (fn: (w: FiveMinuteWindow) => boolean) => round(windows.filter(fn).length / windows.length * 100);
  const anyOneOff = (w: FiveMinuteWindow) => w.achievements + w.checkins + w.unlocks > 0;
  const anyGoal = (w: FiveMinuteWindow) => anyOneOff(w) || w.repeatableGoals > 0;
  return {
    startMinute, endMinute, windows: windows.length,
    meanGross5m: round(mean(windows.map(w => w.gross)), 0), medianGross5m: round(percentile(windows.map(w => w.gross), .5), 0),
    p10Gross5m: round(percentile(windows.map(w => w.gross), .1), 0), p90Gross5m: round(percentile(windows.map(w => w.gross), .9), 0),
    meanRecurring5m: round(mean(windows.map(w => w.recurring)), 0), meanCab5m: round(mean(windows.map(w => w.cabIncome)), 0),
    meanAchievementCash5m: round(mean(windows.map(w => w.achievementCash)), 0),
    meanCheckinCash5m: round(mean(windows.map(w => w.checkinCash)), 0), meanUnlockCash5m: round(mean(windows.map(w => w.unlockCash)), 0),
    meanSpending5m: round(mean(windows.map(w => w.spending)), 0), meanFines5m: round(mean(windows.map(w => w.fines)), 0),
    medianWalletChange5m: round(percentile(windows.map(w => w.cashChange), .5), 0),
    zeroGrossPct: percentage(w => w.gross === 0),
    meanAchievements5m: round(mean(windows.map(w => w.achievements)), 2),
    meanCityAchievements5m: round(mean(windows.map(w => w.cityAchievements)), 2), achievementWindowPct: percentage(w => w.achievements > 0),
    goalWindowPct: percentage(anyGoal), taskWindowPct: percentage(w => w.tasks > 0),
    median30mGrossPer5: round(percentile(blocks, .5), 0), p10_30mGrossPer5: round(percentile(blocks, .1), 0), p90_30mGrossPer5: round(percentile(blocks, .9), 0),
  };
}

export function summarizePath(name: string, results: Result[]) {
  const home = summarize(results);
  const sample = (minute: number) => {
    const ws = results.flatMap(r => r.windows.filter(w => w.endMinute === minute));
    return { minute, medianWallet: round(percentile(ws.map(w => w.wallet), .5), 0),
      pctLevel1: round(ws.filter(w => w.level >= 1).length / ws.length * 100),
      pctLevel2: round(ws.filter(w => w.level >= 2).length / ws.length * 100),
      pctLevel3: round(ws.filter(w => w.level >= 3).length / ws.length * 100),
      pctWithCab: round(ws.filter(w => w.cabs > 0).length / ws.length * 100) };
  };
  const early = results.map(r => r.windows.filter(w => w.endMinute <= 120));
  const dry = early.map(w => longestEmpty(w, x => x.achievements > 0));
  const goalDry = early.map(w => longestEmpty(w, x => x.achievements + x.checkins + x.unlocks + x.repeatableGoals > 0));
  const achievementBlocks = early.flatMap(ws => {
    const values: number[] = [];
    for (let i = 0; i + 6 <= ws.length; i += 6) values.push(ws.slice(i, i + 6).reduce((n, w) => n + w.achievements, 0));
    return values;
  });
  return { name, players: results.length, homeReached: home.homeReached, homeMedianHrs: home.homeP50, firstCabHrs: home.firstCabHrs,
    earlyAchievementDryMedianMin: round(percentile(dry, .5), 0), earlyAchievementDryP90Min: round(percentile(dry, .9), 0),
    earlyGoalDryMedianMin: round(percentile(goalDry, .5), 0), earlyGoalDryP90Min: round(percentile(goalDry, .9), 0),
    earlyAchievementBlocks30m: { blocks: achievementBlocks.length, mean: round(mean(achievementBlocks), 2),
      p10: percentile(achievementBlocks, .1), median: percentile(achievementBlocks, .5), p90: percentile(achievementBlocks, .9),
      below2Pct: round(achievementBlocks.filter(n => n < 2).length / achievementBlocks.length * 100),
      between2And4Pct: round(achievementBlocks.filter(n => n >= 2 && n <= 4).length / achievementBlocks.length * 100),
      above4Pct: round(achievementBlocks.filter(n => n > 4).length / achievementBlocks.length * 100) },
    phases: [[0, 60], [60, 240], [240, 480]].map(([a, b]) => phaseSummary(results, a, b)),
    samples: [30, 60, 120, 240, 480].map(sample) };
}

function cli() {
  const value = (flag: string, fallback: number) => {
    const index = process.argv.indexOf(flag), n = index < 0 ? fallback : Number(process.argv[index + 1]);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
    return n;
  };
  const players = value('--players', 250), hours = value('--hours', 40), eventsEnabled = process.argv.includes('--events');
  const landmarksPerCity = value('--landmarks-per-city', 3);
  const cityVisitAwards = process.argv.includes('--city-visits');
  const allActivityMultiplier = process.argv.includes('--all-activities');
  if (allActivityMultiplier && !eventsEnabled) throw new Error('--all-activities requires --events');
  if (hours < 8) throw new Error('--hours must be at least 8 to compare all pacing phases');
  const results = (['baseline', 'balanced'] as const).flatMap(rules => paths.flatMap(path => {
    if (rules === 'baseline' && path.requiresNewTour) return [];
    const runs = Array.from({ length: players }, (_, i) => simulate({ ...path.profile, landmarksPerCity }, 'candidate', 1729 + i, hours,
      { global: eventsEnabled, room: eventsEnabled, allActivityMultiplier, cityVisitAwards, branchBalance: rules === 'balanced', winChance: path.winChance,
        trackWindows: true, trackWindowsUntil: 480 }));
    return [{ rules, ...summarizePath(path.name, runs) }];
  }));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ players, hours, landmarksPerCity, eventsEnabled, allActivityMultiplier, cityVisitAwards, results }, null, 2));
  else {
    console.log(`Hypothetical ${players}-seed branches; ${hours} active hours, ${landmarksPerCity} landmarks/city, first-visit awards ${cityVisitAwards ? 'on for balanced' : 'off'}, events ${eventsEnabled ? 'on' : 'off'}${allActivityMultiplier ? ' for all activities' : ''}, first 8h in five-minute bins.`);
    console.table(results.map(r => ({ rules: r.rules, path: r.name, homeReached: r.homeReached, homeMedianHrs: r.homeMedianHrs,
      firstHourGross5m: r.phases[0].meanGross5m, hours1to4Gross5m: r.phases[1].meanGross5m,
      firstHourAchievements5m: r.phases[0].meanAchievements5m, firstHourZeroGrossPct: r.phases[0].zeroGrossPct,
      earlyAchievementDryP90Min: r.earlyAchievementDryP90Min, earlyGoalDryP90Min: r.earlyGoalDryP90Min })));
    console.log('See --json for distributions, net-wallet changes, city and cab access. Achievements exclude repeatable goals and check-ins.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli();
