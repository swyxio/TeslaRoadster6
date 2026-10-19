import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { STARSHIP_GOAL } from '../shared/starship';
import { buildFremontSpaceport } from '../src/fremont-spaceport';

test('the hull and all dollar scales show only the supplied confirmed total',()=>{
  const previousDocument=globalThis.document,previousFetch=globalThis.fetch;
  const drawnText:string[]=[];
  let networkCalls=0;
  const makeCanvas=()=>{
    const context=new Proxy({
      fillText:(text:string)=>{drawnText.push(text);},
      measureText:()=>({width:100}),
    },{get:(target,key)=>key in target?Reflect.get(target,key):()=>{}});
    return {width:0,height:0,getContext:()=>context};
  };
  Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement:makeCanvas}});
  globalThis.fetch=async()=>{networkCalls++;throw new Error('A scene update must not contact the ledger');};
  try {
    const scene=new T.Scene(),site=buildFremontSpaceport(scene);
    const rocket=scene.getObjectByName('starship-construction')!;
    const outline=rocket.getObjectByName('starship-outline')!;
    const hull=[0,36,72,107].map(bottom=>rocket.getObjectByName(`starship-hull-${bottom}`) as T.Mesh);
    const faces=['front','back','left','right'].map(side=>scene.getObjectByName(`starship-progress-${side}`)!);
    assert.ok(faces.every(Boolean));
    assert.deepEqual(['$0','$250M','$500M','$750M','$1B'].filter(value=>drawnText.includes(value)),['$0','$250M','$500M','$750M','$1B']);
    const finish=hull[0].material as T.MeshStandardMaterial;
    assert.ok(finish.metalness>.8&&finish.roughness<.25,'built hull has a polished metallic finish');

    const check=(total:number|null,filled:number|null,heights:number[])=>{
      site.update(0,null,total,0);
      for(const face of faces){
        const fill=face.getObjectByName('starship-progress-fill')!;
        const marker=face.getObjectByName('starship-progress-marker')!;
        assert.equal(fill.visible,filled!==null&&filled>0);
        assert.equal(marker.visible,filled!==null);
        if(filled!==null){
          assert.equal(fill.scale.y,94*filled);
          assert.equal(marker.position.y,20+94*filled);
        }
      }
      for(let i=0;i<hull.length;i++){
        assert.equal(hull[i].visible,heights[i]>0);
        if(heights[i]>0)assert.equal(hull[i].scale.y,heights[i]);
      }
    };
    check(null,null,[0,0,0,0]);
    assert.ok(drawnText.includes('WAITING'));
    check(0,0,[0,0,0,0]);
    assert.ok(outline.visible);
    check(STARSHIP_GOAL/2,.5,[36,24,0,0]);
    assert.ok(drawnText.includes('$500,000,000'));
    check(STARSHIP_GOAL,1,[36,36,35,13]);
    assert.equal(outline.visible,false);
    assert.ok(drawnText.includes('$1,000,000,000'));
    assert.equal(networkCalls,0,'display-only inputs must not read or write the live ledger');
  } finally {
    if(previousDocument===undefined)Reflect.deleteProperty(globalThis,'document');
    else Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:previousDocument});
    globalThis.fetch=previousFetch;
  }
});
