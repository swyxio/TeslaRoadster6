import {mkdir} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {Journal, Resources, ProcessRegistry, GIB, delay} from '/private/tmp/tesland-highway-final-pair-draft/supervisor-safety.mjs';
const out='/private/tmp/tesland-highway-comparative-visual-f40-r2',run='/private/tmp/tesland-highway-startup-1792392715120-a5e2969143';
await mkdir(out,{recursive:false});const journal=new Journal(out+'/events.ndjson'),ctl=new AbortController();let registry,stopping,status=0;
const abort=error=>{if(!ctl.signal.aborted){journal.mark('abort',{reason:String(error?.message??error)});ctl.abort();if(registry)stopping=registry.stop('abort');}};
const resources=new Resources({paths:[out,run],output:out,journal,abort,signal:ctl.signal});
try{
 await resources.sample('before-visual',2.5*GIB);resources.start();
 for(const [label,ref,version] of [['A','1b7b18bf44cb049b0f3b1b61bd1135bdd7d015fc',52],['B','f40a86ed22f1eb2846d0404451190d1d47b3321e',53]]){
  const rootDir=run+'/source-'+label,storage='/private/tmp/tesland-highway-comparative-storage-'+label+'-f40-r2';await mkdir(storage,{recursive:false});
  registry=new ProcessRegistry(journal,abort);registry.start();const streams=[];
  async function spawn(name,args){
   const r=registry.spawn(label+'-'+name,'pnpm',args,{cwd:rootDir,env:{...process.env,CI:'true',BROWSER:'none'}});
   const file=createWriteStream(out+'/'+label+'-'+name+'.log');r.child.stdout.pipe(file,{end:false});r.child.stderr.pipe(file,{end:false});streams.push({r,file});
   await registry.observeRoot(r,ctl.signal);return r;
  }
  try{
   const server=await spawn('wrangler',['exec','wrangler','dev','--config','tests/fixtures/wrangler.playtest-stage.jsonc','--local','--ip','127.0.0.1','--port','18985','--persist-to',storage,'--show-interactive-dev-session','false','--var','PLAYTEST_X:-798','--var','PLAYTEST_Z:3300','--var','PLAYTEST_YAW:0.053','--var','PLAYTEST_SEED:0']);
   const deadline=Date.now()+30000;let health;
   while(Date.now()<deadline&&!ctl.signal.aborted&&!server.exited){try{const r=await fetch('http://127.0.0.1:18985/api/health');if(r.ok){health=await r.json();break;}}catch{}await delay(500);}
   if(health?.version!==version)throw new Error(label+'-health-or-protocol-failed');journal.mark('health',{label,version:health.version,ref});
   for(const [name,scenario,width,height,mobile,video] of [['portrait','/private/tmp/tesland-bay-mobile-scenario.json','390','844',true,false],['long','/private/tmp/tesland-highway-long-visual-scenario.json','1280','720',false,true]]){
    const recorder='/private/tmp/tesland-bay-highway-life/scripts/playtest-record.ts';
    const args=['exec','tsx',recorder,'--url',`http://127.0.0.1:18985/?room=visual${label.toLowerCase()}${name}`,'--scenario',scenario,'--out',out+'/'+label+'-'+name,'--target-ref',ref,'--gpu','metal','--trajectory','--width',width,'--height',height,...(mobile?['--mobile']:[]),...(video?['--fps','10']:['--no-video'])];
    const r=await spawn(name,args);await r.done;await r.outputDone;journal.mark('result',registry.report(r));if(r.code!==0||r.signal||r.error||ctl.signal.aborted)throw new Error(label+'-'+name+'-failed');
   }
  }finally{
   const survivors=await(stopping??registry.stop('visual-'+label+'-complete'));if(survivors.length)throw new Error('visual-survivors');
   for(const {file} of streams){file.end();await new Promise(resolve=>file.on('finish',resolve));}
   journal.mark('leg-end',{label,survivors});registry=undefined;stopping=undefined;
  }
 }
}catch(e){status=1;if(!ctl.signal.aborted)abort(e);if(stopping)await stopping;}
resources.stop();journal.mark('finished',{status});journal.close();process.exitCode=status;
