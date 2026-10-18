// Reproducible visualizations of the economy model.
// Run: pnpm exec tsx scripts/economy-charts.ts [--players 250]
import { mkdirSync, writeFileSync } from 'node:fs';
import { paths } from './economy-five-minute.ts';
import { simulate, summarize, type Result } from './economy-progression.ts';

let WIDTH = 720;
let LEFT = 80;
let RIGHT = 690;
let MOBILE = false;
const BLUE = '#1268a3';
const GOLD = '#bd6a00';
const GRID = '#d6dde2';
const TEXT = '#1e2933';
const MUTED = '#4d5f6d';
const SAND = '#fff2d8';
const INK = '#7a4b00';

const names = paths.map(path => path.name);
const labels: Record<string, string> = {};

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function pct(values: number[], q: number): number {
  if (!values.length) throw new Error('No samples');
  return [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
}
function mean(values: number[]): number {
  if (!values.length) throw new Error('No samples');
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function fmt(n: number, decimals = 1): string { return n.toFixed(decimals).replace(/\.0$/, ''); }
function t(x: number, y: number, value: string, opts = ''): string {
  return `<text x="${x}" y="${y}" ${opts}>${escape(value)}</text>`;
}
function header(title: string, subtitle: string, height: number, description: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="chart-title chart-description">
<title id="chart-title">${escape(title)}</title><desc id="chart-description">${escape(description)}</desc>
<rect width="${WIDTH}" height="${height}" rx="16" fill="#fff"/>
<g font-family="system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" fill="${TEXT}">
${t(24, 39, title, 'font-size="26" font-weight="700"')}
${t(24, 69, subtitle, `font-size="18" fill="${MUTED}"`)}
`;
}
function footer(lines: string[], top: number): string {
  return lines.map((line, i) => t(24, top + i * 25, line, `font-size="17" fill="${MUTED}"`)).join('\n') + '\n</g></svg>\n';
}
function xFor(value: number, total: number): number { return LEFT + (RIGHT - LEFT) * value / total; }
function yFor(value: number, max: number, top: number, height: number): number { return top + height * (1 - value / max); }
function horizontal(top: number, height: number, max: number, values: number[], format: (n: number) => string): string {
  return values.map(value => {
    const y = yFor(value, max, top, height);
    return `<line x1="${LEFT}" x2="${RIGHT}" y1="${y}" y2="${y}" stroke="${GRID}" stroke-width="1"/>` +
      t(LEFT - 10, y + 6, format(value), `text-anchor="end" font-size="17" fill="${MUTED}"`);
  }).join('\n');
}
function xTicks(top: number, ticks: number[], max: number): string {
  return ticks.map(value => t(xFor(value, max), top, String(value), `font-size="17" fill="${MUTED}" text-anchor="middle"`)).join('\n');
}

type ChartPath = {
  name: string;
  wallet: number[];
  earnings: number[];
  achievements: number[];
  notifications: number[];
  inTargetPct: number;
  notificationTargetPct: number;
  homeReached: number;
  homeMedianHours: number | null;
};

function makeData(name: string, results: Result[]): ChartPath {
  const windows = results.map(result => result.windows);
  const wallet = Array.from({ length: 481 }, (_, i) => i === 0 ? 2500 : pct(windows.map(ws => ws[i - 1].wallet), .5));
  const blocks = (index: number) => windows.map(ws => ws.slice(index * 6, (index + 1) * 6));
  const earnings = Array.from({ length: 16 }, (_, i) => pct(blocks(i).map(ws => ws.reduce((sum, w) => sum + w.gross, 0) / 6), .5));
  const achievements = Array.from({ length: 16 }, (_, i) => mean(blocks(i).map(ws => ws.reduce((sum, w) => sum + w.achievements, 0))));
  const notifications = Array.from({ length: 16 }, (_, i) => mean(blocks(i).map(ws => ws.reduce((sum, w) => sum + w.achievementNotifications, 0))));
  const earlyNotificationBlocks = Array.from({ length: 4 }, (_, i) => blocks(i).map(ws => ws.reduce((sum, w) => sum + w.achievementNotifications, 0))).flat();
  const earlyAchievementBlocks = Array.from({ length: 4 }, (_, i) => blocks(i).map(ws => ws.reduce((sum, w) => sum + w.achievements, 0))).flat();
  const inTargetPct = earlyAchievementBlocks.filter(n => n >= 2 && n <= 4).length / earlyAchievementBlocks.length * 100;
  const notificationTargetPct = earlyNotificationBlocks.filter(n => n >= 2 && n <= 4).length / earlyNotificationBlocks.length * 100;
  const home = summarize(results);
  return { name, wallet, earnings, achievements, notifications, inTargetPct, notificationTargetPct, homeReached: home.homeReached, homeMedianHours: home.homeP50 };
}

function walletChart(data: ChartPath[], players: number): string {
  const top = 104, panelH = MOBILE ? 181 : 163, plotH = 108;
  const height = top + panelH * data.length + (MOBILE ? 160 : 120);
  const maxWallet = Math.max(2_500_000, ...data.flatMap(p => p.wallet));
  const max = Math.ceil(maxWallet / 500_000) * 500_000;
  const ticks = Array.from({ length: Math.floor(max / 1_000_000) + 1 }, (_, i) => i * 1_000_000);
  const details = data.map(p => `${p.name}: ${p.homeReached}/${players} first homes, median ${p.homeMedianHours ?? 'unreached'} hours`).join('; ');
  let svg = header('Seven ways to grow a wallet',
    MOBILE ? `Median · ${players} runs per path · bonuses off` : `Median wallet · ${players} simulated players per path · event bonuses off`, height,
    `Seven charts show the median modeled wallet every five active minutes over 40 hours. The dashed line marks the $2 million current-cash property market gate. Purchases lower cash. Each point is the median across the runs. ${details}.`);
  data.forEach((p, i) => {
    const y = top + i * panelH, chartY = y + (MOBILE ? 55 : 37);
    const home = p.homeMedianHours === null ? `Home: ${p.homeReached}/${players} by 40h` : `First home: ${fmt(p.homeMedianHours)}h median`;
    svg += t(24, y + 21, labels[p.name] ?? p.name, 'font-size="21" font-weight="700"');
    svg += MOBILE
      ? t(24, y + 44, home, `font-size="17" fill="${MUTED}"`)
      : t(RIGHT, y + 21, home, `font-size="17" fill="${MUTED}" text-anchor="end"`);
    svg += horizontal(chartY, plotH, max, ticks, v => `$${fmt(v / 1_000_000)}m`);
    const gateY = yFor(2_000_000, max, chartY, plotH);
    svg += `<line x1="${LEFT}" x2="${RIGHT}" y1="${gateY}" y2="${gateY}" stroke="${INK}" stroke-width="2" stroke-dasharray="7 5"/>`;
    const points = p.wallet.map((value, j) => `${xFor(j / 12, 40).toFixed(1)},${yFor(value, max, chartY, plotH).toFixed(1)}`).join(' ');
    svg += `<polyline fill="none" stroke="${BLUE}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${points}"/>`;
  });
  const end = top + panelH * data.length;
  svg += xTicks(end - 3, [0, 10, 20, 30, 40], 40);
  svg += t((LEFT + RIGHT) / 2, end + 23, 'Active hours', `font-size="18" fill="${MUTED}" text-anchor="middle"`);
  svg += footer(MOBILE ? ['Dashed line: $2m cash gate. Purchases',
    'lower the wallet.', 'Each point is the median across runs.',
    'Economy model · events off.'] : ['Dashed line = $2m cash gate. Buying a home or upgrades lowers the wallet.',
    'Each point is the median across runs.',
    'Economy model · events off.'], end + 55);
  return svg;
}

function blocksChart(data: ChartPath[], players: number, kind: 'achievements' | 'earnings'): string {
  const top = 120, panelH = MOBILE && kind === 'achievements' ? 171 : 149, plotH = 90;
  const height = top + panelH * data.length + (MOBILE ? 190 : 130);
  const achievement = kind === 'achievements';
  const maxValue = Math.max(...data.flatMap(p => achievement ? [...p.achievements, ...p.notifications] : p.earnings));
  const step = achievement ? 4 : 5000;
  const max = Math.max(step * 2, Math.ceil(maxValue / step) * step);
  const tickValues = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const details = data.map(p => `${p.name} ${achievement ? `${fmt(p.inTargetPct)}% of early blocks have 2–4 awards; ${fmt(p.notificationTargetPct)}% have 2–4 notifications` : `first 30-minute block earns a median $${Math.round(p.earnings[0] * 6).toLocaleString('en-US')} gross`}`).join('; ');
  let svg = header(achievement ? 'Awards and notifications' : 'Earnings per five active minutes',
    MOBILE ? (achievement ? `Mean per 30m · blue awards, gold alerts` : `Median gross per 5m · ${players} runs`)
      : (achievement ? `Mean per 30m · blue awards, gold notifications · ${players} runs` : `Median 30-minute gross, divided by six · ${players} simulated players`), height,
    `${achievement ? 'Each chart compares mean individual one-off awards with notifications grouped by the action that earned them, in 30-minute blocks. A target of two to four per block applies only to the first two hours. Means can conceal uneven blocks, so the chart reports the percentage of blocks within target.' : 'Each chart shows the median gross earnings in a 30-minute block divided by six, over the first eight active hours. Gross includes cash awards and cab earnings; purchases and fines affect wallet balance.'} Event bonuses are off. ${details}.`);
  data.forEach((p, i) => {
    const y = top + i * panelH, chartY = y + (MOBILE && achievement ? 56 : 34);
    svg += t(24, y + 20, labels[p.name] ?? p.name, 'font-size="21" font-weight="700"');
    if (achievement) svg += MOBILE
      ? t(24, y + 43, `${fmt(p.inTargetPct, 0)}% awards / ${fmt(p.notificationTargetPct, 0)}% alerts: 2–4`, `font-size="17" fill="${MUTED}"`)
      : t(RIGHT, y + 20, `${fmt(p.inTargetPct, 0)}% awards / ${fmt(p.notificationTargetPct, 0)}% alerts: 2–4`, `font-size="17" fill="${MUTED}" text-anchor="end"`);
    svg += horizontal(chartY, plotH, max, tickValues, v => achievement ? `${v}` : `$${v / 1000}k`);
    if (achievement) {
      const y2 = yFor(4, max, chartY, plotH), y4 = yFor(2, max, chartY, plotH);
      svg += `<rect x="${LEFT}" y="${y2}" width="${(RIGHT - LEFT) / 4}" height="${y4 - y2}" fill="${SAND}"/>`;
    }
    const barWidth = (RIGHT - LEFT) / 16;
    p[kind].forEach((value, j) => {
      const yValue = yFor(value, max, chartY, plotH);
      const width = achievement ? (barWidth - 4) / 2 : barWidth - 4;
      svg += `<rect x="${(LEFT + j * barWidth + 2).toFixed(1)}" y="${yValue.toFixed(1)}" width="${width.toFixed(1)}" height="${(chartY + plotH - yValue).toFixed(1)}" fill="${BLUE}"/>`;
      if (achievement) {
        const yNotification = yFor(p.notifications[j], max, chartY, plotH);
        svg += `<rect x="${(LEFT + j * barWidth + 2 + width).toFixed(1)}" y="${yNotification.toFixed(1)}" width="${width.toFixed(1)}" height="${(chartY + plotH - yNotification).toFixed(1)}" fill="${GOLD}"/>`;
      }
    });
  });
  const end = top + panelH * data.length;
  svg += xTicks(end, [0, 2, 4, 6, 8], 8);
  svg += t((LEFT + RIGHT) / 2, end + 25, 'Active hours · one bar = 30 minutes', `font-size="18" fill="${MUTED}" text-anchor="middle"`);
  const lines = MOBILE ? (achievement ? [
    'Shading: 2–4 one-off achievements per', '30-minute block, first two active hours.',
    'A notification groups awards from one action.', 'Check-ins and repeatables are excluded.',
    'Means can hide dry spells · events off.',
  ] : [
    'Gross includes task pay, awards and cab income.', 'Wallet balance also reflects purchases and fines.',
    'Each bar is the 30-minute median divided by six.', 'Five-minute windows can be empty during a task.',
    'Economy model · events off.',
  ]) : achievement ? [
    'Shaded band: target 2–4 one-off achievements per block, first 2h only.',
    'A notification groups all awards from one action. Check-ins and repeatables are excluded.',
    'Means can hide individual dry spells · events off.',
  ] : [
    'Gross includes task pay, cash awards and active-cab income.',
    'Each bar is a median across 250 runs; longer tasks can leave five-minute gaps.',
    'Economy model · events off.',
  ];
  // Match the player count in the caption when using a non-default run size.
  if (!achievement && !MOBILE) lines[1] = `Each bar is a median across ${players} runs; longer tasks can leave five-minute gaps.`;
  svg += footer(lines, end + 58);
  return svg;
}

const index = process.argv.indexOf('--players');
const players = index < 0 ? 250 : Number(process.argv[index + 1]);
if (!Number.isInteger(players) || players < 1) throw new Error('--players must be a positive integer');
const data = names.map(name => {
  const path = paths.find(item => item.name === name);
  if (!path) throw new Error(`Missing profile: ${name}`);
  const runs = Array.from({ length: players }, (_, i) => simulate(path.profile, 'candidate', 1729 + i, 40,
    { global: false, room: false, branchBalance: true, coreMilestones: true, cityVisitAwards: true, cadenceRedesign: true, winChance: path.winChance, trackWindows: true }));
  if (runs.some(run => run.windows.length !== 480)) throw new Error(`Expected 480 five-minute windows per run: ${name}`);
  return makeData(name, runs);
});
const target = 'public/blog/economy';
mkdirSync(target, { recursive: true });
writeFileSync(`${target}/wallet-curves.svg`, walletChart(data, players));
writeFileSync(`${target}/achievement-cadence.svg`, blocksChart(data, players, 'achievements'));
writeFileSync(`${target}/earnings-cadence.svg`, blocksChart(data, players, 'earnings'));
MOBILE = true; WIDTH = 460; LEFT = 61; RIGHT = 440;
writeFileSync(`${target}/wallet-curves-mobile.svg`, walletChart(data, players));
writeFileSync(`${target}/achievement-cadence-mobile.svg`, blocksChart(data, players, 'achievements'));
writeFileSync(`${target}/earnings-cadence-mobile.svg`, blocksChart(data, players, 'earnings'));
writeFileSync(`${target}/simulation-data.json`, JSON.stringify({ players, seedStart: 1729, activeHours: 40,
  events: false, candidate: 'cadence-redesign-v2', walletSampleMinutes: 5, blockMinutes: 30, data }, null, 2) + '\n');
console.log(`Wrote six SVG charts and source data to ${target} for ${players} seeds per path.`);
