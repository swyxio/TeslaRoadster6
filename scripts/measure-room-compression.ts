// Compare two real local Wrangler WebSocket streams without decoding frames.
// pnpm exec tsx scripts/measure-room-compression.ts http://127.0.0.1:8787
import { randomBytes } from 'node:crypto';
import { connect } from 'node:net';

const base=new URL(process.argv[2]??'http://127.0.0.1:8787');
if(base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname))throw new Error('Only local HTTP Wrangler is allowed');
const room=`wire-${Date.now()}-${randomBytes(3).toString('hex')}`;
type Sample={extension:string;frameSizes:number[];compressed:number;socket:ReturnType<typeof connect>;error?:Error};
async function sample(requestCompression:boolean):Promise<Sample>{
  const socket=connect({host:base.hostname.replace(/^\[|\]$/g,''),port:Number(base.port||80)});
  const result:Sample={extension:'',frameSizes:[],compressed:0,socket};
  let pending=Buffer.alloc(0),handshake=true,textFrames=0;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{socket.destroy();reject(new Error('WebSocket handshake timed out'));},10000);
    socket.on('error',error=>{result.error=error;clearTimeout(timeout);reject(error);});
    socket.on('close',()=>{result.error??=new Error('Socket closed before sampling finished');});
    socket.on('connect',()=>{
      const extension=requestCompression?'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n':'';
      socket.write(`GET /api/room/${room} HTTP/1.1\r\nHost: ${base.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n${extension}\r\n`);
    });
    socket.on('data',chunk=>{
      pending=Buffer.concat([pending,chunk]);
      if(handshake){
        const end=pending.indexOf('\r\n\r\n');if(end<0)return;
        const headers=pending.subarray(0,end).toString();pending=pending.subarray(end+4);
        if(!/^HTTP\/1\.1 101\b/.test(headers)){clearTimeout(timeout);socket.destroy();reject(new Error(`Upgrade failed: ${headers.split('\r\n')[0]}`));return;}
        result.extension=headers.match(/^sec-websocket-extensions:\s*(.*)$/im)?.[1]?.trim()??'';
        handshake=false;clearTimeout(timeout);resolve(result);
      }
      while(pending.length>=2){
        const first=pending[0],second=pending[1];let length=second&127,header=2;
        if(length===126){if(pending.length<4)return;length=pending.readUInt16BE(2);header=4;}
        else if(length===127){if(pending.length<10)return;length=Number(pending.readBigUInt64BE(2));header=10;}
        if((second&128)||!(first&128)){
          result.error=new Error('Masked or fragmented server frame is unsupported');socket.destroy();return;
        }
        if(pending.length<header+length)return;
        if((first&15)===1){
          // The first text frame is welcome. Subsequent text frames are snapshots.
          if(textFrames++>0){result.frameSizes.push(header+length);if(first&64)result.compressed++;}
        }
        pending=pending.subarray(header+length);
      }
    });
  });
}
const [plain,compressed]=await Promise.all([sample(false),sample(true)]);
try{
  await new Promise(resolve=>setTimeout(resolve,4000));
  const describe=(s:Sample)=>{
    if(s.error)throw s.error;
    const sorted=[...s.frameSizes].sort((a,b)=>a-b);
    if(sorted.length<2)throw new Error('Not enough snapshot frames received');
    return {extension:s.extension||'(none)',frames:sorted.length,compressedFrames:s.compressed,p50FrameBytes:sorted[Math.floor(sorted.length/2)]};
  };
  console.log(JSON.stringify({scope:'local WebSocket frames including frame headers; excludes TCP/IP',plain:describe(plain),requestedCompression:describe(compressed)},null,2));
  if(!compressed.extension.toLowerCase().includes('permessage-deflate')||compressed.compressed!==compressed.frameSizes.length)throw new Error('Compression was not negotiated or used for all sampled frames');
}finally{plain.socket.destroy();compressed.socket.destroy();}
