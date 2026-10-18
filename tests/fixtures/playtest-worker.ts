// Local isolation fixture: the real room has no access to persistent services.
import { GameRoom as BaseRoom } from '../../worker/index';
import { makeEntity, NEUTRAL, type World } from '../../shared/game';
import type { ScheduledInput } from '../../shared/tick-input';
export class GameRoom extends BaseRoom {
  private accesses:string[];
  constructor(ctx:DurableObjectState,env:unknown){
    const accesses:string[]=[];
    super(ctx,new Proxy(env as object,{get(target,key){
      if(['DRIVERS','ECONOMIES','INCOME','GLOBAL_EVENTS','MARKET','CHAT'].includes(String(key))){
        accesses.push(String(key));throw new Error(`Forbidden persistent service: ${String(key)}`);
      }
      return Reflect.get(target,key);
    }}) as never);
    this.accesses=accesses;
  }
  async isolation(){return {accesses:this.accesses,keys:[...(await this.ctx.storage.list()).keys()],tables:this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name != '__miniflare_do_name'").toArray()};}
  async exerciseCollectionDrive(playerId:string){
    const world=Reflect.get(this,'world') as World;
    const sessions=Reflect.get(this,'sessions') as Map<WebSocket,{id:string;economy:unknown;control:ScheduledInput}>;
    const session=[...sessions.values()].find(item=>item.id===playerId);
    const player=world.players.find(item=>item.id===playerId);
    const car=world.entities.find(item=>item.id===player?.entityId);
    if(!session||!player||!car||car.kind==='person')throw new Error('Fixture requires a driver');
    const oldCar=structuredClone(car),oldEntities=world.entities,oldPickups=world.pickups;
    world.entities=[car];world.pickups=[];
    Object.assign(car,{x:-300,z:-2050,y:0,yaw:Math.PI,speed:20,vx:0,vy:0,vz:0,pushX:0,pushZ:0,
      supportId:'ground',inDome:false,autopilot:false,navigation:null});
    try{
      for(let i=0;i<160;i++){
        const control=session.control.snapshot(),tick=Reflect.get(this,'tickCount') as number;
        const result=session.control.receive({seq:control.receivedSeq+1,targetTick:tick+1,
          controlRevision:control.revision,actionSeq:control.actionSeq,input:{...NEUTRAL,throttle:1,jump:control.jump.seen,flip:control.flip.seen}},tick,Date.now());
        if(result.rejection)throw new Error(`Fixture drive rejected: ${result.rejection}`);
        Reflect.apply(Reflect.get(this,'tick') as ()=>void,this,[]);
      }
      return {distance:Math.hypot(car.x+300,car.z+2050),kind:car.kind,economy:session.economy,
        badges:player.achievements.unlocked.filter(id=>id.startsWith('tesla-drive-')||id.startsWith('vault-drive-'))};
    }finally{world.entities=oldEntities;world.pickups=oldPickups;Object.assign(car,oldCar);}
  }
  async placeCollectionNpc(playerId:string){
    const world=Reflect.get(this,'world') as World,player=world.players.find(item=>item.id===playerId);
    const person=world.entities.find(item=>item.id===player?.entityId);
    if(!person||person.kind!=='person'||!person.supportId)throw new Error('Fixture requires an on-foot driver');
    const npc=makeEntity('fixture-ambient','waymo-ipace',person.x+3,person.z);
    Object.assign(npc,{y:person.y,supportId:person.supportId,inDome:person.inDome,npc:true,autopilot:false});
    world.entities=world.entities.filter(item=>item.kind==='person'||!!item.driver);
    world.entities.push(npc);
    return {id:npc.id,kind:npc.kind};
  }
}
export default {async fetch(request:Request,env:{ROOMS:DurableObjectNamespace<GameRoom>}){
  const url=new URL(request.url);if(url.pathname==='/health')return new Response('ok');
  const room=url.pathname.split('/').at(-1)!;
  const stub=env.ROOMS.get(env.ROOMS.idFromName(room));
  if(url.pathname.startsWith('/isolation/'))return Response.json(await stub.isolation());
  if(url.pathname.startsWith('/collection-drive/'))return Response.json(await stub.exerciseCollectionDrive(url.searchParams.get('player')??''));
  if(url.pathname.startsWith('/collection-npc/'))return Response.json(await stub.placeCollectionNpc(url.searchParams.get('player')??''));
  return stub.fetch(request);
}};
