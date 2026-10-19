import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareRecording, inspectAudio, inspectCaptureTraces, inspectRecordingArtifact, inspectVideos } from '../scripts/recording-quality.mjs';

const ref = 'a'.repeat(40), hash = 'b'.repeat(64);
const run = (video: boolean) => ({
  status: 'complete', target: { refProvidedByOperator: ref, origin: 'http://127.0.0.1:8787', pathname: '/', perf: true }, scenarioSha256: hash,
  runner: { platform: 'darwin', architecture: 'arm64', release: '24', cpu: 'Apple', logicalCpuCount: 10,
    nodeVersion: 'v22', playwrightVersion: '1.64.1', browserChannel: 'chrome', browserVersion: '155',
    gpuMode: 'metal', headed: false, webgl: { renderer: 'Metal', vendor: 'Apple' }, recorderSourceSha256: hash,
    captureSourceSha256: hash, audioSourceSha256: hash, hostLoadAverageAtStart: [2, 3, 4], hostLoadAverageAtFinish: [3, 4, 5] },
  viewport: { width: 1280, height: 720 }, browserErrors: { pageErrors: 0, consoleErrors: 0 },
  capture: { enabled: video, audio: false, requestedFps: 30, segments: video ? [{ video: 'segment-001.webm', status: 'available', finalized: true, intervalMs: { gapsAtLeast100Ms: 1 } }] : [] },
  recordings: video ? ['segment-001.webm'] : [],
  events: [{ type: 'recordStart', status: 'ok', commandStartedAtMs: 90 }, { type: 'frameStart', status: 'ok', commandStartedAtMs: 100 }, { type: 'frameStop', status: 'ok', commandStartedAtMs: 4000,
    sample: { intervalsMs: [...Array(98).fill(16.7), 40, 120], truncated: false } }, { type: 'recordStop', status: 'ok', commandStartedAtMs: 4010 }],
});

test('recording comparison describes long callback gaps without claiming player fidelity', () => {
  const result = compareRecording(run(false), run(true));
  assert.equal(result.comparison, 'available');
  assert.equal(result.recordingQuality, 'HOLD');
  assert.equal(result.playerFidelity, 'UNVERIFIED');
  assert.equal(result.withVideo?.p95Ms, 16.7);
  assert.equal(result.withVideo?.over33_4MsPercent, 2);
  assert.equal(result.withVideo?.over100MsPercent, 1);
  assert.match(result.warnings[0], /1 browser screencast timestamp gaps/);
  assert.match(result.limitations.join(' '), /physical display presentation/);
  const noGaps = run(true);
  noGaps.capture.segments[0].intervalMs.gapsAtLeast100Ms = 0;
  assert.equal(compareRecording(run(false), noGaps).recordingQuality, 'UNVERIFIED');
  const slow = run(true);
  slow.events[2].sample!.intervalsMs = Array(100).fill(116.7);
  assert.match(compareRecording(run(false), slow).warnings.join(' '), /callback p95 was 116.7 ms/);
});

test('recording comparison holds missing, mixed or incomplete evidence', () => {
  const control = run(false), video = run(true);
  assert.equal(compareRecording(run(true), video).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, scenarioSha256: 'different' }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, scenarioSha256: 'different' }).recordingQuality, 'HOLD');
  assert.equal(compareRecording(control, { ...video, runner: { ...video.runner, browserVersion: 'other' } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, runner: { ...video.runner, audioSourceSha256: 'c'.repeat(64) } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, capture: { ...video.capture, audio: true } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, capture: { ...video.capture, audio: true }, audioRecordings: [{ file: 'segment-001-audio.webm', offsetMs: 2, startCommandWindowMs: 1 }] }).comparison, 'available');
  assert.equal(compareRecording(control, { ...video, target: { ...video.target, origin: 'https://example.com' } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, target: { ...video.target, perf: false } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, target: { ...video.target, refProvidedByOperator: 'main' } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, browserErrors: { pageErrors: 1, consoleErrors: 0 } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, capture: { ...video.capture, segments: [{ ...video.capture.segments[0], finalized: false }] } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, capture: { ...video.capture, segments: [{ ...video.capture.segments[0], status: 'incomplete' }] } }).comparison, 'HOLD');
  const truncated = structuredClone(video);
  truncated.events[2].sample!.truncated = true;
  assert.equal(compareRecording(control, truncated).comparison, 'HOLD');
  const wrongOrder = structuredClone(video);
  wrongOrder.events[0].commandStartedAtMs = 101;
  assert.equal(compareRecording(control, wrongOrder).comparison, 'HOLD');
});

test('video inspection rejects missing or unsafe paths', async () => {
  const missing = await inspectVideos({ recordings: ['no-such-video.webm'] }, '/tmp/run/manifest.json');
  assert.equal(missing[0].status, 'unavailable');
  const unsafe = await inspectVideos({ recordings: ['../outside.webm'] }, '/tmp/run/manifest.json');
  assert.equal(unsafe[0].status, 'unavailable');
  const missingTrace = await inspectCaptureTraces({ capture: { segments: [{ traceFile: 'no-such-trace.json' }] } }, '/tmp/run/manifest.json');
  assert.equal(missingTrace[0].status, 'unavailable');
  assert.equal((await inspectAudio({ capture: { audio: false } }, '/tmp/run/manifest.json')).length, 0);
  assert.equal((await inspectAudio({ capture: { audio: true }, audioRecordings: [{ file: '../outside.webm' }] }, '/tmp/run/manifest.json'))[0].status, 'unavailable');
  assert.equal((await inspectAudio({ capture: { audio: true }, audioRecordings: [{ file: 'missing.webm' }] }, '/tmp/run/manifest.json'))[0].status, 'unavailable');
});

test('capture inspection rejects truncated and non-monotonic trace files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-capture-check-'));
  try {
    const file = join(dir, 'segment-001.capture.json');
    const trace = { format: 1, columns: ['browserPresentedAtUnixMs', 'callbackReceivedAtRunMs', 'viewportWidth', 'viewportHeight'],
      samples: [[1000, 1, 1280, 720], [1017, 18, 1280, 720], [1034, 35, 1280, 720]] };
    const manifest = { capture: { segments: [{ traceFile: 'segment-001.capture.json', samplesRetained: 3, callbacksReceived: 3, truncated: false }] } };
    writeFileSync(file, JSON.stringify(trace));
    assert.equal((await inspectCaptureTraces(manifest, join(dir, 'manifest.json')))[0].status, 'available');
    trace.samples[2][0] = 1017;
    writeFileSync(file, JSON.stringify(trace));
    assert.equal((await inspectCaptureTraces(manifest, join(dir, 'manifest.json')))[0].status, 'unavailable');
    trace.samples[2][0] = 1034;
    writeFileSync(file, JSON.stringify(trace));
    manifest.capture.segments[0].callbacksReceived = 4;
    assert.equal((await inspectCaptureTraces(manifest, join(dir, 'manifest.json')))[0].status, 'unavailable');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const ffmpegEncoders = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
test('each artifact segment requires finalized traces and readable encoded video', {
  skip: ffmpegEncoders.status !== 0 || !/\blibvpx\b/.test(ffmpegEncoders.stdout ?? '') || spawnSync('ffprobe', ['-version']).status !== 0,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-artifact-check-'));
  try {
    const first = join(dir, 'segment-001.webm'), second = join(dir, 'segment-002.webm');
    const encode = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=16x16:r=10:d=0.2', '-c:v', 'libvpx', '-an', first]);
    assert.equal(encode.status, 0, encode.stderr.toString());
    copyFileSync(first, second);
    const trace = { format: 1, columns: ['browserPresentedAtUnixMs', 'callbackReceivedAtRunMs', 'viewportWidth', 'viewportHeight'],
      samples: [[1000, 1, 1280, 720], [1101, 102, 1280, 720]] };
    const segments = [1, 2].map(n => ({ video: `segment-00${n}.webm`, traceFile: `segment-00${n}.capture.json`,
      status: 'available', finalized: true, samplesRetained: 2, callbacksReceived: 2, truncated: false,
      intervalMs: { gapsAtLeast100Ms: 1 } }));
    for (const segment of segments) writeFileSync(join(dir, segment.traceFile), JSON.stringify(trace));
    const manifest = { status: 'complete', capture: { enabled: true, audio: false, segments }, recordings: segments.map(s => s.video) };
    const path = join(dir, 'manifest.json');
    const valid = await inspectRecordingArtifact(manifest, path);
    assert.equal(valid.artifact, 'available');
    assert.equal(valid.recordingQuality, 'HOLD'); // Host/capture gaps do not invalidate route comparison.
    assert.equal(valid.playerFidelity, 'UNVERIFIED');
    assert.equal(valid.encodedVideos.length, 2);
    assert.equal(valid.captureTraces.length, 2);
    assert.equal(valid.durationChecks[0].status, 'available');
    assert.equal(valid.durationChecks[0].videoPacketDurationMs, 200);
    assert.equal(valid.durationChecks[0].traceSpanMs, 101);
    assert.equal(valid.durationChecks[0].toleranceMs, 25.25);
    assert.match(valid.warnings.join(' '), /timestamp gaps/);

    // The absolute boundary allowance cannot hide most of a short recording.
    trace.samples[1][0] = 1600;
    trace.samples[1][1] = 601;
    writeFileSync(join(dir, segments[1].traceFile), JSON.stringify(trace));
    const shortTruncated = await inspectRecordingArtifact(manifest, path);
    assert.equal(shortTruncated.durationChecks[1].status, 'HOLD');
    assert.equal(shortTruncated.durationChecks[1].toleranceMs, 150);

    // A fully readable short file must not stand in for a multi-minute recording.
    trace.samples[1][0] = 181000;
    trace.samples[1][1] = 180001;
    writeFileSync(join(dir, segments[1].traceFile), JSON.stringify(trace));
    const truncated = await inspectRecordingArtifact(manifest, path);
    assert.equal(truncated.encodedVideos[1].status, 'available');
    assert.equal(truncated.captureTraces[1].status, 'available');
    assert.equal(truncated.durationChecks[1].status, 'HOLD');
    assert.equal(truncated.durationChecks[1].traceSpanMs, 180000);
    assert.equal(truncated.durationChecks[1].toleranceMs, 3600);
    assert.equal(truncated.artifact, 'HOLD');
    assert.match(truncated.reasons.join(' '), /materially shorter/);
    assert.doesNotMatch(truncated.reasons.join(' '), /duration comparison is unavailable/);

    // Out-of-order capture timestamps prevent the duration comparison; they do not
    // establish that the otherwise readable video was actually truncated.
    trace.samples[1][0] = 999;
    trace.samples[1][1] = 102;
    writeFileSync(join(dir, segments[1].traceFile), JSON.stringify(trace));
    const reordered = await inspectRecordingArtifact(manifest, path);
    assert.equal(reordered.artifact, 'HOLD');
    assert.equal(reordered.captureTraces[1].status, 'unavailable');
    assert.equal(reordered.durationChecks[1].status, 'unavailable');
    assert.match(reordered.reasons.join(' '), /duration comparison is unavailable/);
    assert.doesNotMatch(reordered.reasons.join(' '), /materially shorter/);
    trace.samples[1][0] = 1101;
    trace.samples[1][1] = 102;
    writeFileSync(join(dir, segments[1].traceFile), JSON.stringify(trace));

    segments[1].status = 'incomplete';
    assert.equal((await inspectRecordingArtifact(manifest, path)).artifact, 'HOLD');
    segments[1].status = 'available';
    segments[1].finalized = false;
    assert.equal((await inspectRecordingArtifact(manifest, path)).artifact, 'HOLD');
    segments[1].finalized = true;
    segments[1].callbacksReceived = 3;
    assert.equal((await inspectRecordingArtifact(manifest, path)).artifact, 'HOLD');
    segments[1].callbacksReceived = 2;
    writeFileSync(second, 'nonempty but not video');
    const badVideo = await inspectRecordingArtifact(manifest, path);
    assert.equal(badVideo.artifact, 'HOLD');
    assert.equal(badVideo.encodedVideos[1].status, 'unavailable');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('tab capture verifies source, bytes and timing while preserving gap warnings', {
  skip: ffmpegEncoders.status !== 0 || !/\blibvpx\b/.test(ffmpegEncoders.stdout ?? '') || spawnSync('ffprobe', ['-version']).status !== 0,
}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tesland-tab-check-'));
  try {
    const video = join(dir, 'segment-001.webm');
    const encode = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:s=16x16:r=5:d=1', '-c:v', 'libvpx', '-an', video]);
    assert.equal(encode.status, 0, encode.stderr.toString());
    const trace = { format: 2, mode: 'tab', startedAtBrowserMs: 10, stoppedAtBrowserMs: 1010, chunks: 1, bytes: statSync(video).size,
      settings: { displaySurface: 'browser', width: 16, height: 16, frameRate: 5 } };
    const segment = { video: 'segment-001.webm', traceFile: 'segment-001.capture.json', mode: 'tab', status: 'available', finalized: true };
    const rawControl = run(false), rawRecorded = run(true);
    const control = { ...rawControl, runner: { ...rawControl.runner, tabCaptureSourceSha256: hash }, capture: { ...rawControl.capture, source: 'tab' } };
    const recorded = { ...rawRecorded, runner: { ...rawRecorded.runner, tabCaptureSourceSha256: hash }, capture: { ...rawRecorded.capture, source: 'tab', segments: [segment] } };
    const controlPath = join(dir, 'control.json'), recordedPath = join(dir, 'manifest.json'), tracePath = join(dir, segment.traceFile);
    writeFileSync(controlPath, JSON.stringify(control)); writeFileSync(recordedPath, JSON.stringify(recorded)); writeFileSync(tracePath, JSON.stringify(trace));
    assert.equal(compareRecording(control, recorded).comparison, 'available');
    const checked = await inspectRecordingArtifact(recorded, recordedPath);
    assert.equal(checked.artifact, 'available');
    assert.equal(checked.playerFidelity, 'UNVERIFIED');
    assert.match(checked.warnings.join(' '), /packet gaps/);
    assert.equal((await inspectRecordingArtifact({ ...recorded, capture: { ...recorded.capture, source: 'unknown' } }, recordedPath)).artifact, 'HOLD');
    const cli = spawnSync(process.execPath, ['scripts/recording-quality.mjs', controlPath, recordedPath], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(JSON.parse(cli.stdout).warnings.join(' '), /packet gaps/);
    assert.equal(compareRecording({ ...control, capture: { ...control.capture, source: 'screencast' } }, recorded).comparison, 'HOLD');
    trace.bytes++;
    writeFileSync(tracePath, JSON.stringify(trace));
    assert.equal((await inspectRecordingArtifact(recorded, recordedPath)).artifact, 'HOLD');
    trace.bytes--; trace.settings.displaySurface = 'monitor';
    writeFileSync(tracePath, JSON.stringify(trace));
    assert.equal((await inspectRecordingArtifact(recorded, recordedPath)).artifact, 'HOLD');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
