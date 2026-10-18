// Estimate the room's simulation clock from completed snapshots. The room can
// slow down under load, so elapsed wall time is never itself a committed tick.
export class MotionClock {
  private observations:{tick:number;at:number}[]=[];
  private turnaround:number[]=[];
  private presentedTick:number|null=null;
  private presentedAt=0;
  private presentedRate=1/50;
  private remoteTick:number|null=null;
  private remoteAt=0;
  private remoteRate=1/50;

  reset():void {this.observations=[];this.turnaround=[];this.presentedTick=null;this.presentedAt=0;this.presentedRate=1/50;this.remoteTick=null;this.remoteAt=0;this.remoteRate=1/50;}

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

  private sample(now:number):{target:number;alpha:number}|null {
    const last=this.observations.at(-1),estimate=this.estimate(now);
    if(!last||estimate===null||this.stale(now))return null;
    // Steer a continuous presentation clock toward the observed clock instead
    // of freezing it whenever a delayed or bunched state moves the estimate
    // backwards. The rate changes gradually and is bounded by the room clock.
    // Visual replay may forecast beyond the server's input window; commands
    // sent over the wire remain bounded separately below.
    const limit=last.tick+12;
    const candidate=Math.min(limit,Math.max(last.tick,estimate+this.lead()-1));
    if(this.presentedTick===null){this.presentedTick=candidate;this.presentedAt=now;this.presentedRate=this.rate();}
    else if(now>this.presentedAt){
      const elapsed=Math.min(100,now-this.presentedAt),rate=this.rate();
      const error=candidate-this.presentedTick;
      const desired=rate*Math.max(.5,Math.min(1.5,1+error*.3));
      this.presentedRate+=(desired-this.presentedRate)*(1-Math.exp(-elapsed/200));
      this.presentedTick+=this.presentedRate*elapsed;this.presentedAt=now;
    }
    this.presentedTick=Math.min(limit,Math.max(last.tick,this.presentedTick));
    if(this.presentedTick>=limit)return {target:limit,alpha:1};
    return {target:Math.floor(this.presentedTick)+1,alpha:this.presentedTick-Math.floor(this.presentedTick)};
  }

  target(now:number):number|null {return this.sample(now)?.target??null;}
  alpha(now:number):number|null {return this.sample(now)?.alpha??null;}
  inputTarget(now:number):number|null {
    const last=this.observations.at(-1),sample=this.sample(now);
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
