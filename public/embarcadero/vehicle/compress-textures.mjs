import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, textureCompress } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const [input,output]=process.argv.slice(2); if(!input||!output)throw new Error('Usage: node compress-textures.mjs input.glb output.glb');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
 'draco3d.decoder':await draco3d.createDecoderModule(), 'draco3d.encoder':await draco3d.createEncoderModule()
});
const doc=await io.read(input);
// The demo replaces this source paint with a new MeshPhysicalMaterial, so its 2.55 MiB normal map is never sampled.
const paint=doc.getRoot().listMaterials().find(m=>m.getName()==='car_main_paint');
if(!paint)throw new Error('car_main_paint material not found');
paint.setNormalTexture(null);
await doc.transform(
 prune(),
 textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],lossless:true,slots:/normalTexture|metallicRoughnessTexture/}),
 textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512],quality:85,slots:/baseColorTexture/}),
);
await io.write(output,doc);
