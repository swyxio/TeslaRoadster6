import { SF_NORTH_SPECS } from './new-landmarks-sf-north';
import { specs as peninsulaSouth } from './new-landmarks-peninsula-south';
import { specs as eastBay } from './new-landmarks-east-bay';
import { NEW_LANDMARK_POSITIONS } from './new-landmarks-positions';

// Open-air groves, gardens, rides and skeletal memorials use the same
// non-colliding convention as existing park trees and bridge furniture.
const decorative=new Set([
  'muir-woods','presidio-tunnel-tops','dewey-monument','great-america',
  'our-lady-of-peace','electric-light-tower','new-rosie-memorial',
  'new-uc-botanical-garden','new-berkeley-rose-garden','new-morcom-rose-garden',
  'new-tilden-steam-trains',
]);
/** Original arcade interpretations, with positions shared by rendering and physics. */
export const NEW_LANDMARKS = [...SF_NORTH_SPECS,...peninsulaSouth,...eastBay].map(place=>{
  const position=NEW_LANDMARK_POSITIONS[place.id];
  if(!position)throw new Error(`Missing landmark position: ${place.id}`);
  const district: 'sf'|'oakland'|'peninsula'|'south-bay'|'east-bay' =
    place.area==='sf'||place.area==='marin'?'sf':
    place.area==='peninsula'?'peninsula':place.area==='south-bay'?'south-bay':
    ['Berkeley','Oakland','Alameda','Richmond'].includes(place.area)?'oakland':'east-bay';
  return {...place,x:position[0],z:position[1],w:16,d:14,district,solid:!decorative.has(place.id)};
});
