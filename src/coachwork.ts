import * as T from 'three';
import type { VehicleSpec } from '../shared/vehicles';
// Cross-section lofts keep curved shoulders and tapered cabins independent of physics.
const cache=new Map<string,T.BufferGeometry>();
type Section=[number,number,number,number]; // z, half width, bottom, crown
export function loft(sections:Section[],roundness=.35){
 const key=JSON.stringify([sections,roundness]);if(cache.has(key))return cache.get(key)!;
 const p:number[]=[],idx:number[]=[],rings=sections.length,n=24;
 for(const [z,w,b,t] of sections)for(let j=0;j<n;j++){
  const a=j/n*Math.PI*2,s=Math.sin(a),c=Math.cos(a);
  p.push(Math.sign(c)*Math.pow(Math.abs(c),roundness)*w,b+(t-b)*(1+Math.sign(s)*Math.pow(Math.abs(s),roundness))/2,z);
 }
 for(let i=0;i<rings-1;i++)for(let j=0;j<n;j++){const a=i*n+j,b=i*n+(j+1)%n,c=b+n,d=a+n;idx.push(a,b,c,a,c,d);}
 for(const [ring,flip] of [[0,true],[rings-1,false]] as const){const center=p.length/3;const s=sections[ring];p.push(0,(s[2]+s[3])/2,s[0]);for(let j=0;j<n;j++){const a=ring*n+j,b=ring*n+(j+1)%n;idx.push(center,flip?b:a,flip?a:b);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();cache.set(key,g);return g;
}
export function coachwork(root:T.Group,s:VehicleSpec,paint:T.Material,glass:T.Material,trim:T.Material){
 const {length:l,width:w,height:h}=s,sport=s.shape==='roadster',van=s.shape==='van',suv=s.shape==='suv',classic=s.id==='roadster-original',cab=s.id==='cybercab';
 const belt=h*(sport?.55:van?.53:.55);
 const sections:Section[]=[[-.5,.76,.27,belt*.75],[-.47,.88,.23,belt*.91],[-.39,.97,.22,belt],[-.29,1,.22,belt*1.08],[-.14,.96,.23,belt*.99],[.08,.97,.23,belt],[.29,1,.23,belt*1.13],[.42,.98,.26,belt*1.05],[.49,.86,.3,belt*.93],[.5,.78,.34,belt*.86]].map(([z,x,b,t])=>[z*l,x*w/2,b,t]);
 const dense:Section[]=[];
 for(let i=0;i<sections.length-1;i++)for(let k=0;k<8;k++)dense.push(sections[i].map((v,j)=>v+(sections[i+1][j]-v)*k/8) as Section);
 dense.push(sections[sections.length-1]);
 const body=loft(dense,.48).clone();
 // Genuine wheel openings: lift lower side surfaces over the four wheel wells.
 const pos=body.getAttribute('position');const radius=sport?.34:.36;
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),z=pos.getZ(i),y=pos.getY(i),delta=Math.min(Math.abs(z-s.wheelbase/2),Math.abs(z+s.wheelbase/2));
  if(Math.abs(x)>w*.34&&delta<radius+.055&&y<belt*.84){const arch=radius+Math.sqrt(Math.max(0,(radius+.055)**2-delta**2));pos.setY(i,Math.max(y,arch));}
 }
 body.computeVertexNormals(); // This geometry is cached by model below, not allocated per NPC.
 const key=`body:${s.id}`;if(cache.has(key)){body.dispose();}else cache.set(key,body);
 root.add(new T.Mesh(cache.get(key)!,paint));
 // Per-platform cabin landmarks: windshield foot, roof front/rear, rear glass foot.
 const cabins:Partial<Record<VehicleSpec['id'],number[]>>={
  roadster:[-.22,-.025,.14,.34], 'roadster-original':[-.2,-.06,.1,.25],cybercab:[-.28,-.02,.14,.4],
  'model-s':[-.27,-.085,.12,.4],'model-3':[-.3,-.10,.14,.4],
  'model-x':[-.31,-.13,.20,.43],'model-y':[-.32,-.12,.19,.43],'model-y-l':[-.32,-.12,.23,.43],
  'waymo-prius':[-.34,-.03,.12,.45],'waymo-lexus':[-.29,-.13,.25,.44],
  'waymo-ipace':[-.34,-.16,.22,.44],'waymo-ioniq5':[-.31,-.14,.25,.43],
  'cruise-bolt':[-.32,-.15,.27,.44],'cruise-leaf':[-.31,-.11,.23,.44],
  'cruise-rp1':[-.27,-.12,.18,.38],'zoox-highlander':[-.28,-.14,.3,.44],
 };
 const [start,roofFront,roofRear,end]=cabins[s.id]??[van?-.36:-.29,-.10,van?.29:.16,van?.43:suv?.4:.39];
 const roof:Section[]=[[start,.75,belt*.98,belt*1.03],[(start+roofFront)/2,.74,belt,h*.84],[roofFront,.7,belt,h*.97],[(roofFront+roofRear)/2,.68,belt,h],[roofRear,.69,belt,h*.98],[(roofRear+end)/2,.74,belt,h*.82],[end,.78,belt,belt*1.05]].map(([z,x,b,t])=>[z*l,x*w/2,b,t]);

 if(!classic){
  root.add(new T.Mesh(loft(roof,.55),glass));
  // Narrow roof panel and window pillars leave the raked windshield legible.
  if(!cab){root.add(new T.Mesh(loft([[roofFront*l,w*.31,h*.96,h*.978],[(roofFront+roofRear)*l/2,w*.3,h*.993,h*1.007],[roofRear*l,w*.31,h*.97,h*.988]],.7),paint));}
 }else{
  root.add(new T.Mesh(loft([[-.20*l,w*.37,belt,belt+.03],[-.06*l,w*.33,h*.94,h]],.6),glass));
  const tub=new T.Mesh(new T.BoxGeometry(w*.65,.12,l*.22),trim);tub.position.set(0,belt,.06*l);root.add(tub);
 }
 for(const side of [-1,1]){
  const sill=new T.Mesh(loft([[-.3*l,.04,.24,.31],[.3*l,.04,.24,.31]],.6),trim);sill.position.x=side*w*.46;root.add(sill);
  const mirror=new T.Mesh(new T.SphereGeometry(1,12,8),paint);mirror.scale.set(.13,.065,.19);mirror.position.set(side*w*.51,belt+.14,-l*.15);root.add(mirror);
  if(!sport){const pillar=new T.Mesh(new T.BoxGeometry(.035,h*.3,.055),trim);pillar.position.set(side*w*.36,h*.77,l*.05);root.add(pillar);}
  const handle=new T.Mesh(new T.BoxGeometry(.025,.025,.16),trim);handle.position.set(side*w*.485,belt*.91,l*.06);root.add(handle);
 }
}
