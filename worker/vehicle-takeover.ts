import type { Entity } from '../shared/game';
import type { VehicleId } from '../shared/vehicles';

/** Capture before interact turns the selected car's autopilot off. */
export function captureAmbientNpcCars(entities:readonly Entity[]):Map<string,VehicleId> {
  const cars=new Map<string,VehicleId>();
  for(const car of entities){
    if(car.kind!=='person'&&car.npc&&car.autopilot&&!car.driver&&!car.owner&&!car.cab&&!car.retiredCab&&!car.police)
      cars.set(car.id,car.kind);
  }
  return cars;
}
