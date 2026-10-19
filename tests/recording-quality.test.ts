import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRecording, inspectCaptureTraces, inspectVideos } from '../scripts/recording-quality.mjs';

const ref = 'a'.repeat(40), hash = 'b'.repeat(64);
const run = (video: boolean) => ({
  status: 'complete', target: { refProvidedByOperator: ref, origin: 'http://127.0.0.1:8787', pathname: '/' }, scenarioSha256: hash,
  runner: { platform: 'darwin', architecture: 'arm64', release: '24', cpu: 'Apple', logicalCpuCount: 10,
    nodeVersion: 'v22', playwrightVersion: '1.64.1', browserChannel: 'chrome', browserVersion: '155',
    gpuMode: 'metal', headed: false, webgl: { renderer: 'Metal', vendor: 'Apple' }, recorderSourceSha256: hash,
    captureSourceSha256: hash, hostLoadAverageAtStart: [2, 3, 4], hostLoadAverageAtFinish: [3, 4, 5] },
  viewport: { width: 1280, height: 720 }, browserErrors: { pageErrors: 0, consoleErrors: 0 },
  capture: { enabled: video, requestedFps: 30, segments: video ? [{ video: 'segment-001.webm', status: 'available', finalized: true, intervalMs: { gapsAtLeast100Ms: 1 } }] : [] },
  recordings: video ? ['segment-001.webm'] : [],
  events: [{ type: 'recordStart', status: 'ok', commandStartedAtMs: 90 }, { type: 'frameStart', status: 'ok', commandStartedAtMs: 100 }, { type: 'frameStop', status: 'ok', commandStartedAtMs: 4000,
    sample: { intervalsMs: [...Array(98).fill(16.7), 40, 120], truncated: false } }, { type: 'recordStop', status: 'ok', commandStartedAtMs: 4010 }],
});

test('recording comparison describes long callback gaps without claiming player fidelity', () => {
  const result = compareRecording(run(false), run(true));
  assert.equal(result.comparison, 'available');
  assert.equal(result.withVideo?.p95Ms, 16.7);
  assert.equal(result.withVideo?.over33_4MsPercent, 2);
  assert.equal(result.withVideo?.over100MsPercent, 1);
  assert.match(result.warnings[0], /1 browser screencast timestamp gaps/);
  assert.match(result.limitations.join(' '), /physical display presentation/);
});

test('recording comparison holds missing, mixed or incomplete evidence', () => {
  const control = run(false), video = run(true);
  assert.equal(compareRecording(run(true), video).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, scenarioSha256: 'different' }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, runner: { ...video.runner, browserVersion: 'other' } }).comparison, 'HOLD');
  assert.equal(compareRecording(control, { ...video, target: { ...video.target, origin: 'https://example.com' } }).comparison, 'HOLD');
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
});
