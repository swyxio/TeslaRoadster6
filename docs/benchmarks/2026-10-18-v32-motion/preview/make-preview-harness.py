#!/usr/bin/env python3
"""Make a bounded remote-preview variant in an isolated frozen source copy."""
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

source = Path(sys.argv[1]).resolve()
origin = sys.argv[2].rstrip('/')
url = urlsplit(origin)
if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.workers.dev') or url.hostname == 'bay-drive.swyxio.workers.dev' or url.path or url.query or url.fragment or url.username or url.password:
    raise SystemExit('Expected a specific non-production HTTPS workers.dev preview origin')
path = source / 'scripts' / 'load-room.ts'
script = path.read_text()
def replace_once(old, new):
    global script
    if script.count(old) != 1:
        raise SystemExit(f'Unexpected frozen load script: expected exactly one {old!r}')
    script = script.replace(old, new, 1)
replace_once("import { NEUTRAL, PROTOCOL_VERSION, type World }", "import { NEUTRAL, PROTOCOL_VERSION, ROOM_FULL_CODE, type World }")
replace_once("const base=process.argv[2]??'http://127.0.0.1:8787';", 'const base=process.argv[2]??' + json.dumps(origin) + ';')
replace_once("const host=new URL(base).hostname;\nif(!['127.0.0.1','localhost','[::1]'].includes(host))throw new Error('Run this synthetic load only against a local server.');", 'if(base!==' + json.dumps(origin) + ")throw new Error('Only the designated preview is allowed.');\nif(count!==8||seconds!==60)throw new Error('Only the approved eight-client, sixty-second check is allowed.');")
replace_once("if(health.version!==PROTOCOL_VERSION||count>health.capacity)", "if(health.version!==PROTOCOL_VERSION||health.capacity!==8)")
replace_once("const url=base.replace(/^http/,'ws')+`/api/room/load-${Date.now()}`;", "const room=`load-${Date.now()}`;\nconst url=base.replace(/^http/,'ws')+`/api/room/${room}`;\nconsole.error(`ROOM: ${room}`);")
replace_once("let measuring=false,snapshots=0,bytes=0,sent=0,closed=0;", "let measuring=false,snapshots=0,bytes=0,sent=0,closed=0;\nlet ninthClose:{code:number;reason:string}|undefined;")
replace_once("  await delay(2000);loopDelay.enable();", """  await new Promise<void>((resolve,reject)=>{
    const extra=new WebSocket(url);
    const timeout=setTimeout(()=>{extra.close();reject(new Error('Ninth connection did not close within 5 seconds'));},5000);
    extra.addEventListener('message',event=>{
      if(JSON.parse(String(event.data)).type==='welcome'){
        clearTimeout(timeout);extra.close();reject(new Error('Ninth connection was welcomed into a full room'));
      }
    });
    extra.addEventListener('error',()=>{clearTimeout(timeout);extra.close();reject(new Error('Ninth connection failed before a full-room close'));},{once:true});
    extra.addEventListener('close',event=>{
      clearTimeout(timeout);ninthClose={code:event.code,reason:event.reason};
      if(event.code!==ROOM_FULL_CODE)reject(new Error(`Expected full-room close ${ROOM_FULL_CODE}, got ${event.code}: ${event.reason}`));
      else resolve();
    },{once:true});
  });
  await delay(2000);loopDelay.enable();""")
replace_once("console.log(JSON.stringify({clients:count,elapsedSeconds:", "console.log(JSON.stringify({preview:base,room,ninthClose,clients:count,elapsedSeconds:")
replace_once("note:'Bounded local synthetic clients send input at 20 Hz and parse all received JSON. Same-host client parsing and contention affect the result; no WAN, sustained, mobile or production capacity claim.'", "note:'Eight synthetic clients send input at 20 Hz to one remote preview room and parse all received JSON. One bounded run, not production, sustained, real-player or physical-device capacity evidence.'")
target = source / 'scripts' / 'preview-capacity-once.ts'
target.write_text(script)
print(target)
