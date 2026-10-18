#!/usr/bin/env node
// Render a descriptive paired report; it never converts noisy lab samples to a gate.
import { readFile, writeFile } from 'node:fs/promises';

const [basePath, headPath, outputPath] = process.argv.slice(2);
if (!basePath || !headPath) throw new Error('Usage: performance-compare.mjs BASE_REPORT HEAD_REPORT [OUTPUT.md]');
const load = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const [base, head] = await Promise.all([load(basePath), load(headPath)]);
const n = value => typeof value === 'number' && Number.isFinite(value);
const fmt = value => n(value) ? String(Math.round(value * 1000) / 1000) : 'HOLD';
const fm = report => report?.metrics?.browserFrameIntervalP95?.p95Ms;
const room = report => report?.metrics?.roomProgress?.ratio;
const model = (report, profile = 'steady150') => report?.metrics?.modeledMotion?.[profile];
const speed = report => model(report)?.speedRatio;
const steering = report => model(report)?.steeringResponseMs;
const tuple = value => value ? `${fmt(value.p05)}–${fmt(value.p95)}×` : 'HOLD';
const onset = value => value ? `${fmt(value.left)} / ${fmt(value.right)} ms` : 'HOLD';
const browserKey = report => JSON.stringify([report?.environment?.platform, report?.environment?.release, report?.environment?.arch, report?.environment?.cpu, report?.environment?.logicalCpus, report?.environment?.runner?.nodeVersion, report?.environment?.runner?.playwrightVersion, report?.environment?.runner?.browserVersion, report?.environment?.runner?.gpuMode, report?.environment?.runner?.webgl?.renderer, report?.environment?.viewport, report?.fixture?.scenarioSha256, report?.fixture?.recorderSha256, report?.fixture?.reporterSha256]);
const browserComparable = !!(base && head && base.environment?.runner?.webgl?.renderer && base.fixture?.scenarioSha256 && base.fixture?.recorderSha256 && base.fixture?.reporterSha256 && browserKey(base) === browserKey(head));
const motionComparable = !!(base && head && base.fixture?.reporterSha256 && base.fixture.reporterSha256 === head.fixture?.reporterSha256 && base.fixture?.motionBenchmarkSha256 && base.fixture?.motionAdapterSha256 && base.fixture.motionBenchmarkSha256 === head.fixture?.motionBenchmarkSha256 && base.fixture.motionAdapterSha256 === head.fixture?.motionAdapterSha256);
const xy = p => p && n(p.x) && n(p.z) ? [p.x, p.z] : null;
const bEnd = xy(base?.route?.last), hEnd = xy(head?.route?.last);
const distance = bEnd && hEnd ? Math.hypot(bEnd[0] - hEnd[0], bEnd[1] - hEnd[1]) : null;
const routeComparable = n(distance) && distance <= 10;
const delta = (before, after, comparable, suffix) => n(before) && n(after) && comparable ? `${after - before >= 0 ? '+' : ''}${fmt(after - before)}${suffix}` : 'HOLD';
const mark = report => report ? `${report.target.version} · ${report.target.revision.slice(0, 12)}${report.target.dirty ? ' · dirty' : ''}` : 'HOLD (report missing)';
const lines = [
  '## Tesland performance observation', '',
  `Base: ${mark(base)}  `, `Candidate: ${mark(head)}`, '',
  '| Metric | Base | Candidate | Change |', '| --- | ---: | ---: | ---: |',
  `| Browser animation interval p95 | ${fmt(fm(base))} ms | ${fmt(fm(head))} ms | ${delta(fm(base), fm(head), browserComparable && routeComparable, ' ms')} |`,
  `| Modeled display / body speed p05–p95 | ${tuple(speed(base))} | ${tuple(speed(head))} | ${motionComparable ? 'see ranges' : 'HOLD'} |`,
  `| Modeled steering onset left / right | ${onset(steering(base))} | ${onset(steering(head))} | ${motionComparable ? 'see times' : 'HOLD'} |`,
  `| Room simulated / wall seconds | ${fmt(room(base))}× | ${fmt(room(head))}× | ${delta(room(base), room(head), browserComparable, '×')} |`, '',
  `Bunched 150 ms synthetic speed ratio: base ${tuple(model(base, 'bunched150')?.speedRatio)}, candidate ${tuple(model(head, 'bunched150')?.speedRatio)}.`,
  `Browser renderer: ${head?.environment?.runner?.webgl?.renderer ?? 'HOLD'}. Route endpoint difference: ${n(distance) ? `${fmt(distance)} m` : 'HOLD'}.`, '',
  'Animation intervals are browser callback timing, not GPU completion or actual display presentation. Motion and steering are synthetic at 120 Hz with simulated latency. Room progress is observed from received ticks over a local single-client window, mostly idle after a short drive. Video is off.',
  'A single paired run is descriptive, not a regression verdict; repeat on the same quiet hardware before setting thresholds. Traffic, collisions and paths can vary. Frame deltas are held if environments differ or endpoints differ by more than 10 m. Raw traces and conditions are in the uploaded artifact.',
];
const markdown = lines.join('\n') + '\n';
if (outputPath) await writeFile(outputPath, markdown);
console.log(markdown);
