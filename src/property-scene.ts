import * as T from 'three';
import { BUILDINGS } from '../shared/map';
import { PROPERTY_HOME_SITE, type PropertyView } from '../shared/property';

/** Decorative marker for the existing house; ownership and collision stay server-owned. */
export function createPropertyScene(){
  const group=new T.Group();group.visible=false;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const material=new T.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false});
  const sign=new T.Sprite(material);
  const home=BUILDINGS.find(building=>building.x===PROPERTY_HOME_SITE.x&&building.z===PROPERTY_HOME_SITE.z&&building.style==='house');
  if(!home)throw new Error('The property home site is missing from the shared map');
  sign.position.set(home.x,home.h*.65,home.z);sign.scale.set(16,3,1);group.add(sign);
  let shownName:string|null=null;
  return {
    group,
    update(property:PropertyView|null){
      group.visible=property!==null;
      if(!property||property.ownerName===shownName)return;
      shownName=property.ownerName;
      const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='rgba(18,36,41,.9)';ctx.beginPath();ctx.roundRect(0,0,512,96,16);ctx.fill();
      ctx.fillStyle='#f8eed9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 29px system-ui';
      ctx.fillText(`${property.ownerName} · HOME`,256,48,470);texture.needsUpdate=true;
    },
    dispose(){texture.dispose();material.dispose();},
  };
}
