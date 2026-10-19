#!/usr/bin/env node
// A diagnostic for one same-scenario recording-on/off pair, not a game performance gate.
import { execFile, spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';

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
  const source = manifest?.capture?.source ?? 'screencast';
  if (!['screencast', 'tab'].includes(source) || (source === 'tab' && !hash(r?.tabCaptureSourceSha256))) return null;
  if (!/^[0-9a-f]{40}$/i.test(target?.refProvidedByOperator ?? '') || !present(target?.origin) || !present(target?.pathname) || typeof target?.perf !== 'boolean' || !hash(manifest?.scenarioSha256) ||
      ![r?.platform, r?.architecture, r?.release, r?.cpu, r?.nodeVersion, r?.playwrightVersion, r?.browserChannel, r?.browserVersion, r?.gpuMode, r?.webgl?.renderer, r?.webgl?.vendor].every(present) ||
      !hash(r?.recorderSourceSha256) || !hash(r?.captureSourceSha256) || !hash(r?.audioSourceSha256) || (r?.inputEventsSourceSha256 !== undefined && !hash(r.inputEventsSourceSha256)) || !Number.isSafeInteger(r?.logicalCpuCount) || r.logicalCpuCount < 1 || typeof r?.headed !== 'boolean' ||
      !Number.isSafeInteger(v?.width) || v.width < 1 || !Number.isSafeInteger(v?.height) || v.height < 1 ||
      !finite(source === 'tab' ? v?.deviceScaleFactor : v?.deviceScaleFactor ?? 1) || (v?.deviceScaleFactor ?? 1) <= 0 ||
      (v?.isMobile !== undefined && typeof v.isMobile !== 'boolean') || (v?.hasTouch !== undefined && typeof v.hasTouch !== 'boolean')) return null;
  return JSON.stringify([target.refProvidedByOperator.toLowerCase(), target.origin, target.pathname, target.perf, manifest.scenarioSha256, r.platform, r.architecture, r.release, r.cpu, r.logicalCpuCount,
    r.nodeVersion, r.playwrightVersion, r.browserChannel, r.browserVersion, r.gpuMode, r.headed, r.webgl.renderer, r.webgl.vendor,
    r.recorderSourceSha256, r.captureSourceSha256, r.audioSourceSha256, r.inputEventsSourceSha256 ?? null, source, source === 'tab' ? r.tabCaptureSourceSha256 : null, v.width, v.height, v.deviceScaleFactor ?? 1, v.isMobile ?? false, v.hasTouch ?? false]);
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
  if (control?.capture?.audio !== false || typeof recorded?.capture?.audio !== 'boolean') reasons.push('Audio capture configuration is missing or invalid.');
  if ([control, recorded].some(m => m?.browserErrors?.pageErrors !== 0 || m?.browserErrors?.consoleErrors !== 0)) reasons.push('Browser errors are present or unreported.');
  const withoutVideo = animation(control), withVideo = animation(recorded);
  if (!withoutVideo || !withVideo) reasons.push('Animation callback measurements are missing, too short, invalid or truncated.');
  const segments = recorded?.capture?.segments;
  if (!Array.isArray(segments) || !segments.length || !Array.isArray(recorded?.recordings) || segments.length !== recorded.recordings.length ||
      segments.some((segment, i) => segment?.video !== recorded.recordings[i] || segment.status !== 'available' || segment.finalized !== true ||
        ((recorded.capture.source ?? 'screencast') === 'tab') !== (segment.mode === 'tab')))
    reasons.push('Video segments lack finalized, complete capture evidence.');
  if (recorded?.capture?.audio === true && (!Array.isArray(recorded.audioRecordings) || !Array.isArray(recorded.recordings) ||
      recorded.audioRecordings.length !== recorded.recordings.length || recorded.audioRecordings.some((audio, i) =>
        typeof recorded.recordings[i] !== 'string' || audio?.file !== recorded.recordings[i].replace(/\.webm$/, '-audio.webm') || !finite(audio?.offsetMs) || !finite(audio?.startCommandWindowMs) || audio.startCommandWindowMs < 0)))
    reasons.push('Audio segments or their start timing metadata are missing or invalid.');
  if (!load(control) || !load(recorded)) warnings.push('Host load context is unavailable.');
  if (withVideo?.p95Ms > 33.4) warnings.push(`Animation callback p95 was ${withVideo.p95Ms} ms while recording, above two 60 Hz intervals; inspect this footage for stutter. This is a diagnostic flag, not a game performance budget.`);
  if (Array.isArray(segments)) for (const segment of segments) {
    if (segment?.intervalMs?.gapsAtLeast100Ms > 0) warnings.push(`${segment.video}: ${segment.intervalMs.gapsAtLeast100Ms} browser screencast timestamp gaps of at least 100 ms; check motion in the footage.`);
    if (segment?.firstCallbackDelayMs >= 100) warnings.push(`${segment.video}: first screencast callback arrived ${round(segment.firstCallbackDelayMs)} ms after starting.`);
    if (segment?.callbackSilenceAtStopMs >= 100) warnings.push(`${segment.video}: ${round(segment.callbackSilenceAtStopMs)} ms without a callback before stopping.`);
  }
  return { comparison: reasons.length ? 'HOLD' : 'available', recordingQuality: reasons.length || warnings.length ? 'HOLD' : 'UNVERIFIED', qualityAcceptance: 'HOLD', playerFidelity: 'UNVERIFIED', reasons, warnings, withoutVideo, withVideo,
    capture: { requestedFps: recorded?.capture?.requestedFps ?? null, audio: recorded?.capture?.audio ?? null, segments: Array.isArray(segments) ? segments : [] },
    hostLoadAverage: { withoutVideo: load(control), withVideo: load(recorded) },
    limitations: [
      'The revision is an operator-provided label; verify it against the served build. The same input script does not by itself prove identical paths or workload.',
      'Animation intervals are browser callbacks. Screencast frame timestamps and tab recording start/stop times are different capture observations; neither measures physical display presentation or GPU completion.',
      'Matching dimensions alone cannot establish captured tab identity or the correct crop.',
      'Capture adds overhead. One on/off pair is descriptive and cannot isolate a cause or establish a performance budget.',
      'When audio is enabled, the recorded run includes audio capture overhead, and its separate audio files are not proof of audible synchronization.',
      'Video packets and timing do not prove unique rendered images, correct playback, player-perceived smoothness or visual fidelity; inspect the footage and compare against real gameplay. Automated quality acceptance remains HOLD.'
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
      if (segment.mode === 'tab') {
        if (trace.format !== 3 || trace.mode !== 'tab' || trace.captureHandleCheck !== 'matched' || !finite(trace.startedAtBrowserMs) || !finite(trace.stoppedAtBrowserMs) || trace.stoppedAtBrowserMs <= trace.startedAtBrowserMs ||
            !Number.isSafeInteger(trace.chunks) || trace.chunks < 1 || !Number.isSafeInteger(trace.bytes) || trace.bytes < 1 || trace.settings?.displaySurface !== 'browser' ||
            !Number.isSafeInteger(trace.settings?.width) || trace.settings.width < 1 || !Number.isSafeInteger(trace.settings?.height) || trace.settings.height < 1) throw new Error('Invalid tab recording metadata or missing capture-handle match.');
        return { file: name, status: 'available', mode: 'tab', bytes: trace.bytes, width: trace.settings.width, height: trace.settings.height, spanMs: round(trace.stoppedAtBrowserMs - trace.startedAtBrowserMs) };
      }
      const columns = ['browserPresentedAtUnixMs', 'callbackReceivedAtRunMs', 'viewportWidth', 'viewportHeight'];
      const samples = trace?.samples;
      if (trace.format !== 1 || JSON.stringify(trace.columns) !== JSON.stringify(columns) || !Array.isArray(samples) || samples.length < 2 ||
          samples.length !== segment.samplesRetained || samples.length !== segment.callbacksReceived || segment.truncated !== false ||
          samples.some((frame, i) => !Array.isArray(frame) || frame.length !== 4 || !finite(frame[0]) || frame[0] <= 0 || !finite(frame[1]) || frame[1] < 0 ||
            !Number.isSafeInteger(frame[2]) || frame[2] <= 0 || !Number.isSafeInteger(frame[3]) || frame[3] <= 0 ||
            (i > 0 && (frame[0] <= samples[i - 1][0] || frame[1] < samples[i - 1][1])))) throw new Error('Missing, truncated or invalid frame timestamps.');
      return { file: name, status: 'available', samples: samples.length, spanMs: round(samples.at(-1)[0] - samples[0][0]) };
    } catch (error) { return { file: name, status: 'unavailable', reason: `Capture trace unavailable: ${error.message}` }; }
  }));
}

// Stream packet timestamps rather than buffering metadata for every frame in a long recording.
async function packetDuration(path) {
  const probe = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets',
    '-show_entries', 'packet=pts_time,duration_time', '-of', 'compact=p=0', path]);
  let stderr = '', timedOut = false;
  probe.stderr.setEncoding('utf8');
  probe.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4096); });
  const closed = new Promise(resolve => {
    probe.once('error', error => resolve({ error }));
    probe.once('close', code => resolve({ code }));
  });
  const timeout = setTimeout(() => { timedOut = true; probe.kill('SIGKILL'); }, 30000);
  let packets = 0, invalid = 0, first = Infinity, lastEnd = -Infinity, previous = null, nonIncreasing = 0, gapsAtLeast100Ms = 0;
  try {
    const lines = createInterface({ input: probe.stdout });
    for await (const line of lines) {
      if (!line.trim()) continue;
      const entries = new Map(line.split('|').map(entry => {
        const at = entry.indexOf('=');
        return at < 0 ? ['', ''] : [entry.slice(0, at), entry.slice(at + 1)];
      }));
      const pts = entries.get('pts_time'), duration = entries.get('duration_time');
      packets++;
      if (!present(pts) || pts === 'N/A' || !finite(Number(pts))) { invalid++; continue; }
      const time = Number(pts);
      if (previous !== null) {
        if (time <= previous) nonIncreasing++;
        else if ((time - previous) * 1000 >= 100) gapsAtLeast100Ms++;
      }
      previous = time;
      const packetSeconds = present(duration) && duration !== 'N/A' && finite(Number(duration)) && Number(duration) >= 0 ? Number(duration) : 0;
      first = Math.min(first, time);
      lastEnd = Math.max(lastEnd, time + packetSeconds);
    }
    const outcome = await closed;
    if (timedOut) throw new Error('Packet timestamp inspection timed out.');
    if (outcome.error) throw outcome.error;
    if (outcome.code !== 0) throw new Error(stderr || `ffprobe exited ${outcome.code}.`);
    if (!packets || invalid || !finite(first) || !finite(lastEnd) || lastEnd <= first)
      throw new Error('Video packet timestamps are missing or invalid.');
    return { packets, durationMs: round((lastEnd - first) * 1000), nonIncreasing, gapsAtLeast100Ms };
  } finally { clearTimeout(timeout); }
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
      const timing = await packetDuration(path);
      if (timing.packets !== packets) throw new Error('Packet counts differ between stream and timestamp inspections.');
      return { file: name, status: 'available', bytes: file.size, codec: stream.codec_name, width: stream.width, height: stream.height, packetCount: packets, packetDurationMs: timing.durationMs, packetNonIncreasing: timing.nonIncreasing, packetGapsAtLeast100Ms: timing.gapsAtLeast100Ms, nominalRate: stream.r_frame_rate, averageRate: stream.avg_frame_rate };
    } catch (error) { return { file: name, status: 'unavailable', reason: `Video or ffprobe unavailable: ${error.message}` }; }
  }));
}

// Keep file-integrity failures distinct: an invalid packet timestamp is not
// evidence that the encoder produced the wrong dimensions or lost bytes.
export function tabIntegrityReasons(video, trace, viewport) {
  const reasons = [];
  if (video.bytes !== trace.bytes) reasons.push(`${video.file}: video byte count differs from its capture trace.`);
  if (video.width !== trace.width || video.height !== trace.height) reasons.push(`${video.file}: video dimensions differ from its capture trace.`);
  // Permit floating-point representation noise, not a fractional pixel policy.
  const integerPixels = value => {
    const nearest = Math.round(value);
    const tolerance = Math.min(1e-7, 2 * Number.EPSILON * Math.max(1, Math.abs(value)));
    return Number.isSafeInteger(nearest) && nearest > 0 && Math.abs(value - nearest) <= tolerance ? nearest : null;
  };
  const width = integerPixels(viewport?.width * viewport?.deviceScaleFactor), height = integerPixels(viewport?.height * viewport?.deviceScaleFactor);
  if (!Number.isSafeInteger(viewport?.width) || viewport.width < 1 || !Number.isSafeInteger(viewport?.height) || viewport.height < 1 ||
      !finite(viewport?.deviceScaleFactor) || viewport.deviceScaleFactor <= 0 || width === null || height === null) {
    reasons.push(`${video.file}: manifest viewport or explicit device scale factor cannot establish integer pixel dimensions.`);
  } else {
    if (trace.width !== width || trace.height !== height) reasons.push(`${video.file}: capture trace dimensions differ from the manifest viewport pixel dimensions (${width}x${height}).`);
    if (video.width !== width || video.height !== height) reasons.push(`${video.file}: video dimensions differ from the manifest viewport pixel dimensions (${width}x${height}).`);
  }
  if (video.packetNonIncreasing) reasons.push(`${video.file}: ${video.packetNonIncreasing} non-increasing video packet timestamp${video.packetNonIncreasing === 1 ? '' : 's'}.`);
  return reasons;
}

export async function inspectAudio(manifest, manifestPath) {
  if (manifest?.capture?.audio === false) return [];
  if (manifest?.capture?.audio !== true || !Array.isArray(manifest?.audioRecordings) || !manifest.audioRecordings.length)
    return [{ status: 'unavailable', reason: 'Audio configuration or recordings are missing.' }];
  return Promise.all(manifest.audioRecordings.map(async audio => {
    const name = audio?.file;
    if (typeof name !== 'string' || basename(name) !== name || name === '.' || name === '..') return { file: name, status: 'unavailable', reason: 'Invalid audio filename.' };
    try {
      const path = join(dirname(resolve(manifestPath)), name), file = await stat(path);
      if (!file.isFile() || file.size === 0) throw new Error('Empty or missing audio file.');
      const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-count_packets', '-show_entries', 'stream=codec_name,nb_read_packets', '-of', 'json', path], { timeout: 30000, maxBuffer: 1024 * 1024 });
      const stream = JSON.parse(stdout).streams?.[0], packets = Number(stream?.nb_read_packets);
      if (!present(stream?.codec_name) || !Number.isSafeInteger(packets) || packets <= 0) throw new Error('No readable audio stream or packets.');
      return { file: name, status: 'available', bytes: file.size, codec: stream.codec_name, packetCount: packets };
    } catch (error) { return { file: name, status: 'unavailable', reason: `Audio or ffprobe unavailable: ${error.message}` }; }
  }));
}

// Check one actual artifact independently of route comparability or player fidelity.
export async function inspectRecordingArtifact(manifest, manifestPath) {
  const reasons = [], warnings = [];
  const files = manifest?.recordings, segments = manifest?.capture?.segments;
  if (!['screencast', 'tab'].includes(manifest?.capture?.source ?? 'screencast'))
    reasons.push('Recording source is invalid.');
  if (manifest?.status !== 'complete' || manifest?.capture?.enabled !== true)
    reasons.push('Run did not complete with video capture enabled.');
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length ||
      files.some(name => typeof name !== 'string' || !/^segment-\d{3}\.webm$/.test(name)) ||
      !Array.isArray(segments) || segments.length !== files.length || segments.some((segment, i) =>
        segment?.video !== files[i] || segment.traceFile !== files[i].replace(/\.webm$/, '.capture.json') ||
        segment.status !== 'available' || segment.finalized !== true ||
        ((manifest.capture.source ?? 'screencast') === 'tab') !== (segment.mode === 'tab')))
    reasons.push('Recording segments or their finalized capture metadata are missing or inconsistent.');
  if (manifest?.capture?.audio === true && (!Array.isArray(files) || !Array.isArray(manifest?.audioRecordings) ||
      manifest.audioRecordings.length !== files.length || manifest.audioRecordings.some((audio, i) =>
        typeof files[i] !== 'string' || audio?.file !== files[i].replace(/\.webm$/, '-audio.webm') ||
        !finite(audio.offsetMs) || !finite(audio.startCommandWindowMs) || audio.startCommandWindowMs < 0)))
    reasons.push('Audio segments or their start timing metadata are missing or invalid.');
  const [encodedVideos, captureTraces, audioFiles] = await Promise.all([
    inspectVideos(manifest, manifestPath), inspectCaptureTraces(manifest, manifestPath), inspectAudio(manifest, manifestPath),
  ]);
  if (encodedVideos.some(video => video.status !== 'available')) reasons.push('Video files or ffprobe packet metadata unavailable.');
  if (captureTraces.some(trace => trace.status !== 'available')) reasons.push('Capture traces are missing, incomplete or invalid.');
  if (audioFiles.some(audio => audio.status !== 'available')) reasons.push('Audio files or ffprobe packet metadata unavailable.');
  for (let i = 0; i < encodedVideos.length; i++) {
    const video = encodedVideos[i], trace = captureTraces[i];
    if (trace?.mode !== 'tab' || video?.status !== 'available') continue;
    reasons.push(...tabIntegrityReasons(video, trace, manifest.viewport));
    if (video.packetGapsAtLeast100Ms) warnings.push(`${video.file}: ${video.packetGapsAtLeast100Ms} encoded packet gaps of at least 100 ms; inspect the footage.`);
  }
  // Only reject video shorter than the observed trace. Allow at most 250 ms for
  // short-clip boundaries, capped at 25% of the trace, or 2% for longer clips.
  // This heuristic is not a motion or performance budget.
  const durationChecks = encodedVideos.map((video, i) => {
    const trace = captureTraces[i];
    if (video.status !== 'available' || trace?.status !== 'available') return { file: video.file, status: 'unavailable' };
    const toleranceMs = Math.min(Math.max(250, trace.spanMs * 0.02), trace.spanMs * 0.25);
    const status = video.packetDurationMs + toleranceMs >= trace.spanMs ? 'available' : 'HOLD';
    return { file: video.file, status, videoPacketDurationMs: video.packetDurationMs, traceSpanMs: trace.spanMs, toleranceMs: round(toleranceMs) };
  });
  if (durationChecks.some(check => check.status === 'unavailable')) reasons.push('A video duration comparison is unavailable because packet timing or capture trace evidence is unavailable.');
  if (durationChecks.some(check => check.status === 'HOLD')) reasons.push('A video packet duration is materially shorter than its capture trace.');
  const frameIntervals = animation(manifest);
  if (frameIntervals?.p95Ms > 33.4) warnings.push(`Animation callback p95 was ${frameIntervals.p95Ms} ms; inspect this footage for stutter.`);
  if (Array.isArray(segments)) for (const segment of segments) {
    if (segment?.intervalMs?.gapsAtLeast100Ms > 0) warnings.push(`${segment.video}: ${segment.intervalMs.gapsAtLeast100Ms} browser screencast timestamp gaps of at least 100 ms.`);
    if (segment?.firstCallbackDelayMs >= 100) warnings.push(`${segment.video}: ${round(segment.firstCallbackDelayMs)} ms before the first callback.`);
    if (segment?.callbackSilenceAtStopMs >= 100) warnings.push(`${segment.video}: ${round(segment.callbackSilenceAtStopMs)} ms without a callback before stopping.`);
  }
  return { artifact: reasons.length ? 'HOLD' : 'available', recordingQuality: reasons.length || warnings.length ? 'HOLD' : 'UNVERIFIED',
    qualityAcceptance: 'HOLD', playerFidelity: 'UNVERIFIED', reasons, warnings, frameIntervals, encodedVideos, captureTraces, audioFiles, durationChecks,
    limitations: ['Matching dimensions alone cannot establish captured tab identity or the correct crop.', 'Packet inspection does not decode the video or verify playback. Capture timestamps and video packets do not establish player-perceived smoothness. Host jitter is not a game performance regression.'] };
}

// Keep the saved on/off comparison consistent with the inspected artifact.
export function mergeRecordingInspection(comparison, inspected) {
  const reasons = [...comparison.reasons, ...(inspected.artifact === 'available' ? [] : inspected.reasons)];
  const warnings = [...new Set([...comparison.warnings, ...inspected.warnings])];
  return { ...comparison, artifact: inspected.artifact,
    comparison: inspected.artifact === 'available' ? comparison.comparison : 'HOLD',
    recordingQuality: reasons.length || warnings.length ? 'HOLD' : 'UNVERIFIED', qualityAcceptance: 'HOLD',
    reasons, warnings, encodedVideos: inspected.encodedVideos, captureTraces: inspected.captureTraces,
    audioFiles: inspected.audioFiles, durationChecks: inspected.durationChecks };
}

// A diagnostic observation alone never approves player-visible quality.
export function recordingQualityApproved(result) {
  return result?.recordingQuality === 'VERIFIED' && result?.qualityAcceptance === 'APPROVED' && result?.playerFidelity === 'VERIFIED';
}

async function main() {
  const [controlPath, recordedPath, ...rest] = process.argv.slice(2);
  if (!controlPath || !recordedPath || rest.length) throw new Error('Usage: node scripts/recording-quality.mjs NO_VIDEO_MANIFEST RECORDED_MANIFEST');
  const [control, recorded] = await Promise.all([controlPath, recordedPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const inspected = await inspectRecordingArtifact(recorded, recordedPath);
  const result = mergeRecordingInspection(compareRecording(control, recorded), inspected);
  console.log(JSON.stringify(result, null, 2));
  // Clean packet diagnostics do not establish playback or player fidelity.
  process.exitCode = result.recordingQuality === 'HOLD' ? 1 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
