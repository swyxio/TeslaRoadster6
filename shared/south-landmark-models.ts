import type { SouthLandmark } from './south-landmarks';

export type SouthModelGeometry='box'|'cylinder'|'cone'|'roof'|'dome';
/** Local dimensions are the original unit mesh scales: cylinder/dome radius 1,
 * and roof ConeGeometry(1,1,4) rotated by π/4. Geometry, visual transforms and
 * structural tags have one authoring source; glass/paint and plants are visual. */
export type SouthModelPiece={
 geometry:SouthModelGeometry;x:number;y:number;z:number;w:number;h:number;d:number;color:number;
 structural:boolean;rotationX?:number;rotationY?:number;rotationZ?:number;doubleSided?:boolean;
};
 const dark=0x53696c,roof=0xa65d4b,glass=0x6c9295,cream=0xede1ca;
 const block=(group:SouthModelPiece[],x:number,y:number,z:number,w:number,h:number,d:number,color:number,geometry:SouthModelGeometry='box',structural=true)=>{
  const piece:SouthModelPiece={geometry,x,y,z,w,h,d,color,structural};group.push(piece);return piece;
 };
 const disk=(group:SouthModelPiece[],x:number,y:number,z:number,r:number,h:number,color:number,structural=true)=>block(group,x,y,z,r,h,r,color,'cylinder',structural);
 const gable=(g:SouthModelPiece[],y:number,w:number,h:number,d:number,color:number)=>{
  block(g,0,y,0,w*.707,h,d*.707,color,'roof');
 };
 const columns=(g:SouthModelPiece[],w:number,y:number,z:number,count:number,h:number)=>{
  for(let i=0;i<count;i++)block(g,-w*.4+(w*.8*i)/(count-1),y,z,.7,h,.7,cream);
 };
 function facade(g:SouthModelPiece[],l:SouthLandmark,height:number){
  const {w,d,color}=l;block(g,0,height/2,0,w*.9,height,d*.82,color);
  for(const x of [-.28,0,.28])block(g,x*w,height*.54,d*.415,w*.13,height*.3,.12,glass,'box',false);
  block(g,0,height*.16,d*.42,w*.11,height*.32,.13,dark,'box',false);
 }
 export function buildSouthLandmarkModel(l:SouthLandmark):SouthModelPiece[]{
  const {w,d,h,color,style}=l,g:SouthModelPiece[]=[];
  switch(style){
   case 'civic':{
    facade(g,l,h*.68);columns(g,w,h*.34,d*.43,4,h*.48);
    block(g,0,h*.7,0,w*.93,h*.08,d*.86,cream);
    disk(g,0,h*.83,0,w*.2,h*.2,color);const dome=block(g,0,h*.93,0,w*.2,h*.07,w*.2,cream,'dome');dome.rotationY=Math.PI/4;break;
   }
   case 'station':{
    facade(g,l,h*.54);gable(g,h*.68,w*.88,h*.28,d*.83,roof);
    block(g,-w*.3,h*.69,0,w*.12,h*.3,d*.14,color);block(g,-w*.3,h*.87,0,w*.16,h*.06,d*.18,roof);break;
   }
   case 'mansion':{
    facade(g,l,h*.63);gable(g,h*.77,w*.9,h*.28,d*.83,roof);
    for(const x of [-.32,.32]){
      block(g,x*w,h*.69,d*.16,w*.19,h*.4,d*.22,color);
      block(g,x*w,h*.9,d*.16,w*.2,h*.14,d*.2,roof,'roof');
    }
    block(g,0,h*.4,d*.41,w*.5,h*.06,d*.16,cream);columns(g,w*.52,h*.2,d*.46,4,h*.4);break;
   }
   case 'museum':{
    facade(g,l,h*.65);block(g,0,h*.68,0,w*.94,h*.07,d*.86,cream);
    if(l.id==='tech-interactive'||l.id==='childrens-discovery'){
      const sphere=block(g,-w*.2,h*.75,0,w*.2,h*.25,w*.2,cream,'dome');sphere.rotationY=.3;
      block(g,w*.2,h*.83,0,w*.12,h*.3,d*.12,glass);
    }else{columns(g,w*.82,h*.34,d*.43,4,h*.48);gable(g,h*.84,w*.82,h*.24,d*.4,cream);}
    break;
   }
   case 'theater':{
    facade(g,l,h*.8);block(g,0,h*.86,0,w*.95,h*.12,d*.86,cream);
    block(g,0,h*.72,d*.44,w*.62,h*.13,d*.12,0xd6a66f);
    for(const x of [-.22,0,.22])block(g,x*w,h*.72,d*.49,w*.07,h*.045,.08,0xffe0a0,'box',false);
    block(g,0,h*.96,0,w*.17,h*.08,d*.35,color);break;
   }
   case 'temple':{
    const base=h*.12;block(g,0,base/2,0,w*.9,base,d*.9,color);
    if(l.id==='rosicrucian'){
      block(g,0,h*.43,0,w*.7,h*.62,d*.65,color);
      for(const x of [-.37,.37])block(g,x*w,h*.49,d*.25,w*.16,h*.76,d*.3,color);
      for(const x of [-.2,0,.2])disk(g,x*w,h*.4,d*.36,.55,h*.56,cream);
      block(g,0,h*.9,0,w*.9,h*.12,d*.75,cream);
    }else if(l.id==='pulgas'){
      for(let i=0;i<8;i++){const a=i*Math.PI/4;disk(g,Math.sin(a)*w*.32,h*.44,Math.cos(a)*d*.32,.7,h*.64,cream);}
      const rim=disk(g,0,h*.81,0,w*.4,h*.12,color);rim.d=d*.4;
      const cap=disk(g,0,h*.91,0,w*.33,h*.08,cream);cap.d=d*.33;
    }else{
      for(const x of [-.32,.32])for(const z of [-.28,.28])disk(g,x*w,h*.44,z*d,.65,h*.64,cream);
      block(g,0,h*.81,0,w*.82,h*.12,d*.75,color);gable(g,h*.94,w*.82,h*.12,d*.72,cream);
    }break;
   }
   case 'church':{
    facade(g,l,h*.55);gable(g,h*.68,w*.88,h*.28,d*.82,roof);
    for(const x of [-.34,.34]){block(g,x*w,h*.45,d*.25,w*.16,h*.9,d*.17,color);block(g,x*w,h*.94,d*.25,w*.2,h*.08,d*.2,cream);}
    disk(g,0,h*.57,d*.424,w*.13,.08,0xe3b174,false).rotationX=Math.PI/2;
    for(const x of [-.18,0,.18])block(g,x*w,h*.32,d*.43,w*.1,h*.22,.1,glass,'box',false);break;
   }
   case 'quad':{
    block(g,0,h*.12,0,w*.9,h*.24,d*.85,color);block(g,0,h*.6,-d*.28,w*.9,h*.3,d*.18,color);
    for(const x of [-.38,-.19,0,.19,.38])block(g,x*w,h*.4,d*.25,w*.07,h*.55,d*.15,cream);
    block(g,0,h*.7,d*.25,w*.9,h*.1,d*.2,color);gable(g,h*.82,w*.9,h*.25,d*.22,roof);break;
   }
   case 'rotunda':{
    block(g,0,h*.27,0,w*.9,h*.54,d*.8,color);columns(g,w*.82,h*.31,d*.41,4,h*.48);
    disk(g,0,h*.62,0,w*.25,h*.24,color);block(g,0,h*.74,0,w*.25,h*.26,w*.25,cream,'dome');
    block(g,0,h*.92,0,w*.06,h*.16,d*.06,cream);break;
   }
   case 'dish':{
    block(g,0,h*.27,0,w*.1,h*.54,d*.1,dark);
    for(const x of [-.3,.3]){const leg=block(g,x*w*.5,h*.22,0,w*.06,h*.45,d*.06,dark);leg.rotationZ=x>0?.45:-.45;}
    const bowl=block(g,0,h*.66,0,w*.44,h*.2,d*.44,color,'dome');bowl.rotationZ=Math.PI;bowl.doubleSided=true;
    block(g,0,h*.78,0,w*.03,h*.27,d*.03,dark);disk(g,0,h*.93,0,w*.08,h*.04,dark);break;
   }
   case 'hangar':{
    block(g,0,h*.23,0,w*.9,h*.46,d*.9,color);block(g,0,h*.46,0,w*.45,h*.54,d*.45,cream,'dome');
    for(const x of [-.27,0,.27])block(g,x*w,h*.25,d*.46,w*.2,h*.37,.1,glass,'box',false);
    for(const x of [-.37,.37])block(g,x*w,h*.28,d*.47,w*.035,h*.45,.12,cream,'box',false);break;
   }
   case 'arena':{
    const bowl=block(g,0,h*.3,0,w*.45,h*.6,d*.45,color,'cylinder');
    const cap=block(g,0,h*.6,0,w*.45,h*.26,d*.45,cream,'dome');cap.rotationY=.2;
    disk(g,0,h*.2,0,w*.47,h*.08,dark).d=d*.47;break;
   }
   case 'adobe':{
    facade(g,l,h*.6);block(g,0,h*.65,0,w*.96,h*.08,d*.88,roof);
    for(const x of [-.32,.32])block(g,x*w,h*.7,0,w*.08,h*.16,d*.12,cream);break;
   }
   case 'market':{
    facade(g,l,h*.7);gable(g,h*.84,w*.9,h*.25,d*.84,roof);
    for(const x of [-.3,0,.3])block(g,x*w,h*.36,d*.40,w*.22,h*.06,d*.18,0xf1d6a0);
    break;
   }
   case 'tower':{
    facade(g,l,h*.48);block(g,0,h*.7,0,w*.25,h*.6,d*.28,color);gable(g,h*.94,w*.3,h*.12,d*.34,roof);
    disk(g,0,h*.76,d*.145,w*.08,.06,cream,false).rotationX=Math.PI/2;break;
   }
   case 'peak':{
    block(g,0,h*.54,0,w*.12,h*.8,d*.12,cream);
    block(g,0,h*.84,0,w*.4,h*.07,d*.08,dark);disk(g,0,h*.98,0,w*.09,h*.04,dark);break;
   }
   case 'garden':{
    block(g,0,h*.08,0,w*.85,h*.16,d*.8,0x94b581);
    if(l.id==='stanford-oval'){
      for(const x of [-.33,.33])for(const z of [-.27,.27]){
        block(g,x*w,h*.45,z*d,.55,h*.72,.55,0x8f7457,'box',false);
        for(const a of [0,Math.PI/3,Math.PI*2/3]){const leaf=block(g,x*w,h*.85,z*d,w*.23,.5,1.1,0x668e64,'box',false);leaf.rotationY=a;}
      }
      block(g,0,h*.2,0,w*.2,h*.25,d*.2,cream);
    }else if(l.id==='arizona-garden'){
      for(const [x,z] of [[-.3,-.2],[0,.15],[.3,-.12]]){
        block(g,x*w,h*.45,z*d,w*.07,h*.65,d*.08,0x5f8d63,'box',false);
        block(g,x*w,h*.5,z*d,w*.19,h*.07,d*.07,0x5f8d63,'box',false);
      }
    }else if(l.id==='sj-rose-garden'){
      for(const x of [-.3,0,.3])for(const z of [-.2,.2])block(g,x*w,h*.22,z*d,w*.12,h*.2,d*.1,x===0?0xf0cfba:0xc57270,'box',false);
      for(const x of [-.24,.24])block(g,x*w,h*.48,0,.5,h*.74,.5,cream);
      block(g,0,h*.87,0,w*.52,.6,.6,cream);
    }else{
      block(g,0,h*.43,0,w*.54,h*.45,d*.43,color);columns(g,w*.55,h*.42,d*.24,3,h*.5);
      block(g,0,h*.69,0,w*.67,h*.07,d*.55,dark);gable(g,h*.82,w*.7,h*.22,d*.58,roof);
      for(const x of [-.37,.37]){block(g,x*w,h*.3,-d*.2,.5,h*.42,.5,0x795e48,'box',false);block(g,x*w,h*.57,-d*.2,w*.08,h*.25,w*.08,0x64885f,'cone',false);}
    }break;
   }
   case 'zoo':{
    block(g,0,h*.2,0,w*.9,h*.4,d*.8,color);gable(g,h*.55,w*.9,h*.3,d*.8,roof);
    for(const x of [-.3,.3]){block(g,x*w,h*.35,d*.43,w*.14,h*.6,d*.12,cream);gable(g,h*.74,w*.2,h*.15,d*.2,roof);}
    block(g,0,h*.23,d*.42,w*.23,h*.4,.1,dark,'box',false);break;
   }
   case 'slide':{
    block(g,-w*.25,h*.38,0,w*.12,h*.76,d*.12,cream);block(g,-w*.25,h*.78,0,w*.25,h*.08,d*.22,color);
    const chute=block(g,w*.04,h*.45,0,w*.65,h*.08,d*.2,color);chute.rotationZ=-.52;
    block(g,w*.3,h*.1,0,w*.2,h*.08,d*.5,0x82c6cf);break;
   }
   case 'nursery':{
    block(g,0,h*.06,0,w*.9,h*.12,d*.8,0x94b581);
    for(const x of [-.34,.34])block(g,x*w,h*.35,0,w*.09,h*.6,d*.09,cream);
    block(g,0,h*.69,0,w*.77,h*.08,d*.12,cream);gable(g,h*.85,w*.8,h*.25,d*.24,roof);break;
   }
   case 'garage':{
    block(g,0,h*.34,0,w*.8,h*.68,d*.76,color);gable(g,h*.82,w*.84,h*.3,d*.8,roof);
    block(g,0,h*.3,d*.385,w*.5,h*.5,.1,cream,'box',false);
    for(let y=.14;y<.55;y+=.1)block(g,0,h*y,d*.39,w*.5,.08,.1,0x9c9686,'box',false);break;
   }
  }
  return g;
 }
