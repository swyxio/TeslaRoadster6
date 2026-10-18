import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const anchors = {
  'src/scene.ts': [
    'this.camera.updateMatrixWorld();',
    `this.camera.updateMatrixWorld();
    if (controlled) {
      const tracedMesh = this.entities.get(controlled.id);
      if (tracedMesh) (globalThis as any).__teslandTraceFrame?.(world, controlled, tracedMesh, this.camera, {localPredicted,snapLocal,snapCamera,menu});
    }`,
  ],
  'src/main.ts': [
    'const input=controls.read();input.cockpit=cockpit&&!document.hidden&&document.hasFocus();',
    `const input=controls.read();input.cockpit=cockpit&&!document.hidden&&document.hasFocus();
  (globalThis as any).__teslandTraceInput?.(input);`,
  ],
  'src/session.ts': [
    'const message = JSON.parse(event.data);',
    `const message = JSON.parse(event.data);
        (globalThis as any).__teslandTraceMessage?.(message,this.id);`,
    'const sent=this.sentAt.get(message.control.receivedSeq);',
    `const sent=this.sentAt.get(message.control.receivedSeq);
          if(sent!==undefined)(globalThis as any).__teslandTraceTurnaround?.(message.control.receivedSeq,sent,now);`,
    "if(!this.send({type:'input',...command,roomEpoch:this.roomEpoch}))return false;",
    `if(!this.send({type:'input',...command,roomEpoch:this.roomEpoch}))return false;
    (globalThis as any).__teslandTraceSent?.(command);`,
  ],
};

export function instrument(path, code) {
  const replacements=anchors[path];
  if (!replacements) return null;
  for (let i=0;i<replacements.length;i+=2) {
    const [needle,replacement]=replacements.slice(i,i+2);
    const count=code.split(needle).length-1;
    if(count!==1) throw new Error(`${path}: expected exactly one anchor ${JSON.stringify(needle)}, found ${count}`);
    code=code.replace(needle,replacement);
  }
  return code;
}

export async function checkSources(root) {
  const results=[];
  for (const path of Object.keys(anchors)) {
    const code=await readFile(join(root,path),'utf8');
    const output=instrument(path,code);
    results.push({path,bytes:Buffer.byteLength(code),instrumentedBytes:Buffer.byteLength(output)});
  }
  return results;
}

export function plugin(root) {
  const seen=new Set();
  return {
    name:'tesland-disposable-motion-trace',enforce:'pre',
    transform(code,id) {
      const normalized=id.split('?')[0];
      const path=Object.keys(anchors).find(name=>normalized===join(root,name));
      if(!path)return null;
      seen.add(path);
      return {code:instrument(path,code),map:null};
    },
    buildEnd(error) {
      if(!error&&seen.size!==Object.keys(anchors).length)throw new Error(`Instrumentation missed ${Object.keys(anchors).filter(x=>!seen.has(x)).join(', ')}`);
    },
  };
}
