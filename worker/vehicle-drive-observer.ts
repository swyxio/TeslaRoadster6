import type { VehicleId } from '../shared/vehicles';

/** One uninterrupted, server-observed ride. Position and distance stay room-local. */
type DriveSample = {id:string;kind:VehicleId;x:number;z:number;speed:number};
type Ride = DriveSample & {distance:number};

export const COLLECTION_DRIVE_DISTANCE = 100;
const MIN_SPEED = 2;
// A room tick is 50 ms. Discard implausible jumps instead of counting a reset
// or another relocation as driving; ordinary vehicle movement is well below it.
const MAX_STEP = 12;

export class VehicleDriveObserver {
  private ride:Ride|null=null;

  reset():void { this.ride=null; }

  /** Pass null when the ride is interrupted, held, on a ferry or relocated. */
  observe(sample:DriveSample|null):VehicleId|null {
    if(!sample||![sample.x,sample.z,sample.speed].every(Number.isFinite)){
      this.reset();return null;
    }
    const previous=this.ride;
    if(!previous||previous.id!==sample.id||previous.kind!==sample.kind){
      this.ride={...sample,distance:0};return null;
    }
    const step=Math.hypot(sample.x-previous.x,sample.z-previous.z);
    if(step>MAX_STEP){this.ride={...sample,distance:0};return null;}
    const distance=previous.distance+(Math.abs(sample.speed)>MIN_SPEED?step:0);
    if(distance>=COLLECTION_DRIVE_DISTANCE){this.reset();return sample.kind;}
    this.ride={...sample,distance};return null;
  }
}
