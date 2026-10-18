import { THRUSTER_REAR, type Entity, type Input } from '../shared/game';
import { hasRockets } from '../shared/upgrades';
import type { SoundEvent } from './audio-events';

/** Local HUD feedback only; room physics and input timing remain unchanged. */
export class DriveFeedback {
  private entityId?:string;
  private transient:''|'jump'|'land'='';
  private remaining=0;
  private boostHeld=false;
  private boostCooldown=0;
  private mode:''|'jump'|'land'|'boost'='';

  constructor(private readonly element:HTMLElement) {}

  /** Return true when an available-looking boost input begins, for a local cue. */
  update(entity:Entity|undefined,input:Input,events:readonly SoundEvent[],dt:number,active:boolean):boolean {
    if(!active||!entity){this.reset();return false;}
    if(this.entityId!==entity.id){this.entityId=entity.id;this.transient='';this.remaining=0;this.boostHeld=false;this.boostCooldown=0;}
    const elapsed=Math.max(0,Math.min(dt,.25));
    this.remaining=Math.max(0,this.remaining-elapsed);
    this.boostCooldown=Math.max(0,this.boostCooldown-elapsed);
    for(const event of events){
      if(event.cue==='jump'||event.cue==='land'){
        this.transient=event.cue;this.remaining=event.cue==='land'?.85:.65;
      }
    }
    // Air may reach zero during a partial boost tick. A rear plume keeps the
    // input cue visible, but may also be ordinary flight, so it is not proof.
    const rear=(entity.thrusters&THRUSTER_REAR)!==0;
    const airborne=entity.supportId===null||entity.supportId==='stunt-loop'||entity.supportId==='island-cliff';
    const boostHeld=input.boost&&hasRockets(entity)&&(entity.air>0||rear)&&(input.throttle!==0||airborne||rear);
    const started=boostHeld&&!this.boostHeld&&this.boostCooldown===0;
    if(started)this.boostCooldown=.4;
    this.boostHeld=boostHeld;
    this.show(this.remaining>0?this.transient:boostHeld?'boost':'');
    return started;
  }

  reset():void {
    this.entityId=undefined;this.transient='';this.remaining=0;this.boostHeld=false;this.boostCooldown=0;
    this.show('');
  }

  private show(mode:''|'jump'|'land'|'boost'):void {
    if(mode===this.mode)return;
    this.mode=mode;
    this.element.hidden=!mode;
    this.element.dataset.mode=mode;
    this.element.textContent=mode==='jump'?'LIFT OFF':mode==='land'?'TOUCHDOWN':mode==='boost'?'BOOST HELD':'';
  }
}
