import * as T from 'three';

// Texture coordinates follow game-space metres rather than a box's 0–1 UVs.
// Long road segments and differently-sized buildings therefore keep the same
// apparent texture scale. Geometry and collision footprints stay unchanged.
function projectedMaterial(map:T.Texture,color:number,projection:'road'|'facade',strength:number){
  const result=new T.MeshStandardMaterial({map,color,roughness:projection==='road'?.91:.87,metalness:.02});
  result.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      #ifdef USE_MAP
        vec4 streetWorld = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          streetWorld = instanceMatrix * streetWorld;
        #endif
        streetWorld = modelMatrix * streetWorld;
        ${projection==='road'
          ? 'vMapUv = streetWorld.xz / 7.0;'
          : 'vMapUv = abs(normal.y) > 0.5 ? streetWorld.xz / 18.0 : vec2(abs(normal.x) > 0.5 ? streetWorld.z : streetWorld.x, streetWorld.y) / vec2(18.0, 11.0);'}
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 streetTexel = texture2D(map, vMapUv);
      diffuseColor *= mix(vec4(1.0), streetTexel, ${strength.toFixed(2)});
    #endif`);
  };
  result.customProgramCacheKey=()=>`tesland-street-${projection}-${strength}`;
  return result;
}

function fallbackTexture(kind:'road'|'facade'){
  const canvas=document.createElement('canvas');canvas.width=kind==='road'?2:360;canvas.height=kind==='road'?2:220;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=kind==='road'?'#fff':'#ddd3c2';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(kind==='facade'){
    // The in-memory fallback remains legible when an image is delayed or
    // unavailable; it never holds up world initialization.
    for(let row=0;row<2;row++)for(let column=0;column<5;column++){
      const x=column*72+16,y=row*105+14;
      ctx.fillStyle='#e8ddca';ctx.fillRect(x-4,y-4,44,80);
      ctx.fillStyle='#445b60';ctx.fillRect(x,y,36,72);
      ctx.fillStyle='#a8aea5';ctx.fillRect(x+17,y,2,72);
    }
  }
  const texture:T.Texture=new T.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

function loadTexture(kind:'road'|'facade',url:string){
  const texture=fallbackTexture(kind);
  new T.TextureLoader().load(url,loaded=>{
    // Keep the same texture object/material so the scene can render while
    // the image is loading and late arrival requires no shader recompilation.
    texture.image=loaded.image;texture.needsUpdate=true;loaded.dispose();
  },undefined,()=>console.warn(`Street texture unavailable: ${url}; using fallback.`));
  return texture;
}

/** Shared, asynchronously populated materials. A missing image leaves the
 * in-memory fallback in place and does not prevent the game from starting. */
export function createStreetMaterials(){
  const road=loadTexture('road','/embarcadero/textures/asphalt.webp');
  const facade=loadTexture('facade','/embarcadero/textures/facade.webp');
  const victorian=loadTexture('facade','/visual-lab/victorian-facade.webp');
  return {
    cityRoad:projectedMaterial(road,0x68706b,'road',.52),
    highway:projectedMaterial(road,0x59625f,'road',.52),
    facade:projectedMaterial(facade,0xffffff,'facade',.88),
    victorian:projectedMaterial(victorian,0xffffff,'facade',.88),
  };
}
