import * as T from 'three';
import { box } from './vehicles';

/** A small low-poly cow within the shared pedestrian collision footprint. */
export function createCow():T.Group {
  const cow=new T.Group();cow.name='person';
  box(cow,0,.65,0,.65,.48,.6,0xf4efe2);
  box(cow,-.325,.7,.12,.015,.25,.22,0x292f30);
  box(cow,.325,.58,-.12,.015,.23,.22,0x292f30);
  for(const x of [-.22,.22])for(const z of [-.2,.2])box(cow,x,.2,z,.12,.4,.12,0x343436);
  box(cow,0,.85,-.3,.38,.32,.18,0xf4efe2);
  box(cow,0,.79,-.4,.3,.13,.1,0xd99f9c);
  for(const x of [-.19,.19])box(cow,x,1.02,-.3,.07,.15,.07,0xc5bba5);
  return cow;
}
