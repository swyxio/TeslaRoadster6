import * as T from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// This sky is painted once in code; it contains no borrowed imagery. The same
// panorama is prefiltered by Three.js for inexpensive, static car reflections.
function createSky(sun: T.Vector3): T.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The Embarcadero sky requires a 2D canvas');

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#286fb5');
  sky.addColorStop(0.32, '#5796cc');
  // Most of the driving view sees only the narrow band near the horizon.
  sky.addColorStop(0.42, '#80b5d7');
  sky.addColorStop(0.47, '#aecbdb');
  sky.addColorStop(0.50, '#d5dfe0');
  sky.addColorStop(0.53, '#e8d2bd');
  sky.addColorStop(0.57, '#a9bdc0');
  sky.addColorStop(1, '#758f94');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // Equirectangular coordinates line up the warm sky with the real sun light.
  const sunX = (Math.atan2(sun.z, sun.x) / (Math.PI * 2) + 0.5) * width;
  const sunY = (0.5 - Math.asin(sun.y) / Math.PI) * height;
  const glow = (x: number) => {
    const g = ctx.createRadialGradient(x, sunY, 0, x, sunY, width * 0.13);
    g.addColorStop(0, 'rgba(255, 251, 231, 0.96)');
    g.addColorStop(0.02, 'rgba(255, 246, 215, 0.93)');
    g.addColorStop(0.10, 'rgba(255, 227, 181, 0.58)');
    g.addColorStop(0.38, 'rgba(255, 206, 154, 0.23)');
    g.addColorStop(1, 'rgba(255, 196, 132, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - width * 0.16, 0, width * 0.32, height * 0.65);
  };
  glow(sunX - width);
  glow(sunX);
  glow(sunX + width);

  // Deterministic wisps: broad, translucent clusters with smaller warm puffs.
  // Painting at x +/- width keeps the panorama seamless at the wrap point.
  let seed = 18071;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 52; i++) {
    const x = random() * width;
    const y = height * (0.32 + random() * 0.16);
    const span = 22 + random() * 64;
    const puffs = 5 + Math.floor(random() * 6);
    for (let p = 0; p < puffs; p++) {
      const px = x + (p / (puffs - 1) - 0.5) * span;
      const py = y + (random() - 0.5) * 7;
      const radius = 5 + random() * 7;
      const alpha = 0.26 + random() * 0.24;
      for (const offset of [-width, 0, width]) {
        const cloud = ctx.createRadialGradient(px + offset, py, 0, px + offset, py, radius);
        cloud.addColorStop(0, `rgba(255, 246, 229, ${alpha})`);
        cloud.addColorStop(0.5, `rgba(255, 239, 216, ${alpha * 0.5})`);
        cloud.addColorStop(1, 'rgba(255, 239, 216, 0)');
        ctx.fillStyle = cloud;
        ctx.save();
        ctx.translate(px + offset, py);
        ctx.scale(1.9, 0.55);
        ctx.translate(-(px + offset), -py);
        ctx.fillRect(px + offset - radius, py - radius, radius * 2, radius * 2);
        ctx.restore();
      }
    }
  }

  const texture = new T.CanvasTexture(canvas);
  texture.mapping = T.EquirectangularReflectionMapping;
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// A tiny seamless, locally generated noise field breaks up water highlights.
// Mipmaps soften it at distance without any runtime drawing or external asset.
function createWaterNoise(): T.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 53797;
  const grids = [4, 8, 16, 32].map((count) => {
    const values = new Float32Array(count * count);
    for (let i = 0; i < values.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      values[i] = seed / 4294967296;
    }
    return { count, values };
  });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (let octave = 0; octave < grids.length; octave++) {
        const { count, values } = grids[octave];
        const gx = x * count / size;
        const gy = y * count / size;
        const ix = Math.floor(gx);
        const iy = Math.floor(gy);
        const fx = gx - ix;
        const fy = gy - iy;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const at = (px: number, py: number) => values[(py % count) * count + (px % count)];
        const a = T.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx);
        const b = T.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx);
        value += T.MathUtils.lerp(a, b, sy) * [0.5, 0.25, 0.15, 0.10][octave];
      }
      const pixel = (y * size + x) * 4;
      data[pixel] = data[pixel + 1] = data[pixel + 2] = Math.round(value * 255);
      data[pixel + 3] = 255;
    }
  }
  const texture = new T.DataTexture(data, size, size, T.RGBAFormat);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** A local-only lighting rig for the standalone Embarcadero experiment. */
export function createEmbarcaderoLighting(
  scene: T.Scene,
  renderer: T.WebGLRenderer,
): { ready: Promise<void>; update(position: T.Vector3, dt: number): void } {
  // This diagonal is aligned with the waterfront palms: at the starting
  // viewpoint their long frond shadows fall across the road in front of the
  // car. Use the same direction for the sky and water reflection.
  // The brightest pixel in the CC0 panorama is at azimuth +0.626 and
  // elevation +0.110 radians. The same 1.4-radian Y rotation is applied to
  // both the background and reflections, and to the directional sun.
  const skyRotation = 1.4;
  const skyAzimuth = 0.626 - skyRotation;
  const skyElevation = 0.110;
  const sunDirection = new T.Vector3(
    Math.cos(skyAzimuth) * Math.cos(skyElevation),
    Math.sin(skyElevation),
    Math.sin(skyAzimuth) * Math.cos(skyElevation),
  );
  // Keep a painted sky visible while the local HDR panorama is loading.
  const temporarySky = createSky(sunDirection);
  scene.background = temporarySky;
  scene.environment = temporarySky;
  scene.backgroundIntensity = 1;
  scene.environmentIntensity = 0.35;
  scene.fog = new T.Fog(0xd3c1ad, 500, 1800);
  const ready = Promise.all([
    new RGBELoader().loadAsync('/embarcadero/environment/qwantani-sunset-1k.hdr'),
    new T.TextureLoader().loadAsync('/embarcadero/environment/qwantani-sunset-background.webp'),
  ]).then(([sky, background]) => {
    sky.mapping = T.EquirectangularReflectionMapping;
    background.mapping = T.EquirectangularReflectionMapping;
    background.colorSpace = T.SRGBColorSpace;
    scene.backgroundRotation.y = skyRotation;
    scene.environmentRotation.y = skyRotation;
    // The display-referred, lightly blue-graded derivative keeps the sky
    // legible at the horizon; the original HDR still lights reflections.
    scene.background = background;
    scene.environment = sky;
    temporarySky.dispose();
  });

  // Keep enough neutral fill to see shaded surfaces, without washing out the
  // leaf patterns cast by the strong amber sun. No extra rendering pass.
  const fill = new T.HemisphereLight(0xc2d8e4, 0xb5977d, 1.05);
  scene.add(fill);
  const sun = new T.DirectionalLight(0xffb56f, 3.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  // One animated surface, no reflection render pass, no wave geometry or assets.
  // Broad waves remain visible at distance; smaller glints fade to avoid aliasing.
  const waterMaterial = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunDirection: { value: sunDirection },
      uNoise: { value: createWaterNoise() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform sampler2D uNoise;
      varying vec3 vWorld;
      void main() {
        vec2 p = vWorld.xz;
        float distanceToEye = length(cameraPosition.xz - p);
        float detail = 1.0 - smoothstep(110.0, 550.0, distanceToEye);
        float broad = texture2D(uNoise, p * 0.018 + vec2(uTime * 0.004, -uTime * 0.002)).r;
        float fine = texture2D(uNoise, p * 0.057 + vec2(-uTime * 0.009, uTime * 0.006)).r;
        float wave1 = sin(p.x * 0.09 + p.y * 0.24 + broad * 6.0 + uTime * 0.6);
        float wave2 = sin(p.x * 0.22 - p.y * 0.14 + fine * 5.0 - uTime * 0.43);
        vec3 normal = normalize(vec3(wave1 * 0.065 + wave2 * 0.028 * detail,
                                     1.0,
                                     wave1 * 0.052 - wave2 * 0.028 * detail));
        vec3 view = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
        float variation = 0.35 * (0.5 + 0.5 * wave1) + 0.65 * broad;
        vec3 color = mix(vec3(0.025, 0.12, 0.19), vec3(0.075, 0.25, 0.34), variation * 0.5 + fresnel * 0.5);
        float specular = pow(max(dot(normal, normalize(view + uSunDirection)), 0.0), 105.0);
        float sparkle = smoothstep(0.47, 0.72, fine * 0.65 + broad * 0.35);
        color += vec3(1.0, 0.77, 0.48) * specular * (0.24 + sparkle * detail * 0.72);
        // A wide golden reflection toward the sun. Domain-warped noise breaks
        // it into wavelets instead of an unnaturally solid or narrow stripe.
        vec2 waterOffset = p - cameraPosition.xz;
        vec2 towardWater = waterOffset / max(length(waterOffset), 0.001);
        float sunward = pow(max(dot(towardWater, normalize(uSunDirection.xz)), 0.0), 5.0);
        float ripple = smoothstep(0.1, 0.9, wave1 * 0.25 + wave2 * 0.15 + sparkle * 0.6 + 0.25);
        color += vec3(0.68, 0.34, 0.10) * sunward * (0.22 + ripple * 0.55);
        color += vec3(0.08, 0.11, 0.11) * fresnel;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: T.DoubleSide,
  });
  // Extend beneath the opaque shore and beyond the camera's far plane.  The
  // playable waterfront is finite, but its water must not end in a rectangle
  // when a flying player looks across or past the edge of the street slice.
  const water = new T.Mesh(new T.PlaneGeometry(8000, 8000), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.6, -150);
  water.frustumCulled = true;
  scene.add(water);

  // Keep the fixed-size shadow coverage around the car without moving the sky.
  // Snapping the light to shadow texels avoids continuous shadow-map swimming.
  const shadowStep = 150 / 1024;
  const focus = new T.Vector3();
  const update = (position: T.Vector3, dt: number) => {
    focus.set(
      Math.round(position.x / shadowStep) * shadowStep,
      position.y,
      Math.round(position.z / shadowStep) * shadowStep,
    );
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunDirection, 260);
    waterMaterial.uniforms.uTime.value = (waterMaterial.uniforms.uTime.value + Math.max(0, Math.min(dt, 0.1))) % 10000;
  };
  update(new T.Vector3(0, 0, 20), 0);
  return { ready, update };
}
