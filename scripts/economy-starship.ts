// Arithmetic sensitivity study, not a multiplayer economy or player forecast.
// Run: pnpm exec tsx scripts/economy-starship.ts
import { pathToFileURL } from 'node:url';

export interface FundingScenario {
  name: string;
  peoplePerDay: number;
  activeHoursPerPersonPerDay: number;
  grossPerActiveHour: number;
  equallyPopulatedRooms: number;
}

export function fundingTimeline(s: FundingScenario, target = 1_000_000_000) {
  const finiteNonNegative = (v: number) => Number.isFinite(v) && v >= 0;
  if (!Number.isFinite(target) || target <= 0 || !finiteNonNegative(s.peoplePerDay) ||
      !finiteNonNegative(s.activeHoursPerPersonPerDay) || s.activeHoursPerPersonPerDay > 24 ||
      !finiteNonNegative(s.grossPerActiveHour) || !Number.isInteger(s.equallyPopulatedRooms) || s.equallyPopulatedRooms < 1) {
    throw new Error('Invalid funding scenario');
  }
  const activeHoursPerDay = s.peoplePerDay * s.activeHoursPerPersonPerDay;
  const earnedPerDay = activeHoursPerDay * s.grossPerActiveHour;
  const days = (rate: number) => rate === 0 ? null : target / rate;
  return { activeHoursPerDay, earnedPerDay, activeHoursToGoal: days(s.grossPerActiveHour),
    globalEarnedDays: days(earnedPerDay), oneRoomEarnedDays: days(earnedPerDay / s.equallyPopulatedRooms) };
}

export const scenarios: FundingScenario[] = [
  { name: 'Small community', peoplePerDay: 10, activeHoursPerPersonPerDay: 1, grossPerActiveHour: 75_000, equallyPopulatedRooms: 1 },
  { name: 'Growing community', peoplePerDay: 50, activeHoursPerPersonPerDay: 1, grossPerActiveHour: 125_000, equallyPopulatedRooms: 5 },
  { name: 'Larger community', peoplePerDay: 250, activeHoursPerPersonPerDay: .5, grossPerActiveHour: 250_000, equallyPopulatedRooms: 5 },
];

function main() {
  console.log('Constant-rate sensitivity; $1bn target, illustrative inputs, not observed players. Days are real calendar days.');
  console.table(scenarios.map(s => ({ scenario: s.name, ...fundingTimeline(s) })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
