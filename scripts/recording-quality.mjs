#!/usr/bin/env node
// A diagnostic for one same-scenario recording-on/off pair, not a game performance gate.
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const present = value => typeof value === 'string' && value.length > 0;
const hash = value => present(value) && /^[0-9a-f]{64}$/i.test(value);
const round = value => Math.round(value * 1000) / 1000;
const percentile = (sorted, p) => sorted[Math.ceil(sorted.length * p) - 1];

function animation(manifest) {
  const events = manifest?.events;
  if (!Array.isArray(events)) return null;
  const starts = events.filter(event => event.type === 'frameStart');
  const stops = events.filter(event => event.type === 'frameStop');
  const recordingStarts = events.filter(event => event.type === 'recordStart');
  const recordingStops = events.filter(event => event.type === 'recordStop');
  const ordered = [recordingStarts[0], starts[0], stops[0], recordingStops[0]];
  if (starts.length !== 1 || stops.length !== 1 || starts[0].status !== 'ok' || stops[0].status !== 'ok' ||
      recordingStarts.length !== 1 || recordingStops.length !== 1 || ordered.some(event => event.status !== 'ok' || !finite(event.commandStartedAtMs)) ||
      ordered.some((event, i) => i > 0 && (events.indexOf(event) <= events.indexOf(ordered[i - 1]) || event.commandStartedAtMs < ordered[i - 1].commandStartedAtMs)) ||
      starts[0].commandStartedAtMs >= stops[0].commandStartedAtMs) return null;
  const sample = stops[0].sample, values = sample?.intervalsMs;
  if (!Array.isArray(values) || sample.truncated !== false || values.length < 30 || values.some(value => !finite(value) || value <= 0)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: values.length, seconds: round(values.reduce((a, b) => a + b, 0) / 1000),
    p50Ms: round(percentile(sorted, .5)), p95Ms: round(percentile(sorted, .95)), p99Ms: round(percentile(sorted, .99)),
    over33_4MsPercent: round(100 * values.filter(value => value > 33.4).length / values.length),
    over100MsPercent: round(100 * values.filter(value => value > 100).length / values.length) };
}

function identity(manifest) {
  const target = manifest?.target, r = manifest?.runner, v = manifest?.viewport;
  if (!/^[0-9a-f]{40}$/i.test(target?.refProvidedByOperator ?? '') || !present(target?.origin) || !present(target?.pathname) || !hash(manifest?.scenarioSha256) ||
      ![r?.platform, r?.architecture, r?.release, r?.cpu, r?.nodeVersion, r?.playwrightVersion, r?.browserChannel, r?.browserVersion, r?.gpuMode, r?.webgl?.renderer, r?.webgl?.vendor].every(present) ||
      !hash(r?.recorderSourceSha256) || !hash(r?.captureSourceSha256) || !Number.isSafeInteger(r?.logicalCpuCount) || r.logicalCpuCount < 1 || typeof r?.headed !== 'boolean' ||
      !Number.isSafeInteger(v?.width) || v.width < 1 || !Number.isSafeInteger(v?.height) || v.height < 1 || !finite(v?.deviceScaleFactor ?? 1) || (v?.deviceScaleFactor ?? 1) <= 0 ||
      (v?.isMobile !== undefined && typeof v.isMobile !== 'boolean') || (v?.hasTouch !== undefined && typeof v.hasTouch !== 'boolean')) return null;
  return JSON.stringify([target.refProvidedByOperator.toLowerCase(), target.origin, target.pathname, manifest.scenarioSha256, r.platform, r.architecture, r.release, r.cpu, r.logicalCpuCount,
    r.nodeVersion, r.playwrightVersion, r.browserChannel, r.browserVersion, r.gpuMode, r.headed, r.webgl.renderer, r.webgl.vendor,
    r.recorderSourceSha256, r.captureSourceSha256, v.width, v.height, v.deviceScaleFactor ?? 1, v.isMobile ?? false, v.hasTouch ?? false]);
}

const load = manifest => {
  const r = manifest?.runner;
  const valid = value => Array.isArray(value) && value.length === 3 && value.every(n => finite(n) && n >= 0);
  return valid(r?.hostLoadAverageAtStart) && valid(r?.hostLoadAverageAtFinish) ? { start: r.hostLoadAverageAtStart, finish: r.hostLoadAverageAtFinish } : null;
};

export function compareRecording(control, recorded) {
  const reasons = [], warnings = [];
  const controlIdentity = identity(control), recordedIdentity = identity(recorded);
  if (!controlIdentity || !recordedIdentity || controlIdentity !== recordedIdentity) reasons.push('Target, scenario, recorder, browser, renderer, host or viewport identity is missing or differs.');
  if (control?.status !== 'complete' || recorded?.status !== 'complete') reasons.push('A run did not complete.');
  if (control?.capture?.enabled !== false || recorded?.capture?.enabled !== true) reasons.push('The first run must have video off and the second video on.');
  if ([control, recorded].some(m => m?.browserErrors?.pageErrors !== 0 || m?.browserErrors?.consoleErrors !== 0)) reasons.push('Browser errors are present or unreported.');
  const withoutVideo = animation(control), withVideo = animation(recorded);
  if (!withoutVideo || !withVideo) reasons.push('Animation callback measurements are missing, too short, invalid or truncated.');
  const segments = recorded?.capture?.segments;
  if (!Array.isArray(segments) || !segments.length || !Array.isArray(recorded?.recordings) || segments.length !== recorded.recordings.length ||
      segments.some((segment, i) => segment?.video !== recorded.recordings[i] || segment.status !== 'available' || segment.finalized !== true))
    reasons.push('Video segments lack finalized, complete screencast timestamp evidence.');
  if (!load(control) || !load(recorded)) warnings.push('Host load context is unavailable.');
  if (withVideo?.p95Ms > 33.4) warnings.push(`Animation callback p95 was ${withVideo.p95Ms} ms while recording, above two 60 Hz intervals; inspect this footage for stutter. This is a diagnostic flag, not a game performance budget.`);
  if (Array.isArray(segments)) for (const segment of segments) {
    if (segment?.intervalMs?.gapsAtLeast100Ms > 0) warnings.push(`${segment.video}: ${segment.intervalMs.gapsAtLeast100Ms} browser screencast timestamp gaps of at least 100 ms; check motion in the footage.`);
    if (segment?.firstCallbackDelayMs >= 100) warnings.push(`${segment.video}: first screencast callback arrived ${round(segment.firstCallbackDelayMs)} ms after starting.`);
    if (segment?.callbackSilenceAtStopMs >= 100) warnings.push(`${segment.video}: ${round(segment.callbackSilenceAtStopMs)} ms without a callback before stopping.`);
  }
  return { comparison: reasons.length ? 'HOLD' : 'available', playerFidelity: 'UNVERIFIED', reasons, warnings, withoutVideo, withVideo,
    capture: { requestedFps: recorded?.capture?.requestedFps ?? null, segments: Array.isArray(segments) ? segments : [] },
    hostLoadAverage: { withoutVideo: load(control), withVideo: load(recorded) },
    limitations: [
      'The revision is an operator-provided label; verify it against the served build. The same input script does not by itself prove identical paths or workload.',
      'Animation intervals are browser callbacks. Screencast timestamps are browser capture observations; neither measures physical display presentation or GPU completion.',
      'The frame callback sends JPEG data to the recorder and adds overhead. One on/off pair is descriptive and cannot isolate a cause or establish a performance budget.',
      'Video packets and timing do not prove unique rendered images, correct playback, player-perceived smoothness or visual fidelity; inspect the footage and compare against real gameplay.'
    ] };
}

export async function inspectCaptureTraces(manifest, manifestPath) {
  const segments = manifest?.capture?.segments;
  if (!Array.isArray(segments) || !segments.length) return [{ status: 'unavailable', reason: 'No capture traces listed.' }];
  return Promise.all(segments.map(async segment => {
    const name = segment?.traceFile;
    if (typeof name !== 'string' || basename(name) !== name || name === '.' || name === '..') return { file: name, status: 'unavailable', reason: 'Invalid capture trace filename.' };
    try {
      const trace = JSON.parse(await readFile(join(dirname(resolve(manifestPath)), name), 'utf8'));
      const columns = ['browserPresentedAtUnixMs', 'callbackReceivedAtRunMs', 'viewportWidth', 'viewportHeight'];
      const samples = trace?.samples;
      if (trace.format !== 1 || JSON.stringify(trace.columns) !== JSON.stringify(columns) || !Array.isArray(samples) || samples.length < 2 ||
          samples.length !== segment.samplesRetained || samples.length !== segment.callbacksReceived || segment.truncated !== false ||
          samples.some((frame, i) => !Array.isArray(frame) || frame.length !== 4 || !finite(frame[0]) || frame[0] <= 0 || !finite(frame[1]) || frame[1] < 0 ||
            !Number.isSafeInteger(frame[2]) || frame[2] <= 0 || !Number.isSafeInteger(frame[3]) || frame[3] <= 0 ||
            (i > 0 && (frame[0] <= samples[i - 1][0] || frame[1] < samples[i - 1][1])))) throw new Error('Missing, truncated or invalid frame timestamps.');
      return { file: name, status: 'available', samples: samples.length };
    } catch (error) { return { file: name, status: 'unavailable', reason: `Capture trace unavailable: ${error.message}` }; }
  }));
}

// Demux packet metadata without decoding the whole video. Packet count is not a count of unique visual frames.
export async function inspectVideos(manifest, manifestPath) {
  if (!Array.isArray(manifest?.recordings) || !manifest.recordings.length) return [{ status: 'unavailable', reason: 'No recording files listed.' }];
  return Promise.all(manifest.recordings.map(async name => {
    if (typeof name !== 'string' || basename(name) !== name || name === '.' || name === '..') return { file: name, status: 'unavailable', reason: 'Invalid recording filename.' };
    const path = join(dirname(resolve(manifestPath)), name);
    try {
      const file = await stat(path);
      if (!file.isFile() || file.size === 0) throw new Error('Empty or missing video file.');
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_packets', '-of', 'json', path], { timeout: 30000, maxBuffer: 1024 * 1024 });
      const stream = JSON.parse(stdout).streams?.[0], packets = Number(stream?.nb_read_packets);
      if (!present(stream?.codec_name) || !Number.isSafeInteger(packets) || packets <= 0 || !Number.isSafeInteger(stream.width) || !Number.isSafeInteger(stream.height)) throw new Error('No readable video stream or packets.');
      return { file: name, status: 'available', bytes: file.size, codec: stream.codec_name, width: stream.width, height: stream.height, packetCount: packets, nominalRate: stream.r_frame_rate, averageRate: stream.avg_frame_rate };
    } catch (error) { return { file: name, status: 'unavailable', reason: `Video or ffprobe unavailable: ${error.message}` }; }
  }));
}

async function main() {
  const [controlPath, recordedPath, ...rest] = process.argv.slice(2);
  if (!controlPath || !recordedPath || rest.length) throw new Error('Usage: node scripts/recording-quality.mjs NO_VIDEO_MANIFEST RECORDED_MANIFEST');
  const [control, recorded] = await Promise.all([controlPath, recordedPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const result = compareRecording(control, recorded);
  [result.encodedVideos, result.captureTraces] = await Promise.all([inspectVideos(recorded, recordedPath), inspectCaptureTraces(recorded, recordedPath)]);
  if (result.encodedVideos.some(video => video.status !== 'available')) { result.comparison = 'HOLD'; result.reasons.push('Encoded video files or ffprobe packet metadata unavailable.'); }
  if (result.captureTraces.some(trace => trace.status !== 'available')) { result.comparison = 'HOLD'; result.reasons.push('Capture frame traces are missing, incomplete or invalid.'); }
  console.log(JSON.stringify(result, null, 2));
  if (result.comparison === 'HOLD') process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
