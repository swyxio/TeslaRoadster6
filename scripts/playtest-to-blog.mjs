// Record a disposable local room and prepare a browser-playable publication asset.
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  slug: { type: 'string' }, name: { type: 'string', default: 'playtest' },
  scenario: { type: 'string', default: 'scripts/playtests/blog-drive.json' },
  gpu: { type: 'string', default: 'default' },
} });
for (const key of ['slug', 'name']) {
  if (!values[key] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values[key])) throw new Error(`Provide a URL-safe --${key}.`);
}
if (!['default', 'metal', 'vulkan', 'swiftshader'].includes(values.gpu)) throw new Error('Invalid --gpu.');
const scenario = resolve(values.scenario);
const target = join('public', 'blog', values.slug);
const video = join(target, `${values.name}.mp4`);
const poster = join(target, `${values.name}-poster.jpg`);
for (const path of [video, poster]) {
  try { await access(path); throw new Error(`${path} already exists; choose a different --name.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const ref = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
const run = join('playtest-runs', `blog-${Date.now()}-${randomUUID().slice(0, 8)}`);
const scratch = await mkdtemp(join(tmpdir(), 'tesland-blog-video-'));
const server = createServer();
await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
const port = server.address().port;
await new Promise(ok => server.close(ok));
let worker;
let activeCommand;
let serverLog = '';
let interrupted = false;
const command = (program, args) => new Promise((ok, fail) => {
  if (interrupted) { fail(new Error('Interrupted')); return; }
  const child = spawn(program, args, { stdio: 'inherit' });
  activeCommand = child;
  child.once('error', error => { activeCommand = undefined; fail(error); });
  child.once('exit', (code, signal) => { activeCommand = undefined; code === 0 ? ok() : fail(new Error(`${program} exited ${code ?? signal}`)); });
});
const stopWorker = () => { if (worker?.pid) { try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* already stopped */ } } };
const interrupt = () => { interrupted = true; activeCommand?.kill('SIGTERM'); stopWorker(); };
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  // The output is built from the current checkout; a fresh local Worker and
  // browser profile avoid the public room, real chat, and saved drivers.
  await command('pnpm', ['build']);
  worker = spawn('pnpm', ['exec', 'wrangler', 'dev', '--config', 'tests/fixtures/wrangler.playtest-stage.jsonc', '--local', '--ip', '127.0.0.1', '--port', String(port), '--var', 'PLAYTEST_X:-180', '--var', 'PLAYTEST_Z:0', '--var', 'PLAYTEST_YAW:1.2', '--persist-to', join(scratch, 'state')], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  worker.stdout.on('data', chunk => { serverLog = (serverLog + chunk).slice(-8000); });
  worker.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-8000); });
  worker.on('error', error => { serverLog += error.message; });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (interrupted || worker.exitCode !== null || worker.signalCode !== null) throw new Error(`Local Worker exited before starting: ${serverLog}`);
    try { const response = await fetch(`http://127.0.0.1:${port}/`); if (response.ok) { ready = true; break; } } catch { /* starting */ }
    await new Promise(ok => setTimeout(ok, 500));
  }
  if (!ready) throw new Error(`Local Worker did not start: ${serverLog}`);
  await command('pnpm', ['playtest:record', '--url', `http://127.0.0.1:${port}/?room=blog-playtest`, '--target-ref', ref + (dirty ? '+working-tree-changes' : ''), '--scenario', scenario, '--out', run, '--gpu', values.gpu, '--fps', '30', '--trajectory']);
  const manifest = JSON.parse(await readFile(join(run, 'manifest.json'), 'utf8'));
  if (manifest.status !== 'complete' || manifest.recordings?.length !== 1 || manifest.trajectory?.status !== 'available') throw new Error(`Recording did not complete with one video and a trajectory: ${run}`);
  const output = join(scratch, 'video.mp4');
  const image = join(scratch, 'poster.jpg');
  await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(run, manifest.recordings[0]), '-an', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
  await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', output, '-frames:v', '1', '-q:v', '2', image]);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height', '-of', 'json', output], { encoding: 'utf8' }));
  const stream = probe.streams?.find(item => item.codec_name === 'h264');
  if (!stream || !stream.width || !stream.height || Number(probe.format?.duration) < 1 || Number(probe.format?.size) > 25_000_000) throw new Error('Invalid or oversized browser video.');
  await mkdir(target, { recursive: true });
  let posterCreated = false;
  try {
    await copyFile(image, poster, constants.COPYFILE_EXCL);
    posterCreated = true;
    await copyFile(output, video, constants.COPYFILE_EXCL);
  } catch (error) {
    if (posterCreated) await rm(poster, { force: true });
    throw error;
  }
  console.log(JSON.stringify({ video: `/${video.replace(/^public\//, '')}`, poster: `/${poster.replace(/^public\//, '')}`, run, seconds: Number(probe.format.duration), width: stream.width, height: stream.height, bytes: Number(probe.format.size) }));
} finally {
  stopWorker();
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
  await rm(scratch, { recursive: true, force: true });
}
