import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { dayMinute } from '../shared/day';

// A single sky draw replaces the flat clear color. The distant Bay horizon
// remains its own world-space layer. Sky art never holds up room joining.
export function createBayLighting(scene:T.Scene, renderer:T.WebGLRenderer) {
  const fog = new T.Fog(0xa8cbd0,350,1200);
  scene.fog = fog;
  const hemisphere = new T.HemisphereLight(0xcfe4f4,0x82715d,1.4);
  const sun = new T.DirectionalLight(0xffe6c3,2.2);
  scene.add(hemisphere,sun);

  // Keep the existing compact reflection map: generating a second PMREM while
  // a player is already driving can stall a frame on some GPUs.
  const initialGenerator = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = initialGenerator.fromScene(room,.04);
  room.dispose();
  initialGenerator.dispose();
  scene.environment = environment.texture;

  const fallback = new T.DataTexture(new Uint8Array([255,255,255,255]),1,1,T.RGBAFormat);
  fallback.needsUpdate = true;
  const uniforms = {
    skyMap: {value:fallback as T.Texture},
    hasSky: {value:0},
    daylight: {value:.4},
    twilight: {value:1},
    skyRotation: {value:0},
    sunDirection: {value:new T.Vector3(-1,.12,.5).normalize()},
  };
  const sky = new T.Mesh(new T.SphereGeometry(1500,24,16),new T.ShaderMaterial({
    uniforms,
    side:T.BackSide,
    depthWrite:false,
    depthTest:false,
    fog:false,
    vertexShader:`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader:`
      uniform sampler2D skyMap;
      uniform float hasSky;
      uniform float daylight;
      uniform float twilight;
      uniform float skyRotation;
      uniform vec3 sunDirection;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        float height = clamp(direction.y, 0.0, 1.0);
        vec3 blue = mix(vec3(0.43, 0.66, 0.79), vec3(0.18, 0.39, 0.64), smoothstep(0.0, 0.8, height));
        vec3 night = mix(vec3(0.08, 0.13, 0.20), vec3(0.025, 0.045, 0.09), smoothstep(0.0, 0.8, height));
        vec2 uv = vec2(fract(atan(direction.z, direction.x) / 6.2831853 + 0.5 + skyRotation / 6.2831853),
                       asin(clamp(direction.y,-1.0,1.0)) / 3.14159265 + 0.5);
        vec3 panorama = texture2D(skyMap, uv).rgb;
        // Fade the low-sun panorama at noon; otherwise its baked sunset would
        // contradict the higher simulated sun. The map is fully dimmed at night.
        vec3 day = mix(blue, panorama, hasSky * (0.12 + 0.43 * twilight));
        float horizon = 1.0 - smoothstep(0.0, 0.33, height);
        day = mix(day, vec3(0.85, 0.60, 0.40), twilight * horizon * 0.48);
        float towardSun = max(dot(direction, sunDirection), 0.0);
        day += vec3(0.34, 0.20, 0.09) * pow(towardSun, 24.0) * twilight;
        day += vec3(0.55, 0.45, 0.28) * smoothstep(0.9995, 0.9999, towardSun) * daylight;
        gl_FragColor = vec4(mix(night, day, daylight), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  // The small CC0 panorama provides the visible sky; reflections use the
  // already-initialized environment so it does not trigger another GPU bake.
  const loadSky = () => new T.TextureLoader().load('/embarcadero/environment/qwantani-sunset-background.webp', texture => {
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.RepeatWrapping;
    uniforms.skyMap.value = texture;
    uniforms.hasSky.value = 1;
  },undefined,() => console.warn('Bay sky artwork unavailable; using the procedural sky.'));
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadSky,{timeout:3000});
  else setTimeout(loadSky,0);

  const skyColor = new T.Color(), nightSky = new T.Color(0x334b62);
  const daySky = new T.Color(0x9cbfcf), twilightSky = new T.Color(0xe5ab87);
  const daylightSun = new T.Color(0xffe6c3), twilightSun = new T.Color(0xffb477);
  const nightSun = new T.Color(0x9ebbe0);
  const direction = new T.Vector3();
  return {
    sunDirection: direction,
    update(time:number,camera:T.Camera) {
      const phase=(dayMinute(time)-360)/1440*Math.PI*2;
      const elevation=Math.sin(phase);
      const daylight=Math.max(0,Math.min(1,(elevation+.35)/.5));
      const twilight=Math.max(0,1-Math.abs(elevation)/.38);
      skyColor.copy(nightSky).lerp(daySky,daylight).lerp(twilightSky,twilight*daylight*.3);
      fog.color.copy(skyColor);
      hemisphere.intensity=.8+daylight*.6;
      sun.intensity=.5+daylight*1.7+twilight*daylight*.35;
      sun.color.copy(daylightSun).lerp(twilightSun,twilight);
      sun.color.lerp(nightSun,1-daylight);
      // East at sunrise, west at sunset in the game's X/east convention.
      sun.position.set(160*Math.cos(phase),Math.max(20,160*elevation),-80);
      direction.copy(sun.position).normalize();
      uniforms.sunDirection.value.copy(direction);
      uniforms.daylight.value=daylight;
      uniforms.twilight.value=twilight;
      // Qwantani's sun is at +0.626 radians in the equirectangular source.
      const rotation=.626-Math.atan2(direction.z,direction.x);
      uniforms.skyRotation.value=rotation;
      scene.environmentRotation.y=rotation;
      scene.environmentIntensity=.09+daylight*.71+twilight*daylight*.1;
      sky.position.copy(camera.position);
      return daylight;
    },
  };
}
