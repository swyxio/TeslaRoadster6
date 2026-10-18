import { starshipStage, type StarshipContributorGroup, type StarshipContributors } from '../shared/starship';
import { MARS_LAUNCH_SECONDS } from '../shared/mars';
import type { Session } from './session';
import type { StarshipContributorPage, StarshipPanelState } from './starship-panel';
import { validStarshipStatus, validStarshipTime, type StarshipViewStatus } from './starship-model';
import { starshipAnimation, type StarshipClock } from './starship-timeline';

const REFRESH_MS=10_000, STALE_MS=25_000, REQUEST_TIMEOUT_MS=5_000;
type Snapshot={status:StarshipViewStatus;serverTime:number;receivedAt:number};

/** Coordinates public reads and the room's private status without blocking driving. */
export class StarshipClient {
  private latest:Snapshot|null=null;
  private latestStage:number|null=null;
  private lastRoomStatus:Session['starshipStatus']=null;
  private nextPublic=0;
  private nextRoom=0;
  private contextVersion:number;
  private loading=false;
  private failed=false;
  private requestVersion=0;
  private pendingName:{id:number;at:number}|null=null;
  private privacy:StarshipPanelState['privacy']={status:'loading',publicName:null};
  private replayStartedAt:number|null=null;
  private replayIsPreview=false;
  private page:StarshipContributorPage={status:'idle',group:'at-goal',cursor:null,entries:[],next:null};
  constructor(private session:Session,private now:()=>number=()=>performance.now(),private fetcher:typeof fetch=fetch) {this.contextVersion=session.starshipContextVersion;}

  private remember(status:StarshipViewStatus,serverTime:number,receivedAt:number):void {
    if(this.latest&&serverTime<this.latest.serverTime)return;
    // Never retain a room identity in the public cache.
    this.latest={status:{...status,personal:null},serverTime,receivedAt};this.latestStage=starshipStage(status.total);this.failed=false;
  }
  tick(privateWanted=false):void {
    const now=this.now(),room=this.session.starshipStatus;
    if(this.contextVersion!==this.session.starshipContextVersion){
      this.contextVersion=this.session.starshipContextVersion;this.nextRoom=0;this.lastRoomStatus=null;
      this.pendingName=null;this.privacy={status:'loading',publicName:null};
    }
    if(room&&room!==this.lastRoomStatus&&this.session.status==='online'){
      this.lastRoomStatus=room;this.remember(room.status,room.serverTime,room.receivedAt);
      if(!this.pendingName)this.privacy={status:room.privacyPending?'pending':'ready',publicName:room.publicName};
    }else if(!room)this.lastRoomStatus=null;
    if(this.pendingName){
      const result=this.session.starshipNameResult;
      if(result?.requestId===this.pendingName.id){
        this.pendingName=null;this.session.starshipNameResult=null;
        this.privacy={status:result.ok?'ready':'error',publicName:result.ok?result.publicName:this.privacy.publicName};
        this.nextRoom=0;
      }else if(now-this.pendingName.at>REQUEST_TIMEOUT_MS*2||this.session.status!=='online'){
        this.pendingName=null;this.privacy={status:'error',publicName:this.privacy.publicName};this.nextRoom=0;
      }
    }
    const roomFresh=privateWanted&&room&&this.session.status==='online'&&now-room.receivedAt<=STALE_MS;
    if(now>=this.nextPublic&&!this.loading){this.nextPublic=now+REFRESH_MS;if(!roomFresh)void this.refresh();}
    if(privateWanted&&!this.pendingName&&now>=this.nextRoom&&this.session.status==='online'&&!this.session.walletBlocked){
      this.nextRoom=now+REFRESH_MS;this.session.requestStarshipStatus();
    }
  }
  private async get(url:string):Promise<unknown> {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
    try{
      // Native window.fetch requires its Window receiver in browsers.
      const response=await this.fetcher.call(globalThis,url,{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('Starship unavailable');
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  async refresh():Promise<void> {
    if(this.loading)return;
    this.loading=true;
    try{
      const data=await this.get('/api/starship/status') as {status?:unknown;serverTime?:unknown};
      if(!validStarshipStatus(data?.status)||data.status.personal!==null||!validStarshipTime(data.serverTime))throw new Error('Invalid Starship status');
      this.remember(data.status,data.serverTime,this.now());
    }catch{this.failed=true;}finally{this.loading=false;}
  }
  async loadContributors(group:StarshipContributorGroup,cursor:string|null):Promise<void> {
    const version=++this.requestVersion;
    this.page={status:'loading',group,cursor,entries:[],next:null};
    try{
      const params=new URLSearchParams({group});if(cursor!==null)params.set('cursor',cursor);
      const data=await this.get(`/api/starship/contributors?${params}`) as StarshipContributors;
      if(!data||data.group!==group||!['pending','building','ready'].includes(data.state)||!Array.isArray(data.contributors)||
        data.contributors.length>20||!(data.next===null||typeof data.next==='string')||
        !data.contributors.every(item=>item&&typeof item.name==='string'&&(item.amount===null||Number.isSafeInteger(item.amount)&&item.amount>=0)))throw new Error('Invalid contributor page');
      if(version!==this.requestVersion)return;
      this.page={status:data.state==='ready'?'ready':'building',group,cursor,entries:data.state==='ready'?data.contributors:[],next:data.next};
    }catch{if(version===this.requestVersion)this.page={status:'error',group,cursor,entries:[],next:null};}
  }
  setName(name:string|null):void {
    if(this.session.status!=='online'||!this.session.starshipStatus||this.session.starshipStatus.status.personal===null){
      this.privacy={status:'unavailable',publicName:null};return;
    }
    const id=this.session.setStarshipName(name);
    this.pendingName={id,at:this.now()};this.privacy={...this.privacy,status:'saving'};
  }
  state():StarshipPanelState {
    const now=this.now(),snapshot=this.latest;
    const room=this.session.status==='online'&&!this.session.walletBlocked?this.session.starshipStatus:null;
    const personal=room&&now-room.receivedAt<=STALE_MS?room.status.personal:null;
    const confirmed=snapshot?{...snapshot.status,personal:personal!==null&&personal<=snapshot.status.total?personal:null}:null;
    const income=this.session.wallet?.eligibleIncome;
    const pending=confirmed?.personal!==null&&confirmed?.personal!==undefined&&Number.isSafeInteger(income)&&income!>=confirmed.personal?income!-confirmed.personal:null;
    const freshness=!snapshot?(this.failed?'unavailable':'loading'):
      now-snapshot.receivedAt>STALE_MS||(this.failed&&(!room||now-room.receivedAt>STALE_MS))?'stale':'live';
    const clock:StarshipClock|null=snapshot?{launchAt:snapshot.status.launchAt,serverTime:snapshot.serverTime,receivedAt:snapshot.receivedAt}:null;
    const privacy=personal===null?{status:'unavailable' as const,publicName:null}:this.privacy;
    return {freshness,confirmed,pendingContribution:pending,clock,contributors:this.page,privacy};
  }
  stage():number|null {return this.latestStage;}
  animation(now=this.now(),includeReplay=true) {
    const latest=this.latest;
    const clock=latest?{launchAt:latest.status.launchAt,serverTime:latest.serverTime,receivedAt:latest.receivedAt}:null;
    return starshipAnimation(clock,includeReplay?this.replayStartedAt:null,now);
  }
  replay(preview=false):void {this.replayStartedAt=this.now();this.replayIsPreview=preview;}
  viewerMessage(now=this.now()):string {
    const state=this.state(),animation=this.animation(now),status=state.confirmed;
    if(animation)return animation.source==='global'?'The global launch is underway.':this.replayIsPreview?'Launch preview.':'Launch replay.';
    if(!status)return 'Launch status is unavailable. You can still explore the launch site.';
    if(status.crossing==='unknown')return 'The goal was reached before launch tracking began.';
    if(status.crossing==='pending')return 'Construction continues as drivers earn across Tesland.';
    if(!state.clock||status.launchAt===null)return 'Launch timing is unavailable.';
    const left=status.launchAt-(state.clock.serverTime+now-state.clock.receivedAt);
    if(left>0)return state.freshness==='live'?`Launch in ${Math.ceil(left/1000)} seconds.`:'Launch timing is unavailable while status is stale.';
    if(left<=-MARS_LAUNCH_SECONDS*1000)return 'Launch complete. Replay is available in the mission panel.';
    return 'The global launch is underway.';
  }
}
