#!/usr/bin/env node
// Analyze a local, instrumented trace. This measures only the steady-travel
// speed target; input, contact/recovery, rendering and device gates are separate.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const finite = Number.isFinite;
const percentile = (values, p) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length ? ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)] : null;
};
const stats = values => ({ samples: values.length, p05: percentile(values, .05), p50: percentile(values, .5), p95: percentile(values, .95), min: percentile(values, 0), max: percentile(values, 1) });
const pose = value => value && ['x', 'y', 'z'].every(key => finite(value[key]));
const ordered = (items, key) => Array.isArray(items) && items.every((item, i) => finite(item?.[key]) && (!i || item[key] > items[i - 1][key]));
const identityKeys = ['captureId', 'roomGeneration', 'connectionGeneration', 'vehicleId', 'entityIncarnation'];
const validIdentity = identity => identity && identityKeys.every(key => typeof identity[key] === 'string' && identity[key].trim().length > 0);
const sameIdentity = (a, b) => validIdentity(a) && validIdentity(b) && identityKeys.every(key => a[key] === b[key]);
const heading = object => {
  const q = object?.q;
  if (!Array.isArray(q) || q.length !== 4 || !q.every(finite)) return null;
  const length = Math.hypot(...q);
  if (!finite(length) || length === 0) return null;
  const [x, y, z, w] = q.map(value => value / length);
  return Math.atan2(2 * (x * z + y * w), 1 - 2 * (x * x + y * y));
};
function prior(items, time) {
  let lo = 0, hi = items.length;
  while (lo < hi) { const middle = (lo + hi) >> 1; if (items[middle].atMs <= time) lo = middle + 1; else hi = middle; }
  return lo - 1;
}
function interpolation(ticks, time) {
  const i = prior(ticks, time);
  if (i < 0 || i >= ticks.length - 1) return null;
  const a = ticks[i], b = ticks[i + 1];
  const alpha = (time - a.atMs) / (b.atMs - a.atMs);
  return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, z: a.z + (b.z - a.z) * alpha };
}
export function distanceRangeForCommonOffset(ticks, a, b, minOffset, maxOffset) {
  // A linearly interpolated position is piecewise linear in the common clock
  // offset. Its displacement is therefore linear between breakpoints, and
  // the squared distance is quadratic. Include its interior minimum as well
  // as each segment endpoint; evaluating only the clock bounds is not enough.
  const offsets = [minOffset, maxOffset];
  for (const tick of ticks) for (const time of [a, b]) {
    const at = time - tick.atMs;
    if (at > minOffset && at < maxOffset) offsets.push(at);
  }
  offsets.sort((x, y) => x - y);
  const unique = offsets.filter((x, i) => i === 0 || x !== offsets[i - 1]);
  const vectors = unique.map(offset => {
    const x = interpolation(ticks, a - offset), y = interpolation(ticks, b - offset);
    return x && y ? [y.x - x.x, y.y - x.y, y.z - x.z] : null;
  });
  if (vectors.some(v => !v)) return null;
  let min = Infinity, max = 0;
  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i], distance = Math.hypot(...vector);
    min = Math.min(min, distance); max = Math.max(max, distance);
    if (!i) continue;
    const before = vectors[i - 1], delta = vector.map((value, j) => value - before[j]);
    const square = delta.reduce((sum, value) => sum + value * value, 0);
    if (square === 0) continue;
    const u = Math.max(0, Math.min(1, -before.reduce((sum, value, j) => sum + value * delta[j], 0) / square));
    min = Math.min(min, Math.hypot(...before.map((value, j) => value + u * delta[j])));
  }
  return { min, max };
}
const fullThrottleStraight = c => c && finite(c.throttle) && c.throttle >= .9 && finite(c.steer) && Math.abs(c.steer) < .001 && c.brake === false && c.boost === false && c.hover === false;

/**
 * trace: browser motion-harness trace {frames, controls, states, dropped, errors}.
 * authority: local-only collector {format:1, complete:true, dropped:0, failed:0, clock,
 *   collisionCoverage:'all-solid-and-entity-paths'|'grounded-path-v1',
 *   interpolation:{verified:true,maxPositionErrorM}, ticks:[...]}; ticks include
 *   {tick,atMs,x,y,z,yaw,vx,vy,vz,supportId,poseRevision,contactReasons:[]}.
 * trace.binding and authority.binding: {captureId,roomGeneration,
 *   connectionGeneration,vehicleId,entityIncarnation,verified:true}.
 * Each frame, control and tick carries an identity with the same five string
 * fields. The collector must independently verify the capture, room, connection
 * and vehicle incarnation; matching labels alone are not proof. Missing
 * identities, reconnects or vehicle reuse hold the whole result.
 * clock: {browserMinusAuthorityMinMs,browserMinusAuthorityMaxMs,
 *   bracketedBefore:true,bracketedAfter:true,continuityVerified:true,
 *   maxTickTimingErrorMs,offsetModel:'bounded'|'constant',
 *   constantOffsetVerified?:true}; bounds cover the WHOLE capture, including clock
 *   drift and the error in a tick's completion timestamp. These claims must
 *   be established by the collector, not inferred from two matching clocks.
 * window: {startMs,endMs} in browser performance.now() time. Both endpoints
 * must be exact observed frame times; every interval must be eligible.
 *
 * Piecewise linear tick poses are a reconstruction, not samples between
 * ticks. Each reference displacement is bounded by a maximum interpolation
 * speed times the per-endpoint timing uncertainty. The bounded model allows
 * independent offset changes at each endpoint; the optional constant model
 * evaluates all offsets in the bracket, including interior extrema, before
 * accounting for individual tick timing errors. Long gaps, contacts, support changes, incomplete trace
 * or missing timing/contact proof never become a speed-band pass. A speed-band
 * result is not the full driving-continuity gate: yaw/packet alignment, input,
 * recovery, devices and the remaining scenarios are not evaluated here.
 */
export function analyzeContinuity({ trace, authority, window } = {}) {
  const frames = trace?.frames, controls = trace?.controls, ticks = authority?.ticks, clock = authority?.clock;
  const scope = { analysis: 'steady-speed-only', continuityGate: 'HOLD', yawAndPacketAlignment: 'not-assessed' };
  const note = 'Speed-band analysis only. Capture identity, clock, interpolation and contact bounds are collector assertions. Window duration and representativeness, recurring pauses, yaw/packet alignment, input, contacts, recovery and devices require separate evidence; the continuity gate remains HOLD.';
  const invalid = [];
  if (!window || !finite(window.startMs) || !finite(window.endMs) || window.endMs <= window.startMs) invalid.push('invalid-window');
  if (!ordered(frames, 'atMs') || !ordered(controls, 'atMs') || !ordered(ticks, 'atMs')) invalid.push('unordered-or-missing-timelines');
  if (trace?.errors !== 0 || !trace?.dropped || ['frames', 'controls', 'states', 'events', 'sent', 'marks', 'turnarounds'].some(key => trace.dropped[key] !== 0) || Object.values(trace.dropped).some(n => n !== 0)) invalid.push('incomplete-browser-trace');
  if (authority?.format !== 1 || authority?.complete !== true || authority?.dropped !== 0 || authority?.failed !== 0) invalid.push('incomplete-authority-trace');
  const binding = trace?.binding;
  if (binding?.verified !== true || authority?.binding?.verified !== true || !sameIdentity(binding, authority.binding) ||
      ![frames, controls, ticks].every(items => Array.isArray(items) && items.every(item => sameIdentity(item?.identity, binding))))
    invalid.push('unproven-capture-identity');
  if (!['all-solid-and-entity-paths', 'grounded-path-v1'].includes(authority?.collisionCoverage)) invalid.push('unproven-contact-coverage');
  const interpolationError = authority?.interpolation?.maxPositionErrorM;
  if (authority?.interpolation?.verified !== true || !finite(interpolationError) || interpolationError < 0)
    invalid.push('unproven-position-interpolation-bound');
  const offsetMin = clock?.browserMinusAuthorityMinMs, offsetMax = clock?.browserMinusAuthorityMaxMs, tickError = clock?.maxTickTimingErrorMs;
  const offsetModel = clock?.offsetModel ?? 'bounded';
  if (!finite(offsetMin) || !finite(offsetMax) || offsetMin > offsetMax || !finite(tickError) || tickError < 0 ||
      clock?.bracketedBefore !== true || clock?.bracketedAfter !== true || clock?.continuityVerified !== true ||
      !['bounded', 'constant'].includes(offsetModel) || (offsetModel === 'constant' && clock?.constantOffsetVerified !== true)) invalid.push('unproven-clock-bounds');
  if (invalid.length) return { ...scope, status: 'unavailable', invalid, speedWithinTarget: null, samples: [], note };
  if (ticks.length < 2 || ticks.some(t => !Number.isSafeInteger(t.tick) || !pose(t) || !['vx', 'vy', 'vz', 'yaw'].every(k => finite(t[k])) ||
      typeof t.supportId !== 'string' || !Number.isSafeInteger(t.poseRevision) || !Array.isArray(t.contactReasons) || t.contactReasons.some(r => typeof r !== 'string')))
    return { ...scope, status: 'unavailable', invalid: ['invalid-authority-ticks'], speedWithinTarget: null, samples: [], note };

  const offset = (offsetMin + offsetMax) / 2;
  const timeErrorMs = (offsetMax - offsetMin) / 2 + tickError;
  const selectedFrames = frames.filter(frame => frame.atMs >= window.startMs && frame.atMs <= window.endMs);
  const windowCovered = selectedFrames.length >= 2 && selectedFrames[0].atMs === window.startMs && selectedFrames.at(-1).atMs === window.endMs;
  const excluded = { outsideWindow: 0, invalidFrame: 0, invalidYaw: 0, frameGap: 0, control: 0, unbracketed: 0, tickGap: 0, contact: 0, relocation: 0, support: 0, speed: 0, referenceSpeed: 0, unstableSpeed: 0, uncertainReference: 0 };
  const samples = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i], dt = b.atMs - a.atMs;
    if (a.atMs < window.startMs || b.atMs > window.endMs) { excluded.outsideWindow++; continue; }
    if (!pose(a.visual) || !pose(b.visual) || a.menu !== false || b.menu !== false || !(dt > 0)) { excluded.invalidFrame++; continue; }
    const ya = heading(a.visual), yb = heading(b.visual);
    if (ya === null || yb === null) { excluded.invalidYaw++; continue; }
    const controlIndex = prior(controls, a.atMs);
    if (controlIndex < 0 || prior(controls, b.atMs) !== controlIndex || !fullThrottleStraight(controls[controlIndex]) || controls[controlIndex].atMs > a.atMs - 500) { excluded.control++; continue; }
    const low = a.atMs - offset - timeErrorMs - 500, high = b.atMs - offset + timeErrorMs;
    const first = prior(ticks, low), last = prior(ticks, high) + 1;
    if (first < 0 || last >= ticks.length) { excluded.unbracketed++; continue; }
    const segment = ticks.slice(first, last + 1);
    if (segment.some((t, j) => j > 0 && (t.tick !== segment[j - 1].tick + 1 || t.atMs - segment[j - 1].atMs > 100))) { excluded.tickGap++; continue; }
    // If timing bounds allow a complete reference-tick interval to fit between
    // these frames, that interval could be entirely hidden. Conservatively use
    // independent offset extremes even for the common-offset model. This is an
    // evidence-resolution rule, not an FPS budget.
    if (segment.slice(1).some((t, j) =>
      segment[j].atMs + offsetMax + tickError >= a.atMs && t.atMs + offsetMin - tickError <= b.atMs)) {
      excluded.frameGap++; continue;
    }
    if (segment.some(t => t.contactReasons.length)) { excluded.contact++; continue; }
    if (segment.some(t => t.poseRevision !== segment[0].poseRevision)) { excluded.relocation++; continue; }
    if (segment.some(t => t.supportId !== segment[0].supportId || t.supportId !== 'ground')) { excluded.support++; continue; }
    const speeds = segment.map(t => Math.hypot(t.vx, t.vy, t.vz));
    if (speeds.some(speed => speed <= 10)) { excluded.speed++; continue; }
    // Do not trust a reported velocity alone when retained positions imply a
    // slower path. Use a lower bound that includes both timing and position error.
    const clockDriftMs = offsetModel === 'constant' ? 0 : offsetMax - offsetMin;
    if (segment.slice(1).some((t, j) => {
      const before = segment[j];
      const distance = Math.hypot(t.x - before.x, t.y - before.y, t.z - before.z);
      const minDistance = Math.max(0, distance - 2 * interpolationError);
      const maxElapsedMs = t.atMs - before.atMs + 2 * tickError + clockDriftMs;
      return !(minDistance * 1000 / maxElapsedMs > 10);
    })) { excluded.referenceSpeed++; continue; }
    const meanSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
    if (Math.max(...speeds) - Math.min(...speeds) > Math.max(1, .05 * meanSpeed)) { excluded.unstableSpeed++; continue; }
    const pa = interpolation(ticks, a.atMs - offset), pb = interpolation(ticks, b.atMs - offset);
    if (!pa || !pb) { excluded.unbracketed++; continue; }
    const displayed = Math.hypot(b.visual.x - a.visual.x, b.visual.y - a.visual.y, b.visual.z - a.visual.z);
    const reference = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
    let maxSpeed = 0;
    for (let j = 1; j < segment.length; j++) {
      const p = segment[j - 1], q = segment[j];
      maxSpeed = Math.max(maxSpeed, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) / (q.atMs - p.atMs));
    }
    const range = offsetModel === 'constant' ? distanceRangeForCommonOffset(segment, a.atMs, b.atMs, offsetMin, offsetMax) : { min: reference, max: reference };
    if (!range) { excluded.unbracketed++; continue; }
    const distanceError = 2 * (maxSpeed * (offsetModel === 'constant' ? tickError : timeErrorMs) + interpolationError);
    const referenceMin = Math.max(0, range.min - distanceError), referenceMax = range.max + distanceError;
    if (!(referenceMin > 0) || !(referenceMax > 0)) { excluded.uncertainReference++; continue; }
    const yawRate = Math.atan2(Math.sin(yb - ya), Math.cos(yb - ya)) * 180 / Math.PI * 1000 / dt;
    samples.push({ atMs: b.atMs, frameMs: dt, displayedM: displayed, referenceM: reference,
      ratio: displayed / reference, lowerRatio: displayed / referenceMax, upperRatio: displayed / referenceMin, yawRateDegPerSecond: yawRate,
      localPredicted: b.localPredicted === true, snapLocal: b.snapLocal === true });
  }
  const central = stats(samples.map(s => s.ratio)), lower = stats(samples.map(s => s.lowerRatio)), upper = stats(samples.map(s => s.upperRatio));
  const enoughSamples = samples.length >= 30;
  const incompleteIntervals = Object.entries(excluded).reduce((sum, [key, count]) => sum + (key === 'outsideWindow' ? 0 : count), 0);
  const speedWithinTarget = !enoughSamples || !windowCovered || incompleteIntervals ? null : lower.p05 >= .9 && upper.p95 <= 1.1 ? true : upper.p05 < .9 || lower.p95 > 1.1 ? false : null;
  return { ...scope, status: enoughSamples ? 'measured' : 'unavailable-insufficient-samples', invalid, speedWithinTarget,
    window, clock: { browserMinusAuthorityMinMs: offsetMin, browserMinusAuthorityMaxMs: offsetMax, maxTickTimingErrorMs: tickError, offsetModel, totalEndpointUncertaintyMs: timeErrorMs },
    maxPositionInterpolationErrorM: interpolationError,
    sampleCountMinimum: 30, windowCovered, durationMs: samples.reduce((sum, s) => sum + s.frameMs, 0), central, conservativeP05: lower.p05, conservativeP95: upper.p95,
    frameIntervalsMs: stats(samples.map(s => s.frameMs)), incompleteIntervals,
    excluded, samples, note };
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/driving-continuity-gate.mjs CAPTURE.json');
  const input = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'));
  const report = analyzeContinuity(input);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  // This CLI never declares the full continuity gate passed. A measured
  // speed failure is 1; all other results remain HOLD (2).
  process.exitCode = report.speedWithinTarget === false ? 1 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
