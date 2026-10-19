import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CUISINE_ICONS, createGoalArt, goalArtCuisine, goalArtKind, goalArtNearby, type CuisineIcon } from '../src/goal-art';
import { initialDelivery, RESTAURANTS } from '../shared/delivery';

test('the active pickup selects its restaurant cuisine and dropoffs do not',()=>{
  const order=initialDelivery({x:0,z:0}).order;
  const pizza=RESTAURANTS.findIndex(place=>place.cuisineIcon==='pizza');
  const burger=RESTAURANTS.findIndex(place=>place.cuisineIcon==='burger');
  assert.ok(pizza>=0&&burger>=0);
  assert.equal(goalArtCuisine({...order,stage:'pickup',restaurant:pizza}),'pizza');
  assert.equal(goalArtCuisine({...order,stage:'pickup',restaurant:burger}),'burger');
  assert.equal(goalArtCuisine({...order,stage:'dropoff',restaurant:pizza}),undefined);
});

test('only a nearby local driver sees the active delivery art',()=>{
  const target={x:10,z:20};
  assert.equal(goalArtNearby(target,{x:160,z:20,inDome:false},false),true);
  assert.equal(goalArtNearby(target,{x:161,z:20,inDome:false},false),false);
  assert.equal(goalArtNearby(target,{x:10,z:20,inDome:true},false),false);
  assert.equal(goalArtNearby(target,{x:10,z:20,inDome:false},true),false);
  assert.equal(goalArtNearby(target,undefined,false),false);
  assert.equal(goalArtKind('pickup',false),'pickup');
  assert.equal(goalArtKind('dropoff',false),'doorstep');
  assert.equal(goalArtKind('dropoff',true),'rooftop');
});

test('order changes reuse one atlas and one marker without redrawing',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  let canvases=0,draws=0;
  const context=new Proxy({}, {get:()=>()=>{draws++;},set:()=>true});
  const canvas={width:0,height:0,getContext:()=>context};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>{canvases++;return canvas;}}});
  try {
    const first=createGoalArt(),second=createGoalArt(),camera=new T.PerspectiveCamera();
    const initialDraws=draws,mesh=first.mesh;
    assert.equal(canvases,1);
    assert.ok(canvas.width<=1024&&canvas.height<=1024,'the atlas fits mobile texture limits');
    assert.equal(first.mesh.material,second.mesh.material);
    first.update('pickup',true,0,camera);
    const pickup=first.mesh.geometry,geometries=[pickup];
    for(const icon of CUISINE_ICONS){
      first.update('pickup',true,0,camera,icon);
      geometries.push(first.mesh.geometry);
      second.update('pickup',true,0,camera,icon);
      assert.equal(first.mesh.geometry,second.mesh.geometry,`${icon} reuses its shared geometry`);
    }
    first.update('pickup',true,0,camera,'unknown' as CuisineIcon);
    assert.equal(first.mesh.geometry,pickup,'unavailable metadata uses the generic bag');
    first.update('doorstep',true,1,camera);
    geometries.push(first.mesh.geometry);
    first.update('rooftop',true,2,camera);
    geometries.push(first.mesh.geometry);
    const centers=geometries.map(geometry=>{
      const uv=geometry.getAttribute('uv');let x=0,y=0;
      for(let i=0;i<uv.count;i++){x+=uv.getX(i);y+=uv.getY(i);}
      return `${(x/uv.count).toFixed(4)},${(y/uv.count).toFixed(4)}`;
    });
    assert.equal(new Set(centers).size,11,'each cuisine and dropoff cue has its own atlas tile');
    assert.equal(first.mesh,mesh,'order changes do not replace the marker');
    assert.equal(first.mesh.visible,true);
    first.update('pickup',false,3,camera);
    assert.equal(first.mesh.visible,false);
    assert.equal(draws,initialDraws,'changing orders must not redraw the atlas');
  } finally {
    if(original)Object.defineProperty(globalThis,'document',original);else Reflect.deleteProperty(globalThis,'document');
  }
});
