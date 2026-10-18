import * as T from 'three';
import type { World } from '../shared/game';
import { VEHICLES } from '../shared/vehicles';

type Label = { sprite:T.Sprite; texture:T.CanvasTexture; canvas:HTMLCanvasElement; name:string };

/** A fleet car shows both ownership and its current occupant. */
export class DriverLabels {
  private labels = new Map<string,Label>();
  constructor(private scene:T.Scene) {}
  update(world:World,meshes:Map<string,T.Group>,menu:boolean,hiddenEntity?:string){
    const names=new Map(world.players.map(player=>[player.id,player.name]));
    const active=new Set<string>();
    for(const entity of world.entities){
      if(entity.kind==='person')continue;
      const driver=entity.driver?names.get(entity.driver):undefined,owner=entity.cab&&entity.owner?names.get(entity.owner):undefined;
      const name=owner?`Owner: ${owner}${driver?`\nDriver: ${driver}`:''}`:driver,mesh=meshes.get(entity.id);
      if(!name||!mesh)continue;
      active.add(entity.id);
      let label=this.labels.get(entity.id);
      if(!label){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
        const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
        const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
        sprite.scale.set(4,.75,1);this.scene.add(sprite);
        label={sprite,texture,canvas,name:''};this.labels.set(entity.id,label);
      }
      if(name!==label.name){
        label.name=name;const ctx=label.canvas.getContext('2d')!;ctx.clearRect(0,0,512,96);
        ctx.fillStyle='#18373ee8';ctx.beginPath();ctx.roundRect(2,8,508,80,18);ctx.fill();
        ctx.fillStyle='#fff5df';ctx.textAlign='center';ctx.textBaseline='middle';
        const lines=name.split('\n');ctx.font=lines.length>1?'bold 28px system-ui':'bold 38px system-ui';
        lines.forEach((line,index)=>ctx.fillText(line,256,lines.length>1?34+index*32:48,475));
        label.texture.needsUpdate=true;
      }
      label.sprite.visible=!menu&&entity.id!==hiddenEntity;
      label.sprite.position.copy(mesh.position);label.sprite.position.y+=VEHICLES[entity.kind].height+1.75;
    }
    for(const [id,label] of this.labels)if(!active.has(id)){
      this.scene.remove(label.sprite);label.texture.dispose();(label.sprite.material as T.SpriteMaterial).dispose();this.labels.delete(id);
    }
  }
}
