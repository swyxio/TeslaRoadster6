/** Brief presentation-only compression, tied to the controlled vehicle. */
export class LandingPulse {
  private entityId?:string;
  private pending=0;
  private pendingFor=0;
  private value=0;

  trigger(strength:number){
    this.pending=Math.max(this.pending,Math.max(0,Math.min(1,strength)));
    this.pendingFor=.15;
  }

  update(entityId:string|undefined,grounded:boolean,paused:boolean,relocated:boolean,reducedMotion:boolean,dt:number){
    const switched=entityId!==this.entityId;
    this.entityId=entityId;
    if(!entityId||switched||paused||relocated||reducedMotion){this.value=0;this.pending=0;this.pendingFor=0;}
    else if(!grounded){
      this.value=0;
      // Authority and predicted presentation can show contact one frame apart.
      // Retain the event only briefly rather than squashing a later jump.
      this.pendingFor=Math.max(0,this.pendingFor-Math.max(0,dt));
      if(!this.pendingFor)this.pending=0;
    }
    else{
      this.value=Math.max(0,this.value-4*Math.min(.1,Math.max(0,dt)));
      this.value=Math.max(this.value,this.pending);
      this.pending=0;this.pendingFor=0;
    }
    return 1-.05*this.value;
  }
}
