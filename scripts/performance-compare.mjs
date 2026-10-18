#!/usr/bin/env node
// Render a descriptive paired report; it never converts noisy lab samples to a gate.
import { readFile, writeFile } from 'node:fs/promises';

const [basePath, headPath, ...options] = process.argv.slice(2);
const flags = new Set(options.filter(option => option.startsWith('--')));
const outputs = options.filter(option => !option.startsWith('--'));
if (!basePath || !headPath || outputs.length > 1 || [...flags].some(flag => !['--require-route', '--require-comparable'].includes(flag))) throw new Error('Usage: performance-compare.mjs BASE_REPORT HEAD_REPORT [OUTPUT.md] [--require-route|--require-comparable]');
const outputPath = outputs[0];
const load = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const [base, head] = await Promise.all([load(basePath), load(headPath)]);
const n = value => typeof value === 'number' && Number.isFinite(value);
const fmt = value => n(value) ? String(Math.round(value * 1000) / 1000) : 'HOLD';
const fm = report => report?.metrics?.browserFrameIntervalP95?.status === 'available' ? report.metrics.browserFrameIntervalP95.p95Ms : undefined;
const room = report => report?.metrics?.roomProgress?.status === 'available' ? report.metrics.roomProgress.ratio : undefined;
const model = (report, profile = 'steady150') => report?.metrics?.modeledMotion?.[profile]?.status === 'available' ? report.metrics.modeledMotion[profile] : undefined;
const validModel = (report, profile) => {
  const result = model(report, profile);
  return [result?.speedRatio?.p05, result?.speedRatio?.p95, result?.steeringResponseMs?.left, result?.steeringResponseMs?.right].every(n);
};
const metricsComplete = report => n(fm(report)) && n(room(report)) && validModel(report, 'steady150') && validModel(report, 'bunched150');
const speed = report => model(report)?.speedRatio;
const steering = report => model(report)?.steeringResponseMs;
const tuple = value => value ? `${fmt(value.p05)}–${fmt(value.p95)}×` : 'HOLD';
const onset = value => value ? `${fmt(value.left)} / ${fmt(value.right)} ms` : 'HOLD';
const hasTarget = report => typeof report?.target?.version === 'string' && !!report.target.version && typeof report.target.revision === 'string' && !!report.target.revision;
const targetsIdentified = hasTarget(base) && hasTarget(head);
const browserKey = report => JSON.stringify([report?.environment?.platform, report?.environment?.release, report?.environment?.arch, report?.environment?.cpu, report?.environment?.logicalCpus, report?.environment?.runner?.nodeVersion, report?.environment?.runner?.playwrightVersion, report?.environment?.runner?.browserVersion, report?.environment?.runner?.gpuMode, report?.environment?.runner?.webgl?.renderer, report?.environment?.viewport, report?.fixture?.scenarioSha256, report?.fixture?.recorderSha256, report?.fixture?.reporterSha256, report?.fixture?.stageSha256, report?.fixture?.seed]);
const browserComparable = !!(targetsIdentified && base.environment?.runner?.webgl?.renderer && base.fixture?.scenarioSha256 && base.fixture?.recorderSha256 && base.fixture?.reporterSha256 && base.fixture?.stageSha256 && base.fixture.captureVideo === false && head.fixture?.captureVideo === false && browserKey(base) === browserKey(head));
const motionComparable = !!(targetsIdentified && base.fixture?.reporterSha256 && base.fixture.reporterSha256 === head.fixture?.reporterSha256 && base.fixture?.motionBenchmarkSha256 && base.fixture?.motionAdapterSha256 && base.fixture.motionBenchmarkSha256 === head.fixture?.motionBenchmarkSha256 && base.fixture.motionAdapterSha256 === head.fixture?.motionAdapterSha256);
const steadyComparable = motionComparable && validModel(base, 'steady150') && validModel(head, 'steady150');
function compareRoutes(before, after) {
  if (before?.status !== 'available' || after?.status !== 'available' || before.legs?.length !== 5 || after.legs?.length !== 5) return { comparable: false, reason: 'two-delivery route milestones, jumps, flight, or five leg traces unavailable; three-leg reports are incompatible with this scenario' };
  const validOrder = order => typeof order?.restaurant?.id === 'string' && !!order.restaurant.id &&
    [order.restaurant.x, order.restaurant.z].every(n) && Number.isSafeInteger(order.restaurant.index) && order.restaurant.index >= 0 &&
    typeof order?.customer?.id === 'string' && !!order.customer.id &&
    [order.customer.x, order.customer.y, order.customer.z].every(n) && typeof order.customer.rooftop === 'boolean' &&
    Number.isSafeInteger(order.customer.index) && order.customer.index >= 0;
  // Catalog indices are only meaningful inside their own revision.
  const orderKey = order => [order.restaurant.id, order.restaurant.x, order.restaurant.z, order.customer.id, order.customer.x, order.customer.y, order.customer.z, order.customer.rooftop];
  if (!validOrder(before.initialOrder) || !validOrder(after.initialOrder) || JSON.stringify(orderKey(before.initialOrder)) !== JSON.stringify(orderKey(after.initialOrder)))
    return { comparable: false, reason: 'initial delivery identity or coordinates differ or are unavailable' };
  if (!validOrder(before.secondOrder) || !validOrder(after.secondOrder) || JSON.stringify(orderKey(before.secondOrder)) !== JSON.stringify(orderKey(after.secondOrder)))
    return { comparable: false, reason: 'second delivery identity or coordinates differ or are unavailable' };
  const validMilestones = route => {
    const expected = [[0, 'pickup'], [0, 'dropoff'], [1, 'pickup'], [1, 'dropoff'], [2, 'pickup']];
    if (!Array.isArray(route.milestones) || route.milestones.length !== expected.length || route.milestones.some((m, i) =>
      m?.completed !== expected[i][0] || m.stage !== expected[i][1] || !Number.isSafeInteger(m.tick) || m.tick < 0 || ![m.x, m.z].every(n) || (i && m.tick < route.milestones[i - 1].tick))) return false;
    const first = route.firstCompletion, staging = route.staging;
    return Number.isSafeInteger(first?.tick) && [first.x, first.z].every(n) && first.tick >= route.milestones[1].tick &&
      Number.isSafeInteger(staging?.stagedTick) && Number.isSafeInteger(staging?.confirmedTick) && first.tick <= staging.stagedTick &&
      staging.stagedTick < staging.confirmedTick && staging.confirmedTick <= route.milestones[2].tick;
  };
  if (!validMilestones(before) || !validMilestones(after)) return { comparable: false, reason: 'five delivery milestones or second-order staging evidence unavailable' };
  const errors = [];
  const legs = [];
  for (let i = 0; i < 5; i++) {
    const a = before.legs[i], b = after.legs[i];
    if (!n(a?.lengthM) || !n(b?.lengthM) || a.points?.length !== 41 || b.points?.length !== 41 || Math.abs(a.lengthM - b.lengthM) > Math.max(20, a.lengthM * .25)) return { comparable: false, reason: `leg ${i + 1} length or samples differ` };
    const legErrors = [];
    for (let j = 0; j < 41; j++) {
      if (!Array.isArray(a.points[j]) || !Array.isArray(b.points[j]) || a.points[j].length !== 3 || b.points[j].length !== 3 || ![...a.points[j], ...b.points[j]].every(n)) return { comparable: false, reason: 'invalid path coordinates' };
      legErrors.push(Math.hypot(...a.points[j].map((coordinate, k) => coordinate - b.points[j][k])));
    }
    legErrors.sort((a, b) => a - b);
    legs.push({ leg: i + 1, p95: legErrors[Math.floor((legErrors.length - 1) * .95)], max: legErrors.at(-1) });
    errors.push(...legErrors);
  }
  errors.sort((a, b) => a - b);
  const p95 = errors[Math.floor((errors.length - 1) * .95)], max = errors.at(-1);
  const divergent = legs.find(leg => leg.p95 > 25 || leg.max > 50);
  return { comparable: !divergent, p95, max, legs, reason: divergent ? `leg ${divergent.leg} path divergence exceeds tolerance` : 'all five legs aligned' };
}
const route = compareRoutes(base?.route, head?.route);
const routeComparable = route.comparable && targetsIdentified;
const routeReason = targetsIdentified ? route.reason : 'target identity missing';
const delta = (before, after, comparable, suffix) => n(before) && n(after) && comparable ? `${after - before >= 0 ? '+' : ''}${fmt(after - before)}${suffix}` : 'HOLD';
const mark = report => !report ? 'HOLD (report missing)' : !hasTarget(report) ? 'HOLD (target identity missing)' : `${report.target.version} · ${report.target.revision.slice(0, 12)}${report.target.dirty ? ' · dirty' : ''}`;
const capture = report => report?.fixture?.captureVideo === true ? 'on' : report?.fixture?.captureVideo === false ? 'off' : 'HOLD';
const stagingDuration = report => {
  const duration = report?.route?.staging?.durationMs;
  return n(duration) && duration >= 0 ? `${fmt(duration)} ms` : 'unavailable';
};
const lines = [
  '## Tesland performance observation', '',
  `Base: ${mark(base)}  `, `Candidate: ${mark(head)}`, '',
  '| Metric | Base | Candidate | Change |', '| --- | ---: | ---: | ---: |',
  `| Browser animation interval p95 | ${fmt(fm(base))} ms | ${fmt(fm(head))} ms | ${delta(fm(base), fm(head), browserComparable && routeComparable, ' ms')} |`,
  `| Modeled display / body speed p05–p95 | ${tuple(speed(base))} | ${tuple(speed(head))} | ${steadyComparable ? 'see ranges' : 'HOLD'} |`,
  `| Modeled steering onset left / right | ${onset(steering(base))} | ${onset(steering(head))} | ${steadyComparable ? 'see times' : 'HOLD'} |`,
  `| Room simulated / wall seconds | ${fmt(room(base))}× | ${fmt(room(head))}× | ${delta(room(base), room(head), browserComparable && routeComparable, '×')} |`, '',
  `Bunched 150 ms synthetic speed ratio: base ${tuple(model(base, 'bunched150')?.speedRatio)}, candidate ${tuple(model(head, 'bunched150')?.speedRatio)}.`,
  `Browser renderer: ${head?.environment?.runner?.webgl?.renderer ?? 'HOLD'}. Route: ${routeReason}; path difference p95 ${fmt(route.p95)} m, max ${fmt(route.max)} m.`, '',
  `Path difference by leg (p95 / max, m): ${route.legs?.map(leg => `${leg.leg}: ${fmt(leg.p95)} / ${fmt(leg.max)}`).join('; ') ?? 'HOLD'}.`, '',
  `Second-delivery staging duration: base ${stagingDuration(base)}, candidate ${stagingDuration(head)}.`, '',
  `Required observations: ${metricsComplete(base) && metricsComplete(head) ? 'available' : 'HOLD (one or more metrics are missing or unavailable)'}.`, '',
  `Animation intervals are browser callback timing, not GPU completion or actual display presentation. The p95 includes the mostly stationary staging wait; distance-based path matching does not control elapsed time. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks during two deliveries and flight in one local room. Video capture: base ${capture(base)}, candidate ${capture(head)}; video observations do not produce performance deltas.`,
  'A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Frame and room deltas are held if environments or either delivery target differ, video is enabled, milestones are missing, or any of the five sampled paths diverges beyond the documented tolerances. Three-leg reports are incompatible with this scenario. Raw traces and conditions are in the uploaded artifact.',
];
const markdown = lines.join('\n') + '\n';
if (outputPath) await writeFile(outputPath, markdown);
console.log(markdown);
if ((flags.has('--require-route') && !routeComparable) || (flags.has('--require-comparable') && !(routeComparable && browserComparable && motionComparable && metricsComplete(base) && metricsComplete(head)))) process.exitCode = 1;
