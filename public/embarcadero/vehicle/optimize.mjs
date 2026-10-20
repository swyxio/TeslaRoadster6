import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, draco, dedup, prune, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import * as T from 'three';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
await MeshoptSimplifier.ready;
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node optimize.mjs input.glb output.glb');
const doc = await io.read(input);
const root=doc.getRoot(), oldScene=root.getDefaultScene();
const oldNodes=[...root.listNodes()];
const groups={body:doc.createNode('body')};
const wheelName={'TRDEF-WheelFtR':'wheel_fr','TRDEF-WheelFtL':'wheel_fl','TRDEF-WheelBkR':'wheel_rr','TRDEF-WheelBkL':'wheel_rl'};
for(const [old,name] of Object.entries(wheelName)) {
  const node=root.listNodes().find(n=>n.getName()===old); if(!node)throw Error(`Missing ${old}`);
  groups[name]=doc.createNode(name).setTranslation(node.getWorldTranslation());
}
const inputNodes=root.listNodes().filter(n=>n.getMesh());
for(const old of inputNodes){
  let ancestor=old, groupName='body';
  while(ancestor){const name=wheelName[ancestor.getName()]; if(name){groupName=name;break;} ancestor=ancestor.listParents().find(p=>p.propertyType===PropertyType.NODE);}
  const group=groups[groupName], translation=group.getTranslation();
  const transform=new T.Matrix4().makeTranslation(-translation[0],-translation[1],-translation[2]).multiply(new T.Matrix4().fromArray(old.getWorldMatrix()));
  group.addChild(doc.createNode().setMatrix(transform.elements).setMesh(old.getMesh()));
}
const scene=doc.createScene('Roadster');for(const group of Object.values(groups))scene.addChild(group);root.setDefaultScene(scene);oldScene.dispose();for(const node of oldNodes) node.dispose();
const tri=()=>root.listMeshes().reduce((total,mesh)=>total+mesh.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3,0),0);
console.log('input triangles',tri(),'nodes',inputNodes.length);
await doc.transform(prune(),dedup(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.16,error:.003}),join(),prune(),draco({method:'edgebreaker',encodeSpeed:5,decodeSpeed:5}));
console.log('output triangles',tri(), 'meshes',root.listMeshes().length, 'materials',root.listMaterials().length);
for(const group of Object.values(groups))console.log(group.getName(),group.listChildren().length,group.getTranslation());
await io.write(output,doc);
