/** Evaluate five same-runner pairs of the bounded snapshot assembly microbenchmark. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scenarios=['clustered','spread','owned'];
const limits={clustered:1,spread:1,owned:1.10};
const fixtureFields=['players','entities','rounds','uniqueInterestSets','decodedBytesPerBroadcast'];

function fail(label,message){throw new Error(`${label}: ${message}`);}
function finitePositive(value){return typeof value==='number'&&Number.isFinite(value)&&value>0;}
function positiveInteger(value){return Number.isInteger(value)&&value>0;}

export function parseSnapshotSample(raw,label='sample'){
  const lines=raw.split(/\r?\n/).filter(line=>line.trim());
  if(lines.length!==scenarios.length)fail(label,'expected exactly three scenario records');
  const result={};
  for(const line of lines){
    let row;
    try{row=JSON.parse(line);}catch{fail(label,'invalid JSON record');}
    if(!row||typeof row!=='object'||Array.isArray(row)||!scenarios.includes(row.scenario))fail(label,'unknown scenario');
    if(result[row.scenario])fail(label,`duplicate ${row.scenario} scenario`);
    const name=`${label}/${row.scenario}`;
    if(row.players!==64||row.rounds!==50)fail(name,'fixture must have 64 recipients and 50 broadcasts');
    if(!positiveInteger(row.entities)||!positiveInteger(row.uniqueInterestSets)||row.uniqueInterestSets>row.players||
       !positiveInteger(row.decodedBytesPerBroadcast)||!positiveInteger(row.logicalCpus))fail(name,'invalid fixture or decoded-byte metric');
    for(const field of ['elapsedMs','cpuMs','broadcastP50Ms','broadcastP95Ms'])
      if(!finitePositive(row[field]))fail(name,`missing or non-finite ${field}`);
    if(row.broadcastP95Ms<row.broadcastP50Ms)fail(name,'p95 is below p50');
    for(const field of ['loadBefore','loadAfter'])
      if(!Array.isArray(row[field])||row[field].length!==3||row[field].some(value=>typeof value!=='number'||!Number.isFinite(value)||value<0))
        fail(name,`invalid ${field}`);
    result[row.scenario]=row;
  }
  return result;
}

export function evaluateSnapshotPairs(pairs){
  if(!Array.isArray(pairs)||pairs.length!==5)fail('pairs','expected exactly five base/candidate pairs');
  const parsed=pairs.map((pair,index)=>({
    base:parseSnapshotSample(pair.base,`base-${index+1}`),
    candidate:parseSnapshotSample(pair.candidate,`candidate-${index+1}`),
  }));
  const summary={};
  for(const scenario of scenarios){
    const reference=parsed[0].base[scenario];
    const ratios=[];
    for(const [index,pair] of parsed.entries()){
      for(const side of ['base','candidate']){
        const row=pair[side][scenario];
        for(const field of fixtureFields)
          if(row[field]!==reference[field])fail(`${side}-${index+1}/${scenario}`,`${field} differs across paired fixtures`);
      }
      const ratio=pair.candidate[scenario].cpuMs/pair.base[scenario].cpuMs;
      if(!finitePositive(ratio))fail(`pair-${index+1}/${scenario}`,'non-finite paired CPU ratio');
      ratios.push(ratio);
    }
    const median=[...ratios].sort((a,b)=>a-b)[2];
    const pass=scenario==='owned'?median<=limits[scenario]:median<limits[scenario];
    summary[scenario]={ratios,medianPairedCpuRatio:median,limit:limits[scenario],comparison:scenario==='owned'?'<=':'<',
      decodedBytesPerBroadcast:reference.decodedBytesPerBroadcast,pass};
  }
  return {status:Object.values(summary).every(row=>row.pass)?'pass':'hold',pairs:5,roundsPerPair:50,summary,
    note:'Synthetic in-process snapshot assembly only. A pass is not an end-to-end, motion, room-throughput, or playable-capacity result.'};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length!==3)throw new Error('Usage: node scripts/evaluate-snapshot-assembly.mjs <raw-artifact-directory>');
    const directory=process.argv[2];
    const pairs=Array.from({length:5},(_,i)=>({
      base:readFileSync(join(directory,`base-${i+1}.jsonl`),'utf8'),
      candidate:readFileSync(join(directory,`candidate-${i+1}.jsonl`),'utf8'),
    }));
    const report=evaluateSnapshotPairs(pairs);
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='pass')process.exitCode=1;
  }catch(error){
    console.log(JSON.stringify({status:'hold',reason:error instanceof Error?error.message:String(error),
      note:'Incomplete or invalid microbenchmark evidence; inspect the retained raw artifacts.'},null,2));
    process.exitCode=1;
  }
}
