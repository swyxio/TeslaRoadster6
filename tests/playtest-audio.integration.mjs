// Calibration for the optional playtest audio path. Requires Chromium and FFmpeg.
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const temp = await mkdtemp(join(tmpdir(), 'tesland-audio-calibration-'));
const html = `<!doctype html><style>html,body{background:#000;margin:0;width:100%;height:100%}</style><script>
let audio, gain;
window.addEventListener('keydown', async event => {
  if (event.code === 'KeyA') {
    audio = new AudioContext(); gain = audio.createGain(); gain.gain.value = 0;
    const oscillator = audio.createOscillator(); oscillator.frequency.value = 440;
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); await audio.resume();
  }
  if (event.code === 'KeyB') { document.body.style.background = '#fff'; gain.gain.value = 0.4; }
  if (event.code === 'KeyC') window.__teslandAudioCapture.stop = () => { throw new Error('Simulated audio failure'); };
});</script>`;
const server = createServer((request, response) => { response.writeHead(200, {'content-type': 'text/html'}); response.end(html); });
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const scenario = join(temp, 'scenario.json'), run = join(temp, 'run');
  await writeFile(scenario, JSON.stringify({viewport:{width:640,height:360},steps:[
    {type:'keyPress', key:'KeyA'}, {type:'wait', ms:300}, {type:'recordStart'},
    {type:'wait', ms:1000}, {type:'keyPress', key:'KeyB'}, {type:'wait', ms:1000}, {type:'recordStop'},
  ]}));
  await promisify(execFile)('pnpm', ['playtest:record', '--url', `http://127.0.0.1:${server.address().port}/`, '--target-ref', 'synthetic-audio-calibration', '--scenario', scenario, '--out', run, '--audio'], {timeout:120000});
  const manifest = JSON.parse(await readFile(join(run, 'manifest.json'), 'utf8'));
  assert.equal(manifest.status, 'complete');
  assert.equal(manifest.audioRecordings.length, 1);
  const audio = manifest.audioRecordings[0], output = join(temp, 'calibration.mp4');
  execFileSync('ffmpeg', ['-v','error','-y','-i',join(run,manifest.recordings[0]),'-itsoffset',String(audio.offsetMs/1000),'-i',join(run,audio.file),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-c:a','aac','-shortest',output]);
  const frames = execFileSync('ffmpeg', ['-v','error','-i',output,'-vf','fps=30,scale=1:1','-pix_fmt','gray','-f','rawvideo','-']);
  const visual = frames.findIndex(value => value > 128) / 30;
  const samples = execFileSync('ffmpeg', ['-v','error','-i',output,'-vn','-ac','1','-ar','8000','-f','f32le','-']);
  let audible = -1;
  for (let i = 0; i + 320 <= samples.length; i += 320) {
    let energy = 0;
    for (let j = i; j < i + 320; j += 4) energy += samples.readFloatLE(j) ** 2;
    if (Math.sqrt(energy / 80) > 0.02) { audible = i / 4 / 8000; break; }
  }
  assert(visual >= 0 && audible >= 0, 'Both visual cue and sound must be present');
  const delta = Math.abs(visual - audible);
  assert(delta < 0.25, `Visual and audio cues differ by ${delta.toFixed(3)} seconds`);
  console.log(`Audio/video calibration: visual ${visual.toFixed(3)}s, sound ${audible.toFixed(3)}s, difference ${delta.toFixed(3)}s`);

  const failureScenario = join(temp, 'failure.json'), failureRun = join(temp, 'failed-run');
  await writeFile(failureScenario, JSON.stringify({viewport:{width:640,height:360},steps:[
    {type:'keyPress', key:'KeyA'}, {type:'recordStart'}, {type:'wait', ms:500},
    {type:'keyPress', key:'KeyC'}, {type:'recordStop'},
  ]}));
  await assert.rejects(promisify(execFile)('pnpm', ['playtest:record', '--url', `http://127.0.0.1:${server.address().port}/`, '--target-ref', 'audio-failure-calibration', '--scenario', failureScenario, '--out', failureRun, '--audio'], {timeout:120000}));
  const failed = JSON.parse(await readFile(join(failureRun, 'manifest.json'), 'utf8'));
  assert.equal(failed.status, 'failed');
  assert.equal(failed.capture.audioFinalizationFailed, true);
  assert.equal(failed.recordings.length, 1);
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', join(failureRun, failed.recordings[0])]);
  console.log('Audio finalization failure retained the finalized video and failed the run.');

  const interactiveRun = join(temp, 'interactive-failed-run');
  const secret = 'test-only-audio-calibration-secret-0000';
  const child = spawn('pnpm', ['playtest:record', '--url', `http://127.0.0.1:${server.address().port}/`, '--target-ref', 'interactive-audio-failure', '--serve', '--out', interactiveRun, '--audio'], {env:{...process.env,TESLAND_PLAYTEST_SECRET:secret}, stdio:['ignore','pipe','pipe']});
  const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Interactive runner did not start')), 60000);
      child.stdout.on('data', data => {
        output += data;
        for (const line of output.split('\n')) {
          try { const parsed = JSON.parse(line); if (parsed.endpoint) { clearTimeout(timer); resolve(parsed.endpoint); return; } } catch { /* pnpm output */ }
        }
      });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Interactive runner exited before starting')); });
    });
    const action = async (body, status = 200) => {
      const response = await fetch(`${endpoint}/actions`, {method:'POST', headers:{authorization:`Bearer ${secret}`, 'content-type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(15000)});
      assert.equal(response.status, status);
    };
    await action({type:'keyPress',key:'KeyA'});
    await action({type:'recordStart'});
    await action({type:'wait',ms:500});
    await action({type:'keyPress',key:'KeyC'});
    await action({type:'recordStop'}, 400);
    await action({type:'finish'}, 202);
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Interactive runner did not finish')), 15000);
      exited.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(exitCode, 1);
    const interactive = JSON.parse(await readFile(join(interactiveRun, 'manifest.json'), 'utf8'));
    assert.equal(interactive.status, 'failed');
    assert.equal(interactive.capture.audioFinalizationFailed, true);
    assert.equal(interactive.recordings.length, 1);
    console.log('Interactive audio failure also fails the run and preserves video.');
  } finally { if (child.exitCode === null) child.kill('SIGTERM'); }
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true, force:true});
}
