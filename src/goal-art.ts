import * as T from 'three';

export type GoalArtKind = 'pickup' | 'doorstep' | 'rooftop';
export const CUISINE_ICONS=['pizza','burger','sandwich','noodles','taco','bakery','bowl','plate'] as const;
export type CuisineIcon = typeof CUISINE_ICONS[number];

// Keep the beacon visible at distance; detailed art is only needed nearby.
const ART_DISTANCE = 150;
export function goalArtKind(stage:'pickup'|'dropoff',rooftop:boolean):GoalArtKind {
  return stage==='pickup'?'pickup':rooftop?'rooftop':'doorstep';
}
export function goalArtNearby(target:{x:number;z:number},driver:{x:number;z:number;inDome:boolean}|undefined,menu:boolean):boolean {
  if(menu||!driver||driver.inDome)return false;
  const dx=target.x-driver.x,dz=target.z-driver.z;
  return dx*dx+dz*dz<=ART_DISTANCE*ART_DISTANCE;
}

type SharedArt = {
  material:T.MeshBasicMaterial;
  pickup:Record<CuisineIcon|'generic',T.PlaneGeometry>;
  doorstep:T.PlaneGeometry;
  rooftop:T.PlaneGeometry;
};
let sharedArt:SharedArt|undefined;

/** One original vector atlas and shared UV planes, never per restaurant. */
function artAssets():SharedArt {
  if(sharedArt)return sharedArt;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=768;
  const c=canvas.getContext('2d')!;
  c.lineJoin='round';c.lineCap='round';
  const shadow=()=>{c.fillStyle='#17383d55';c.beginPath();c.ellipse(128,226,81,12,0,0,Math.PI*2);c.fill();};
  const stroke=(color:string,width:number)=>{c.strokeStyle=color;c.lineWidth=width;c.stroke();};
  const dot=(x:number,y:number,r:number,color:string)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();};
  const tile=(index:number,draw:()=>void)=>{c.save();c.translate(index%4*256,Math.floor(index/4)*256);draw();c.restore();};

  const foodIcon=(icon:CuisineIcon|'generic')=>{
    if(icon==='generic'){
      c.beginPath();c.moveTo(112,125);c.lineTo(112,178);c.moveTo(100,125);c.lineTo(100,140);c.quadraticCurveTo(100,150,112,150);c.quadraticCurveTo(124,150,124,140);c.lineTo(124,125);c.moveTo(112,125);c.lineTo(112,145);stroke('#fff0d2',5);
      c.beginPath();c.ellipse(145,137,9,14,0,0,Math.PI*2);c.fillStyle='#fff0d2';c.fill();c.beginPath();c.moveTo(145,150);c.lineTo(145,178);stroke('#fff0d2',5);
    } else if(icon==='pizza'){
      c.beginPath();c.moveTo(94,128);c.quadraticCurveTo(128,115,162,128);c.lineTo(128,181);c.closePath();c.fillStyle='#ffd789';c.fill();stroke('#fff0d2',4);
      c.beginPath();c.moveTo(94,128);c.quadraticCurveTo(128,115,162,128);stroke('#db8c55',8);
      dot(118,139,4,'#cf6253');dot(141,140,4,'#cf6253');dot(128,158,4,'#cf6253');
    } else if(icon==='burger'){
      c.beginPath();c.moveTo(94,145);c.quadraticCurveTo(96,120,128,119);c.quadraticCurveTo(160,120,162,145);c.closePath();c.fillStyle='#f9c77d';c.fill();
      dot(115,131,2,'#fff0d2');dot(130,127,2,'#fff0d2');dot(143,132,2,'#fff0d2');
      c.beginPath();c.moveTo(94,153);c.lineTo(162,153);stroke('#8cc898',6);
      c.beginPath();c.moveTo(96,163);c.lineTo(160,163);stroke('#c86e54',10);
      c.beginPath();c.moveTo(97,171);c.quadraticCurveTo(128,183,159,171);stroke('#f9c77d',9);
    } else if(icon==='sandwich'){
      c.beginPath();c.moveTo(95,174);c.lineTo(128,121);c.lineTo(161,174);c.closePath();c.fillStyle='#f9c77d';c.fill();stroke('#fff0d2',4);
      c.beginPath();c.moveTo(106,159);c.lineTo(149,159);stroke('#79b987',6);
      c.beginPath();c.moveTo(102,168);c.lineTo(154,168);stroke('#d77c5e',5);
      c.beginPath();c.moveTo(128,119);c.lineTo(134,113);stroke('#fff0d2',3);
    } else if(icon==='noodles'){
      c.beginPath();c.moveTo(96,151);c.quadraticCurveTo(102,178,128,180);c.quadraticCurveTo(154,178,160,151);c.closePath();c.fillStyle='#f8cf85';c.fill();stroke('#fff0d2',4);
      c.beginPath();c.moveTo(104,148);c.bezierCurveTo(100,141,115,139,110,132);c.moveTo(124,147);c.bezierCurveTo(118,138,134,136,128,126);c.moveTo(144,148);c.bezierCurveTo(138,141,151,137,147,130);stroke('#f5e3b6',4);
      c.beginPath();c.moveTo(151,120);c.lineTo(129,148);c.moveTo(159,123);c.lineTo(137,151);stroke('#ed9973',3);
    } else if(icon==='taco'){
      c.beginPath();c.moveTo(95,163);c.quadraticCurveTo(128,107,161,163);c.quadraticCurveTo(128,178,95,163);c.closePath();c.fillStyle='#f8c676';c.fill();stroke('#ffe2a6',4);
      c.beginPath();c.moveTo(104,154);c.quadraticCurveTo(113,145,119,151);c.quadraticCurveTo(127,140,135,150);c.quadraticCurveTo(145,144,153,154);stroke('#83bd82',6);
      dot(117,153,3,'#ce705b');dot(140,153,3,'#ce705b');
    } else if(icon==='bakery'){
      c.beginPath();c.moveTo(96,160);c.bezierCurveTo(101,128,115,121,128,139);c.bezierCurveTo(141,121,155,128,160,160);c.quadraticCurveTo(149,180,128,172);c.quadraticCurveTo(107,180,96,160);c.closePath();c.fillStyle='#f8c676';c.fill();stroke('#ffe4aa',4);
      c.beginPath();c.moveTo(110,142);c.quadraticCurveTo(114,158,116,168);c.moveTo(146,142);c.quadraticCurveTo(142,158,140,168);stroke('#d99358',5);
    } else if(icon==='bowl'){
      c.beginPath();c.moveTo(95,151);c.quadraticCurveTo(102,178,128,180);c.quadraticCurveTo(154,178,161,151);c.closePath();c.fillStyle='#d4e6cf';c.fill();stroke('#fff0d2',4);
      c.beginPath();c.ellipse(128,151,32,10,0,0,Math.PI*2);c.fillStyle='#79b987';c.fill();
      dot(113,148,4,'#f5c876');dot(128,154,4,'#ef8970');dot(142,148,4,'#f5c876');
    } else {
      c.beginPath();c.arc(128,151,22,0,Math.PI*2);c.fillStyle='#fff0d2';c.fill();
      c.beginPath();c.arc(128,151,14,0,Math.PI*2);stroke('#e6b777',3);
      c.beginPath();c.moveTo(97,130);c.lineTo(97,173);c.moveTo(90,130);c.lineTo(90,141);c.quadraticCurveTo(90,148,97,148);c.quadraticCurveTo(104,148,104,141);c.lineTo(104,130);c.moveTo(159,130);c.lineTo(159,173);stroke('#fff0d2',4);
    }
  };
  const foods:readonly (CuisineIcon|'generic')[]=['generic',...CUISINE_ICONS];
  foods.forEach((icon,index)=>tile(index,()=>{
    // A warm paper bag holds a clearly visible, original food pictogram.
    shadow();
    c.beginPath();c.moveTo(90,83);c.lineTo(90,65);c.bezierCurveTo(90,25,166,25,166,65);c.lineTo(166,83);stroke('#795238',12);
    c.beginPath();c.moveTo(56,77);c.lineTo(200,77);c.lineTo(211,207);c.quadraticCurveTo(211,214,203,214);c.lineTo(53,214);c.quadraticCurveTo(45,214,45,207);c.closePath();c.fillStyle='#f8cd82';c.fill();stroke('#795238',6);
    c.beginPath();c.moveTo(57,91);c.lineTo(199,91);stroke('#d49754',5);
    c.beginPath();c.arc(128,151,43,0,Math.PI*2);c.fillStyle='#24484a';c.fill();
    foodIcon(icon);
  }));

  // A doorstep and parcel, distinct from the rooftop landing pad.
  tile(9,()=>{shadow();
  c.beginPath();c.moveTo(44,114);c.lineTo(128,48);c.lineTo(212,114);c.lineTo(197,114);c.lineTo(197,207);c.lineTo(59,207);c.lineTo(59,114);c.closePath();c.fillStyle='#e8f0d9';c.fill();stroke('#315c58',7);
  c.beginPath();c.moveTo(44,114);c.lineTo(128,48);c.lineTo(212,114);stroke('#d97152',12);
  c.fillStyle='#315c58';c.fillRect(100,127,56,80);c.fillStyle='#f8cf85';c.beginPath();c.arc(145,168,4,0,Math.PI*2);c.fill();
  c.fillStyle='#c4d3ba';c.fillRect(51,207,154,8);c.fillStyle='#f7bc70';c.fillRect(164,178,28,28);c.beginPath();c.moveTo(178,179);c.lineTo(178,195);stroke('#95653f',3);});

  // A roof outline and landing-pad H signal that this stop is above street level.
  tile(10,()=>{shadow();
  c.beginPath();c.moveTo(56,137);c.lineTo(200,137);c.lineTo(200,210);c.lineTo(56,210);c.closePath();c.fillStyle='#769b96';c.fill();stroke('#315c58',7);
  c.fillStyle='#d6e5d2';c.fillRect(72,158,19,27);c.fillRect(105,158,19,27);c.fillRect(138,158,19,27);c.fillRect(171,158,13,27);
  c.beginPath();c.ellipse(128,116,86,28,0,0,Math.PI*2);c.fillStyle='#315c58';c.fill();stroke('#d6e5d2',6);
  c.beginPath();c.moveTo(113,101);c.lineTo(113,131);c.moveTo(143,101);c.lineTo(143,131);c.moveTo(113,116);c.lineTo(143,116);stroke('#ffe3a3',7);
  c.beginPath();c.moveTo(128,29);c.lineTo(128,69);c.moveTo(110,53);c.lineTo(128,70);c.lineTo(146,53);stroke('#ffce78',9);});

  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  texture.minFilter=T.LinearFilter;texture.generateMipmaps=false;
  const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:T.DoubleSide});
  const geometry=(index:number)=>{
    const plane=new T.PlaneGeometry(1,1),uv=plane.getAttribute('uv');
    const column=index%4,row=Math.floor(index/4);
    for(let i=0;i<uv.count;i++)uv.setXY(i,(column+uv.getX(i))/4,(2-row+uv.getY(i))/3);
    return plane;
  };
  const pickup=Object.fromEntries(foods.map((icon,index)=>[icon,geometry(index)])) as SharedArt['pickup'];
  sharedArt={material,pickup,doorstep:geometry(9),rooftop:geometry(10)};
  return sharedArt;
}

/** One local marker follows the active order and faces the player's camera. */
export function createGoalArt() {
  const assets=artAssets(),mesh=new T.Mesh(assets.pickup.generic,assets.material);
  mesh.scale.set(6,6,1);mesh.visible=false;
  return {
    mesh,
    update(kind:GoalArtKind,visible:boolean,time:number,camera:T.Camera,cuisineIcon?:CuisineIcon|null) {
      mesh.visible=visible;
      if(!visible)return;
      mesh.geometry=kind==='pickup'?assets.pickup[cuisineIcon??'generic']??assets.pickup.generic:assets[kind];
      mesh.position.y=6.4+Math.sin(time*2)*.25;
      mesh.quaternion.copy(camera.quaternion);
    },
  };
}
