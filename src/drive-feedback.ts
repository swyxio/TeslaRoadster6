import { THRUSTER_REAR, type Entity, type Input } from '../shared/game';
import type { SoundEvent } from './audio-events';

/** Local HUD feedback only; room physics and input timing remain unchanged. */
export class DriveFeedback {
  private entityId?:string;
  private transient:''|'jump'|'land'='';
  private remaining=0;
  private boosting=false;
  private boostCooldown=0;
  private mode:''|'jump'|'land'|'boost'='';

  constructor(private readonly element:HTMLElement) {}

  /** Return true once when a confirmed or predicted boost starts, for its sound. */
  update(entity:Entity|undefined,input:Input,events:readonly SoundEvent[],dt:number,active:boolean):boolean {
    if(!active||!entity){this.reset();return false;}
    if(this.entityId!==entity.id){this.entityId=entity.id;this.transient='';this.remaining=0;this.boosting=false;this.boostCooldown=0;}
    const elapsed=Math.max(0,Math.min(dt,.25));
    this.remaining=Math.max(0,this.remaining-elapsed);
    this.boostCooldown=Math.max(0,this.boostCooldown-elapsed);
    for(const event of events){
      if(event.cue==='jump'||event.cue==='land'){
        this.transient=event.cue;this.remaining=event.cue==='land'?.85:.65;
      }
    }
    // The rear flag comes from the same authoritative/predicted simulation as
    // the rocket effects. Holding boost alone does not claim that it fired.
    const boosting=input.boost&&entity.air>0&&(entity.thrusters&THRUSTER_REAR)!==0;
    const started=boosting&&!this.boosting&&this.boostCooldown===0;
    if(started)this.boostCooldown=.4;
    this.boosting=boosting;
    this.show(this.remaining>0?this.transient:boosting?'boost':'');
    return started;
  }

  reset():void {
    this.entityId=undefined;this.transient='';this.remaining=0;this.boosting=false;this.boostCooldown=0;
    this.show('');
  }

  private show(mode:''|'jump'|'land'|'boost'):void {
    if(mode===this.mode)return;
    this.mode=mode;
    this.element.hidden=!mode;
    this.element.dataset.mode=mode;
    this.element.textContent=mode==='jump'?'LIFT OFF':mode==='land'?'TOUCHDOWN':mode==='boost'?'BOOST':'';
  }
}
