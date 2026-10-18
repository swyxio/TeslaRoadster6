import type { Entity } from '../shared/game';
import { isAmbientCollectionVehicle } from '../shared/vehicle-collections';
import type { VehicleId } from '../shared/vehicles';

/** Capture street fleet identity before interact changes the selected car. */
export function captureAmbientNpcCars(entities:readonly Entity[]):Map<string,VehicleId> {
  const cars=new Map<string,VehicleId>();
  for(const car of entities){
    if(isAmbientCollectionVehicle(car.kind)&&(car.npc||/^parked-\d+$/.test(car.id))&&
      !car.driver&&!car.owner&&!car.cab&&!car.retiredCab&&!car.police)
      cars.set(car.id,car.kind);
  }
  return cars;
}
