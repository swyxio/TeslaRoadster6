import * as T from 'three';
import { BILLBOARDS, BILLBOARD_DESIGNS, BILLBOARD_HEIGHT, BILLBOARD_WIDTH } from '../shared/billboards';
import { terrainHeight } from '../shared/map';

// A single original atlas keeps the repeated signs cheap and has no remote assets.
function atlas():T.CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d')!,width=512,height=170;
  BILLBOARD_DESIGNS.forEach((design,i)=>{
    const x=i%2*width,y=Math.floor(i/2)*height;
    ctx.fillStyle=design.background;ctx.fillRect(x,y,width,height);
    ctx.strokeStyle=design.accent;ctx.lineWidth=4;ctx.strokeRect(x+5,y+5,width-10,height-10);
    ctx.fillStyle=design.accent;ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.font='bold 40px system-ui';ctx.fillText(design.symbol,x+48,y+78,64);
    ctx.textAlign='left';ctx.font='900 24px system-ui';ctx.fillText(design.company,x+90,y+53,width-112);
    ctx.fillStyle='#fffaf0';ctx.font='bold 25px system-ui';ctx.fillText(design.line,x+90,y+98,width-112);
    ctx.fillStyle=design.accent;ctx.font='700 15px system-ui';ctx.fillText('A COMPLETELY FICTIONAL COMPANY',x+90,y+139,width-112);
  });
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

/** Roadside posts are decorative, like route signs; no client-only obstacle is added. */
export function buildBillboards(scene:T.Scene):void {
  const texture=atlas(),faceMaterial=new T.MeshBasicMaterial({map:texture});
  const supportMaterial=new T.MeshStandardMaterial({color:0x59625e,roughness:.9});
  const frameMaterial=new T.MeshStandardMaterial({color:0x303d3c,roughness:.9});
  const postGeometry=new T.BoxGeometry(.35,1,.35);
  const frameGeometry=new T.BoxGeometry(BILLBOARD_WIDTH+.35,BILLBOARD_HEIGHT+.35,.28);
  // UVs select one of 12 tiles in the shared 1024-square atlas.
  const geometries=BILLBOARD_DESIGNS.map((_,i)=>{
    const geometry=new T.PlaneGeometry(BILLBOARD_WIDTH,BILLBOARD_HEIGHT),uv=geometry.getAttribute('uv');
    const left=(i%2)*.5,top=Math.floor(i/2)*170/1024;
    for(let n=0;n<uv.count;n++)uv.setXY(n,left+uv.getX(n)*.5,1-top-(1-uv.getY(n))*170/1024);
    uv.needsUpdate=true;return geometry;
  });
  for(const board of BILLBOARDS){
    const group=new T.Group();group.position.set(board.x,0,board.z);group.rotation.y=board.yaw;
    const cos=Math.cos(board.yaw),sin=Math.sin(board.yaw),posts=[-5.5,5.5];
    const heights=posts.map(offset=>terrainHeight(board.x+cos*offset,board.z-sin*offset)!);
    // Keep the panel level and plant each support into the actual local terrain.
    const boardBase=Math.max(...heights),centerY=boardBase+8;
    for(let i=0;i<posts.length;i++){
      const post=new T.Mesh(postGeometry,supportMaterial),top=centerY-BILLBOARD_HEIGHT/2-.17,ground=heights[i];
      post.scale.y=top-ground;post.position.set(posts[i],(top+ground)/2,0);group.add(post);
    }
    const frame=new T.Mesh(frameGeometry,frameMaterial);frame.position.y=centerY;group.add(frame);
    for(const side of [-1,1]){
      const face=new T.Mesh(geometries[board.design],faceMaterial);
      face.position.set(0,centerY,side*.15);if(side<0)face.rotation.y=Math.PI;group.add(face);
    }
    scene.add(group);
  }
}
