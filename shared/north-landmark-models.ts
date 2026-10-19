import type { NorthLandmark } from './north-landmarks';
import type { LandmarkParts } from './landmark-model-types';

/** One authored description for render meshes and structural volumes. Thin facade
 * details and the open Greek amphitheater rings are deliberately decorative. */
export function buildNorthLandmarkModel(p:Pick<NorthLandmark,'w'|'d'|'h'|'shape'>,parts:LandmarkParts & {arc:LandmarkParts['box']}):void {
 const {w,d,h}=p, {box,cyl,roof,dome,arc}=parts;
 const cream=0xe1d9c5,stone=0xc7bda8,red=0xab6255,dark=0x405c60,glass=0x86aeb0,green=0x598471,gold=0xd9b571;
    const body=(height:number,c=cream)=>box(0,height/2,0,w*.86,height,d*.8,c);
    const columns=(count:number,height:number,c=cream)=>{for(let i=0;i<count;i++)box((i-(count-1)/2)*w*.13,height/2,d*.42,w*.055,height,d*.07,c);};
    const windows=(height:number)=>{for(const side of [-1,1])for(const xx of [-.27,0,.27])box(w*xx,height*.6,side*d*.405,w*.10,height*.28,.06,dark,false);};
    switch(p.shape){
      case 'fort':
        body(h*.7,red);for(let i=0;i<5;i++)box((i-2)*w*.17,h*.8,d*.36,w*.10,h*.2,d*.08,stone);windows(h*.65);break;
      case 'rotunda':
        cyl(0,h*.11,0,w*.87,h*.22,d*.87,stone);for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(Math.cos(a)*w*.3,h*.38,Math.sin(a)*d*.3,w*.06,h*.56,d*.06,cream);}cyl(0,h*.68,0,w*.8,h*.08,d*.8,stone);dome(0,h*.72,0,w*.7,h*.28,d*.7,cream);break;
      case 'organ':
        box(0,1,0,w*.85,2,d*.8,stone);for(let i=0;i<9;i++){const a=i*Math.PI*2/9,ph=h*(.36+(i%3)*.2);cyl(Math.cos(a)*w*.25,2+ph/2,Math.sin(a)*d*.24,w*.09,ph,d*.09,cream);}break;
      case 'crooked':
        box(0,1,0,w*.85,2,d*.82,green);for(let i=0;i<4;i++){box((i%2?-.12:.12)*w,2.2+i*.9,(i-1.5)*d*.18,w*.6,.4,d*.09,0x7b7470);box((i%2?-.32:.32)*w,2.3+i*.9,(i-1.5)*d*.18,w*.08,.5,d*.16,red);}break;
      case 'plaza':
        body(h*.64,red);windows(h*.6);box(0,h*.73,0,w*.34,h*.18,d*.34,stone);roof(0,h*.9,0,w*.48,h*.2,d*.48,red);break;
      case 'pier':
        body(h*.63,0xcfae7f);windows(h*.6);roof(0,h*.82,0,w*.92,h*.36,d*.88,red);box(0,h*.55,d*.42,w*.6,h*.13,.2,dark);break;
      case 'maritime':
        body(h*.52,cream);box(0,h*.62,0,w*.72,h*.2,d*.7,cream);box(0,h*.78,0,w*.45,h*.14,d*.5,glass);cyl(-w*.25,h*.89,-d*.12,w*.08,h*.2,d*.08,red);windows(h*.5);break;
      case 'church':
      case 'cathedral':
        body(h*.45,stone);roof(0,h*.53,0,w*.85,h*.18,d*.8,red);
        for(const side of [-1,1]){box(side*w*.31,h*.48,d*.24,w*.21,h*.8,d*.25,cream);roof(side*w*.31,h*.91,d*.24,w*.27,h*.18,d*.3,green);box(side*w*.31,h*.55,d*.38,w*.09,h*.25,.05,dark);}break;
      case 'gate':
        for(const side of [-1,1]){box(side*w*.34,h*.42,0,w*.14,h*.84,d*.25,cream);roof(side*w*.34,h*.9,0,w*.25,h*.2,d*.38,green);}box(0,h*.7,0,w*.72,h*.12,d*.2,red);roof(0,h*.84,0,w*.95,h*.15,d*.5,green);break;
      case 'pagoda':
      case 'tea':
        cyl(0,h*.42,0,w*.18,h*.84,d*.18,cream);for(let i=0;i<4;i++){const yy=h*(.23+i*.21),scale=1-i*.13;roof(0,yy,0,w*.93*scale,h*.13,d*.9*scale,p.shape==='tea'?red:cream);cyl(0,yy-.02,0,w*.65*scale,h*.07,d*.65*scale,stone);}break;
      case 'houses':
        for(let i=0;i<4;i++){const xx=(i-1.5)*w*.21,hh=h*(.6+(i%2)*.09),ww=w*.19;box(xx,hh/2,0,ww,hh,d*.7,[0xd19c92,0xb1c4bd,0xe0c89d,0xc3a7b1][i]);roof(xx,hh+(h-hh)/2,0,ww*1.4,h-hh,d*.88,red);box(xx,hh*.6,d*.36,ww*.45,hh*.2,.05,dark);}break;
      case 'civic':
        body(h*.48,cream);columns(5,h*.42,stone);cyl(0,h*.56,0,w*.43,h*.16,d*.43,stone);dome(0,h*.64,0,w*.42,h*.28,d*.42,cream);cyl(0,h*.95,0,w*.05,h*.1,d*.05,gold);break;
      case 'museum':
        body(h*.7,stone);box(0,h*.8,0,w*.9,h*.2,d*.84,cream);windows(h*.66);break;
      case 'opera':
      case 'library':
        body(h*.72,cream);columns(5,h*.65,stone);roof(0,h*.86,0,w*.95,h*.27,d*.94,stone);break;
      case 'theatre':
        body(h*.66,stone);windows(h*.58);box(0,h*.56,d*.44,w*.68,h*.18,d*.12,gold);box(0,h*.77,0,w*.24,h*.46,d*.2,red);box(0,h*.84,d*.12,w*.12,h*.3,.05,gold);break;
      case 'academy':
        body(h*.56,glass);for(const xx of [-.27,0,.27])dome(xx*w,h*.56,0,w*.36,h*.4,d*.8,green);break;
      case 'deyoung':
        body(h*.42,red);windows(h*.4);box(w*.22,h*.62,-d*.1,w*.34,h*.76,d*.36,red);box(w*.22,h*.85,-d*.1,w*.36,h*.06,d*.38,stone);break;
      case 'greenhouse':
        body(h*.43,glass);for(const xx of [-.28,0,.28])dome(xx*w,h*.43,0,w*.38,h*.5,d*.78,0xc7dfd8);for(const side of [-1,1])box(side*w*.27,h*.28,d*.41,.2,h*.5,.15,cream);break;
      case 'radio':
        for(const side of [-1,1]){box(side*w*.25,h*.45,0,w*.09,h*.9,d*.12,red);box(side*w*.25,h*.93,0,w*.12,h*.14,d*.17,cream);}for(const yy of [.25,.5,.75])box(0,h*yy,0,w*.58,h*.035,d*.12,cream);break;
      case 'cliff':
        body(h*.64,cream);windows(h*.55);roof(0,h*.82,0,w*.94,h*.36,d*.9,red);break;
      case 'baths':
        box(0,.5,0,w*.84,1,d*.8,stone);box(0,1.02,0,w*.66,.07,d*.62,glass);for(const side of [-1,1])for(const xx of [-.3,0,.3])cyl(xx*w,h*.42,side*d*.35,w*.06,h*.84,d*.06,cream);break;
      case 'stadium':
        cyl(0,h*.36,0,w*.88,h*.72,d*.88,stone);cyl(0,h*.73,0,w*.65,h*.08,d*.65,green);for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(Math.cos(a)*w*.39,h*.66,Math.sin(a)*d*.39,w*.06,h*.68,d*.06,cream);}break;
      case 'modern':
        body(h*.62,cream);box(0,h*.74,0,w*.7,h*.24,d*.7,cream);for(const y of [.29,.43,.57])box(0,h*y,d*.405,w*.8,h*.035,.06,stone);box(0,h*.91,0,w*.56,h*.18,d*.56,glass);break;
      case 'mission':
        body(h*.65,cream);roof(0,h*.8,0,w*.9,h*.3,d*.85,red);for(const side of [-1,1]){box(side*w*.3,h*.56,d*.25,w*.15,h*.85,d*.2,cream);roof(side*w*.3,h*.94,d*.25,w*.21,h*.12,d*.25,red);}box(0,h*.72,d*.43,w*.04,h*.2,.06,stone);box(0,h*.74,d*.44,w*.18,h*.035,.06,stone);break;
      case 'lighthouse':
        cyl(0,h*.4,0,w*.4,h*.8,d*.4,cream);cyl(0,h*.82,0,w*.46,h*.15,d*.46,dark);roof(0,h*.95,0,w*.56,h*.1,d*.56,red);break;
      case 'battery':
        body(h*.5,stone);box(0,h*.58,0,w*.78,h*.16,d*.72,green);for(const side of [-1,1])box(side*w*.28,h*.72,0,w*.16,h*.4,d*.38,stone);break;
      case 'barracks':
        body(h*.62,cream);windows(h*.55);roof(0,h*.81,0,w*.96,h*.38,d*.9,red);break;
      case 'missile':
        body(h*.38,green);cyl(0,h*.53,0,w*.13,h*.7,d*.13,cream);roof(0,h*.91,0,w*.18,h*.18,d*.18,red);break;
      case 'crystal':
        cyl(0,h*.13,0,w*.8,h*.26,d*.8,stone);dome(0,h*.26,0,w*.8,h*.7,d*.8,glass);for(const side of [-1,1])box(side*w*.22,h*.48,d*.2,.22,h*.7,.22,cream);break;
      case 'castle':
        body(h*.52,0xd7b5cc);for(const side of [-1,1]){cyl(side*w*.3,h*.4,0,w*.25,h*.8,d*.25,cream);roof(side*w*.3,h*.9,0,w*.32,h*.2,d*.32,red);}break;
      case 'temple':
        body(h*.46,cream);box(0,h*.58,0,w*.64,h*.24,d*.56,cream);for(const xx of [-.25,0,.25]){box(xx*w,h*.76,0,w*.07,h*.28,d*.07,cream);roof(xx*w,h*.94,0,w*.12,h*.12,d*.12,gold);}break;
      case 'greek':
        box(0,h*.08,0,w*.86,h*.16,d*.8,stone);for(let i=0;i<4;i++)arc(0,h*(.2+i*.14),0,w*(.55+i*.1),1,d*(.55+i*.1),cream);box(0,h*.26,d*.24,w*.65,h*.12,d*.16,cream);break;
    }
}
