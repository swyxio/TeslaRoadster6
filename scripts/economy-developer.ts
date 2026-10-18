// Proposed developer path: calibrate recurring earnings from delivery-led runs,
// then purchase one plot and build up to twenty floors. Run with --json for data.
import { pathToFileURL } from 'node:url';
import { paths } from './economy-five-minute.ts';
import { levelFor, nominalDeliveryHourly, simulate } from './economy-progression.ts';

export const developerPlot = 800_000;
export const foundationAndFirstFloor = 1_200_000;
export const secondFloor = 200_000;
export const developerGate = 2_000_000;
export const floorCount = 20;
export const floorAchievementAwards = new Map([[1, 5_000], [5, 10_000], [10, 25_000], [20, 50_000]]);

export function floorCosts(): number[] {
  return [foundationAndFirstFloor, ...Array.from({ length: floorCount - 1 }, (_, i) =>
    Math.round(secondFloor * 1.1 ** i / 1000) * 1000)];
}

type DeveloperInputs = {
  homeMinute: number; homeBalance: number; cashPerHourAt100Percent: number; cabPerHour: number;
  efficiency: number; horizonMinutes: number;
};
export function buildTower(input: DeveloperInputs) {
  const costs = floorCosts();
  let minute = input.homeMinute, cash = input.homeBalance, plot = false, floors = 0;
  let income = 0, achievementCash = 0, spending = 0, plotMinute: number | null = null;
  const reached: Record<number, number> = {};
  while (minute < input.horizonMinutes && floors < floorCount) {
    // Stay in San Jose and retain local tier-3 contracts after spending lowers cash.
    // Higher current-wallet tiers raise pay while affordable; no offline earnings.
    const rate = nominalDeliveryHourly(Math.max(3, levelFor(cash))) * input.efficiency + input.cabPerHour;
    const earned = rate / 12;
    cash += earned; income += earned; minute += 5;
    if (!plot && cash >= developerGate && cash >= developerPlot) {
      plot = true; plotMinute = minute; cash -= developerPlot; spending += developerPlot;
    }
    while (plot && floors < floorCount && cash >= costs[floors]) {
      cash -= costs[floors]; spending += costs[floors]; floors++;
      const award = floorAchievementAwards.get(floors) ?? 0;
      cash += award; achievementCash += award;
      if (floors === 5 || floors === 10 || floors === 20) reached[floors] = minute;
    }
  }
  if (Math.abs(cash - (input.homeBalance + income + achievementCash - spending)) > .0001) throw new Error('Developer ledger mismatch');
  return { homeMinute: input.homeMinute, plotMinute, reached, floors, cash, income, achievementCash, spending,
    finalLevel: levelFor(cash), efficiency: input.efficiency, cabPerHour: input.cabPerHour,
    lateRateAtCalibration: input.cashPerHourAt100Percent };
}

function percentile(values: number[], q: number) {
  if (!values.length) return null;
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
}
function round(n: number | null, digits = 1) { return n === null ? null : +n.toFixed(digits); }
export function runDeveloperPath(path: typeof paths[number], seed: number, horizonHours = 1500) {
  // Save after the first home, retaining the same cabs; fit an active earnings
  // factor from hours 32–40 before considering additional construction.
  const run = simulate(path.profile, 'candidate', seed, 40, { global: false, room: false, branchBalance: true,
    coreMilestones: true, cityVisitAwards: true, cadenceRedesign: true, saveForDevelopment: true, trackWindows: true });
  if (run.homeMinute === null || run.homeBalance === null) throw new Error(`No home by 40h: ${path.name} seed ${seed}`);
  const late = run.windows.filter(w => w.endMinute > 32 * 60 && w.endMinute <= 40 * 60);
  const nominal = late.reduce((n, w) => n + nominalDeliveryHourly(Math.max(3, w.level)) / 12, 0);
  const netDelivery = late.reduce((n, w) => n + w.recurring - w.cabIncome - w.fines, 0);
  const efficiency = netDelivery / nominal;
  const cabPerHour = late.reduce((n, w) => n + w.cabIncome, 0) / 8;
  if (!(efficiency > 0) || !Number.isFinite(efficiency)) throw new Error('Invalid late earnings calibration');
  return buildTower({ homeMinute: run.homeMinute, homeBalance: run.homeBalance,
    cashPerHourAt100Percent: (netDelivery / 8) + cabPerHour, cabPerHour, efficiency, horizonMinutes: horizonHours * 60 });
}

export function summarizeDeveloper(runs: ReturnType<typeof runDeveloperPath>[]) {
  const hours = (floor: number) => runs.flatMap(r => r.reached[floor] === undefined ? [] : [r.reached[floor] / 60]);
  const median = (values: number[], digits = 1) => round(percentile(values, .5), digits);
  return { players: runs.length, homeHoursMedian: median(runs.map(r => r.homeMinute / 60)),
    plotHoursMedian: median(runs.flatMap(r => r.plotMinute === null ? [] : [r.plotMinute / 60])),
    floors5: { reached: hours(5).length, medianHours: median(hours(5)), p10Hours: round(percentile(hours(5), .1)), p90Hours: round(percentile(hours(5), .9)) },
    floors10: { reached: hours(10).length, medianHours: median(hours(10)), p10Hours: round(percentile(hours(10), .1)), p90Hours: round(percentile(hours(10), .9)) },
    floors20: { reached: hours(20).length, medianHours: median(hours(20)), p10Hours: round(percentile(hours(20), .1)), p90Hours: round(percentile(hours(20), .9)) },
    lateHourlyNetMedian: median(runs.map(r => r.lateRateAtCalibration), 0),
    localEfficiencyMedian: median(runs.map(r => r.efficiency), 3), cabPerHourMedian: median(runs.map(r => r.cabPerHour), 0) };
}

function cli() {
  const index = process.argv.indexOf('--players'), players = index < 0 ? 250 : Number(process.argv[index + 1]);
  if (!Number.isInteger(players) || players < 1) throw new Error('--players must be a positive integer');
  const horizonHours = 1500;
  const output = paths.map(path => ({ path: path.name, ...summarizeDeveloper(Array.from({ length: players }, (_, i) => runDeveloperPath(path, 1729 + i, horizonHours))) }));
  const costs = floorCosts();
  const result = { players, seedStart: 1729, horizonHours, developerGate, developerPlot, floorCosts: costs,
    totalConstruction: costs.reduce((n, cost) => n + cost, 0), totalWithPlot: developerPlot + costs.reduce((n, cost) => n + cost, 0),
    milestoneAwards: [...floorAchievementAwards.entries()], output };
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.table(output.map(r => ({ path: r.path, lateHourlyNet: r.lateHourlyNetMedian,
    homeHours: r.homeHoursMedian, plotHours: r.plotHoursMedian, floors5: r.floors5.medianHours,
    floors10: r.floors10.medianHours, floors20: r.floors20.medianHours, floors20Reached: r.floors20.reached })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli();
