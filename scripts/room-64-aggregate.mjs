import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

export function aggregate(records) {
  if (records.length !== 4) throw new Error('Four runner artifacts are required');
  const groups = records.map(r => r.report.group).sort((a,b)=>a-b);
  if (groups.join(',') !== '1,2,3,4') throw new Error('Runner groups are missing or duplicated');
  const first=records[0].report;
  for (const {report:r,before,after} of records) {
    for (const key of ['room','runId','attempt','candidateSha','baseSha','diagnosticSha','preview','barrierTick','targetTick'])
      if (r[key] !== first[key] || r[key] == null) throw new Error(`Runner ${key} does not match`);
    if (!/^sandbox-d\d+-\d+$/.test(r.room) || r.roomEpochs?.length!==1 ||
        typeof r.roomEpochs[0]!=='string' || !r.roomEpochs[0] || r.roomEpochs[0]!==first.roomEpochs?.[0])
      throw new Error('Sandbox room or room epoch differs');
    if (!before || !after || before.sha!==r.candidateSha || after.sha!==r.candidateSha || before.baseSha!==r.baseSha || after.baseSha!==r.baseSha ||
        before.preview!==r.preview || after.preview!==r.preview || before.protocol!==after.protocol ||
        before.protocol!==r.health?.version || r.health?.capacity!==64 || r.health?.ok!==true)
      throw new Error('Missing or inconsistent pre/post preview identity');
    if (r.failure || !r.diagnosticCoverageComplete || !Array.isArray(r.incomplete) || r.incomplete.length || r.clients!==16 ||
        r.onlineAtEnd!==16 || r.clientsSeeingAll!==16 || !Number.isFinite(r.simulatedSeconds?.min) ||
        r.simulatedSeconds.min<57 || !Number.isFinite(r.elapsedSeconds) || r.elapsedSeconds<60 ||
        !Number.isSafeInteger(r.inputsSent?.measured) || !Number.isFinite(r.decodedJsonMiB) ||
        (r.group===1 && r.extraClose?.code!==4003) ||
        r.slots?.length!==16 || r.slots.some(slot=>slot.lastPlayers!==64 || !slot.measuredApplied || slot.leftCorridor!==false || slot.movement?.blocks?.length!==6 ||
          slot.movement.blocks.some(block=>!block.complete)))
      throw new Error(`Runner ${r.group} is incomplete`);
  }
  const starts=records.map(r=>Date.parse(r.report.startedUtc));
  const ends=records.map(r=>Date.parse(r.report.endedUtc));
  const overlapMs=Math.min(...ends)-Math.max(...starts);
  if (![...starts,...ends].every(Number.isFinite) || overlapMs<59_000)
    throw new Error('The four measurement windows do not overlap for at least 59 seconds');
  return {complete:true, clients:64, room:first.room, roomEpoch:first.roomEpochs[0], candidateSha:first.candidateSha,
    preview:first.preview, overlapMs, minimumSimulatedSeconds:Math.min(...records.map(r=>r.report.simulatedSeconds.min)),
    measuredInputs:records.reduce((sum,r)=>sum+r.report.inputsSent.measured,0),
    decodedJsonMiB:records.reduce((sum,r)=>sum+r.report.decodedJsonMiB,0),
    note:'Sandbox diagnostic only; this does not establish normal-room playable capacity, tick CPU, wire bytes, browser rendering or device performance.'};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const directory=process.argv[2];
  if (!directory) throw new Error('Usage: node room-64-aggregate.mjs reports-directory');
  const records=readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>{
    const path=join(directory,entry.name);
    const files=readdirSync(path).filter(name=>/^group-[1-4]\.json\.gz$/.test(name));
    if (files.length!==1) throw new Error(`Missing or duplicate report in ${entry.name}`);
    return {report:JSON.parse(gunzipSync(readFileSync(join(path,files[0]))).toString()),
      before:JSON.parse(readFileSync(join(path,'identity-before.json'),'utf8')),
      after:JSON.parse(readFileSync(join(path,'identity-after.json'),'utf8'))};
  });
  console.log(JSON.stringify(aggregate(records),null,2));
}
