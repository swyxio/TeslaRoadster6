// A transparent rate comparison for delivery-led research and airport quest lines.
// Run: pnpm exec tsx scripts/economy-research.ts
import { pathToFileURL } from 'node:url';

export const researchThresholds = [2, 6, 12, 20, 30] as const;
export const airportThresholds = [1, 4, 8, 14, 20] as const;
export const milestoneAwards = [500, 1000, 2000, 4000, 8000] as const;

export function questEconomics(thresholds: readonly number[], fare: number, minutes: number, supplement = 0) {
  if (thresholds.length !== milestoneAwards.length || thresholds.some((n, i) => !Number.isInteger(n) || n <= 0 || (i > 0 && n <= thresholds[i - 1])) ||
      !Number.isFinite(fare) || fare < 0 || !Number.isFinite(minutes) || minutes <= 0 || !Number.isFinite(supplement) || supplement < 0) {
    throw new Error('Invalid quest inputs');
  }
  const jobs = thresholds[thresholds.length - 1];
  const awards = milestoneAwards.reduce((sum, n) => sum + n, 0);
  const fareIncome = jobs * fare, supplementIncome = jobs * supplement, elapsedMinutes = jobs * minutes;
  return { jobs, elapsedMinutes, awardMinutes: thresholds.map(n => n * minutes), awards, fareIncome, supplementIncome,
    gross: fareIncome + supplementIncome + awards,
    recurringPerHour: (fare + supplement) * 60 / minutes,
    grossPerHour: (fareIncome + supplementIncome + awards) * 60 / elapsedMinutes };
}

export const firstHome = { gate: 2_000_000, plot: 400_000, build: 600_000, plotAward: 5000, homeAwards: 15000 } as const;
export const homeUpgrades = [
  { name: 'Furnishings', price: 20_000 },
  { name: 'Home charger', price: 25_000 },
  { name: 'Third garage space', price: 50_000 },
  { name: 'Thermal launch pad', price: 50_000 },
] as const;
export function firstHomePackage() {
  const afterHome = firstHome.gate - firstHome.plot - firstHome.build + firstHome.plotAward + firstHome.homeAwards;
  const upgrades = homeUpgrades.reduce((sum, item) => sum + item.price, 0);
  return { afterHome, upgradeSpend: upgrades, afterUpgrades: afterHome - upgrades };
}

function main() {
  const baseline = 11_000 * 60 / 6;
  console.log(`Tier-four baseline: $${baseline}/active hour; rate excludes other delivery achievements and checkpoints.`);
  console.table([
    { path: 'One research certification', ...questEconomics(researchThresholds, 11_000, 6) },
    { path: 'SFO airport line', ...questEconomics(airportThresholds, 11_000, 7, 2000) },
  ]);
  console.log('First home and four optional upgrades:', firstHomePackage());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
