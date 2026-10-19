import { DELIVERY_DESTINATION_SNAP, planNavigation } from '../shared/navigation';
import type { GuidanceRequest, GuidanceResponse } from './delivery-guidance';

const worker=self as unknown as {onmessage:((event:MessageEvent<GuidanceRequest>)=>void)|null;postMessage:(response:GuidanceResponse)=>void};
worker.onmessage=({data})=>{
  try {
    const route=planNavigation(data.car,data.destination,data.level,DELIVERY_DESTINATION_SNAP);
    worker.postMessage({id:data.id,path:route?.path??null});
  } catch {
    worker.postMessage({id:data.id,path:null});
  }
};
