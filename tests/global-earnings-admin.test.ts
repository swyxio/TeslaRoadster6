import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import test from 'node:test';
import { scheduleGlobalEarnings } from '../worker/global-earnings-admin';

// Workerd provides this Web Crypto extension; exercise equivalent comparison in Node.
Object.defineProperty(crypto.subtle,'timingSafeEqual',{value:(a:ArrayBuffer,b:ArrayBuffer)=>timingSafeEqual(Buffer.from(a),Buffer.from(b))});
const token='fixture-token-0123456789-abcdefghijklmnopqrstuvwxyz';
const secretless={GLOBAL_EVENTS:{} as never};
function fixture(){
  const calls:{id:string;start:number}[]=[];
  const stub={schedule:async(id:string,start:number)=>{calls.push({id,start});return {startsAtMs:start,endsAtMs:start+1_800_000};}};
  const env={STARSHIP_ADMIN_TOKEN:token,GLOBAL_EVENTS:{idFromName:(name:string)=>{assert.equal(name,'global');return name;},get:()=>stub} as never};
  return {calls,env};
}
function request(auth:string|null,body='{"requestId":"event-1","startsAtMs":2000000000000}',method='POST'){
  return new Request('https://game.example/api/admin/earnings-events',{method,headers:{...(auth?{Authorization:auth}:{}),'Content-Type':'application/json'},...(method==='POST'?{body}:{})});
}
test('event scheduling is disabled without a strong configured operator secret',async()=>{
  assert.equal((await scheduleGlobalEarnings(request(null),secretless)).status,503);
  assert.equal((await scheduleGlobalEarnings(request(null),{...secretless,STARSHIP_ADMIN_TOKEN:'short'})).status,503);
});
test('only an authenticated operator can schedule; malformed input never reaches the coordinator',async()=>{
  const {calls,env}=fixture();
  assert.equal((await scheduleGlobalEarnings(request(null),env)).status,401);
  assert.equal((await scheduleGlobalEarnings(request('Bearer wrong'),env)).status,401);
  assert.equal((await scheduleGlobalEarnings(request(`Bearer ${token}`,'','GET'),env)).status,405);
  assert.equal((await scheduleGlobalEarnings(request(`Bearer ${token}`,'{'),env)).status,400);
  assert.equal((await scheduleGlobalEarnings(request(`Bearer ${token}`,'{"startsAtMs":0}'),env)).status,400);
  assert.equal((await scheduleGlobalEarnings(request(`Bearer ${token}`,'x'.repeat(1025)),env)).status,413);
  assert.deepEqual(calls,[]);
  const response=await scheduleGlobalEarnings(request(`Bearer ${token}`),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{startsAtMs:2_000_000_000_000,endsAtMs:2_000_001_800_000});
  assert.deepEqual(calls,[{id:'event-1',start:2_000_000_000_000}]);
});
test('coordinator validation and an unavailable service are distinct',async()=>{
  const {env}=fixture();
  const failing=(message:string)=>({...env,GLOBAL_EVENTS:{idFromName:()=>'',get:()=>({schedule:async()=>{throw new Error(message);}})} as never});
  assert.equal((await scheduleGlobalEarnings(request(`Bearer ${token}`),failing('Event overlaps an existing event'))).status,400);
  assert.equal((await scheduleGlobalEarnings(request(`Bearer ${token}`),failing('backend unavailable'))).status,503);
});
