// Estimate the room's simulation clock from completed snapshots. The room can
// slow down under load, so elapsed wall time is never itself a committed tick.
export class MotionClock {
  private observations:{tick:number;at:number}[]=[];
  private turnaround:number[]=[];
  private wire={tick:null as number|null,at:0,rate:1/50};
  private visual={tick:null as number|null,at:0,rate:1/50};
  private contactPriority=false;
  private remoteTick:number|null=null;
  private remoteAt=0;
  private remoteRate=1/50;

  reset():void {this.observations=[];this.turnaround=[];this.wire={tick:null,at:0,rate:1/50};this.visual={tick:null,at:0,rate:1/50};this.contactPriority=false;this.remoteTick=null;this.remoteAt=0;this.remoteRate=1/50;}

  observe(tick:number,at:number):boolean {
    if(!Number.isSafeInteger(tick)||tick<0||!Number.isFinite(at))return false;
    const last=this.observations.at(-1);
    if(last&&(tick<last.tick||at<last.at))return false;
    if(last&&tick===last.tick)return true;
    this.observations.push({tick,at});
    this.observations=this.observations.filter(item=>at-item.at<=2000).slice(-12);
    return true;
  }

  // This includes server batching time, so it is an upper-biased round-trip
  // observation, not an exact network RTT or an assumption of symmetry.
  observeTurnaround(ms:number):void {
    if(!Number.isFinite(ms)||ms<0)return;
    this.turnaround.push(ms);if(this.turnaround.length>20)this.turnaround.shift();
  }

  prioritizeContacts(nearby:boolean):void {this.contactPriority=nearby;}

  stale(now:number):boolean {const last=this.observations.at(-1);return !last||now-last.at>500;}

  estimate(now:number):number|null {
    const last=this.observations.at(-1),first=this.observations[0];
    if(!last||!Number.isFinite(now))return null;
    // Average multiple snapshots to resist bunched messages. Never assume the
    // server is faster than 20 Hz, and extrapolate at most six unknown ticks.
    const rate=this.rate();
    return last.tick+Math.min(6,Math.max(0,now-last.at)*rate);
  }

  private rate():number {
    const last=this.observations.at(-1),first=this.observations[0];
    if(!last||!first)return 1/50;
    const span=last.at-first.at;
    return span>0?Math.min(1/50,Math.max(0,(last.tick-first.tick)/span)):1/50;
  }

  private lead():number {
    const sorted=[...this.turnaround].sort((a,b)=>a-b);
    const high=sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:100;
    return Math.max(2,Math.min(6,Math.ceil((high+50)/50)));
  }

  private sample(now:number,clock:{tick:number|null;at:number;rate:number},visual:boolean):{target:number;alpha:number}|null {
    const last=this.observations.at(-1),estimate=this.estimate(now);
    if(!last||estimate===null||this.stale(now))return null;
    // Steer a continuous presentation clock toward the observed clock instead
    // of freezing it whenever a delayed or bunched state moves the estimate
    // backwards. The rate changes gradually and is bounded by the room clock.
    // Visual replay may forecast beyond the server's input window; commands
    // sent over the wire remain bounded separately below.
    const limit=last.tick+12;
    const candidate=Math.min(limit,Math.max(last.tick,estimate+this.lead()-1));
    if(clock.tick===null){clock.tick=candidate;clock.at=now;clock.rate=this.rate();}
    else if(now>clock.at){
      const elapsed=Math.min(100,now-clock.at),rate=this.rate();
      const error=candidate-clock.tick;
      const slow=visual&&!this.contactPriority,low=slow ? .98 : .5,high=slow ? 1.02 : 1.5;
      const desired=rate*Math.max(low,Math.min(high,1+error*.3));
      clock.rate+=(desired-clock.rate)*(1-Math.exp(-elapsed/200));
      clock.tick+=clock.rate*elapsed;clock.at=now;
    }
    clock.tick=Math.min(limit,Math.max(last.tick,clock.tick));
    if(clock.tick>=limit)return {target:limit,alpha:1};
    return {target:Math.floor(clock.tick)+1,alpha:clock.tick-Math.floor(clock.tick)};
  }

  target(now:number):number|null {this.sample(now,this.wire,false);return this.sample(now,this.visual,true)?.target??null;}
  alpha(now:number):number|null {return this.sample(now,this.visual,true)?.alpha??null;}
  inputTarget(now:number):number|null {
    const last=this.observations.at(-1),sample=this.sample(now,this.wire,false);
    return last&&sample?Math.min(last.tick+8,sample.target):null;
  }
  remote(now:number):number|null {
    const last=this.observations.at(-1),estimate=this.estimate(now);
    if(!last||estimate===null)return null;
    const candidate=Math.min(last.tick+2,estimate-2),rate=this.rate();
    if(this.remoteTick===null){this.remoteTick=candidate;this.remoteAt=now;this.remoteRate=rate;}
    else if(now>this.remoteAt){
      const elapsed=Math.min(100,now-this.remoteAt),error=candidate-this.remoteTick;
      const desired=rate*Math.max(.5,Math.min(1.5,1+error*.3));
      this.remoteRate+=(desired-this.remoteRate)*(1-Math.exp(-elapsed/200));
      this.remoteTick+=this.remoteRate*elapsed;this.remoteAt=now;
    }
    this.remoteTick=Math.min(last.tick+2,Math.max(last.tick-4,this.remoteTick));
    return this.remoteTick;
  }
}
