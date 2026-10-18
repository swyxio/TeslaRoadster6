import assert from 'node:assert/strict';
const base='http://127.0.0.1:24936',delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f){for(let i=0;i<400;i++){if(await f())return;await delay(25);}throw Error('Timed out waiting for local test room');}
async function sample(room){
  const clients=[];
  try{
    for(let i=0;i<5;i++){
      const state={id:'',ready:false,ws:new WebSocket(base.replace('http','ws')+'/api/room/'+room)};clients.push(state);
      state.ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.type==='welcome'){state.id=m.id;state.ws.send(JSON.stringify({type:'identity',code:null,requestId:1}));}if(m.type==='state'&&m.control)state.ready=true;};
      await until(()=>state.id&&state.ready);
    }
    const response=await fetch(base+'/__wallet-test/driving-measurement-start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room,playerIds:clients.map(c=>c.id)})});
    assert.equal(response.status,200,await response.clone().text());const setup=await response.json();
    assert.equal(setup.cars.length,5);assert.ok(setup.traffic.length>5);
    assert.deepEqual(setup.cars.map(c=>[c.x,c.z,c.yaw,c.speed,c.health,c.air]),Array.from({length:5},(_,i)=>[-300+i*12,-2050,Math.PI,0,100,100]));
    const stop=await fetch(base+'/__wallet-test/measurement-stop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room})});assert.equal(stop.status,200);
    return setup;
  }finally{for(const c of clients)c.ws.close();}
}
const a=await sample('stage-a'),b=await sample('stage-b');
assert.deepEqual(a.traffic,b.traffic);assert.deepEqual(a.cars,b.cars);
console.log(JSON.stringify({pass:true,traffic:a.traffic.length,cars:a.cars.length,worldTimes:[a.worldTime,b.worldTime]}));
