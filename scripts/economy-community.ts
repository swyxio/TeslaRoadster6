// Daily population experiment built from the existing delivery-led player runs.
// Run: pnpm exec tsx scripts/economy-community.ts [--json]
import { pathToFileURL } from 'node:url';
import { paths } from './economy-five-minute.ts';
import { simulate } from './economy-progression.ts';

export type CommunityScenario = {
  name: string;
  counts: readonly [number, number, number, number]; // saver, first cab, fleet, casual
  activeMinutesPerDay: 30 | 60;
};
export const communities: CommunityScenario[] = [
  { name: '10 players, one hour/day', counts: [3, 3, 2, 2], activeMinutesPerDay: 60 },
  { name: '50 players, one hour/day', counts: [15, 15, 10, 10], activeMinutesPerDay: 60 },
  { name: '250 players, 30 minutes/day', counts: [75, 75, 50, 50], activeMinutesPerDay: 30 },
];
const profiles = [paths[0].profile, paths[1].profile, paths[2].profile, paths[5].profile];
const milestones = [10, 25, 50, 75, 90, 100] as const;

export function communityTimeline(scenario: CommunityScenario, target = 1_000_000_000) {
  if (!Number.isFinite(target) || target <= 0 || ![30, 60].includes(scenario.activeMinutesPerDay) ||
      scenario.counts.some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid community scenario');
  const people = scenario.counts.reduce((a, b) => a + b, 0);
  if (!people) throw new Error('At least one player is required');
  let index = 0;
  const players = scenario.counts.flatMap((count, profileIndex) => Array.from({ length: count }, () => {
    const run = simulate(profiles[profileIndex], 'candidate', 1729 + index++, 40,
      { global: false, room: false, branchBalance: true, coreMilestones: true, cityVisitAwards: true, trackWindows: true });
    // Beyond 40 hours, repeat each player's final eight-hour recurring rate; no one-off awards recur.
    const tail = run.windows.slice(32 * 12).reduce((sum, w) => sum + w.recurring, 0) / (8 * 12);
    return { windows: run.windows, tail };
  }));
  let total = people * 2500; // SF starting grants, counted exactly once.
  const firstIncome = total;
  const milestoneDays: Record<string, number> = {};
  const checkpoints: Record<string, number> = {};
  for (const percent of milestones) if (total >= target * percent / 100) milestoneDays[String(percent)] = 0;
  let day = 0;
  while (total < target && day < 10000) {
    const begin = day * scenario.activeMinutesPerDay / 5;
    const count = scenario.activeMinutesPerDay / 5;
    for (const player of players) for (let i = begin; i < begin + count; i++) total += player.windows[i]?.gross ?? player.tail;
    day++;
    for (const percent of milestones) if (milestoneDays[String(percent)] === undefined && total >= target * percent / 100) milestoneDays[String(percent)] = day;
    if ([30, 60, 90, 180].includes(day)) checkpoints[String(day)] = Math.round(total);
  }
  if (total < target) throw new Error('Target not reached within 10000 days');
  return { name: scenario.name, people, activeMinutesPerDay: scenario.activeMinutesPerDay, firstIncome, target,
    milestoneDays, checkpoints, finishDay: day, finalTotal: Math.round(total) };
}
function main() {
  const results = communities.map(s => communityTimeline(s));
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
  else console.table(results.map(({ name, milestoneDays, finishDay, checkpoints }) => ({ name, ...milestoneDays, finishDay, day30: checkpoints['30'] })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
