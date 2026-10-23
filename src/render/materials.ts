import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export type Surface = "agedwood" | "wall" | "ground" | "brick" | "linen" | "earthenware" | "timber" | "bamboo" | "iron" | "rooftile";
export type MaterialSet = Record<Surface, THREE.MeshStandardMaterial>;

/** Photographed, locally shipped maps. Only base colour is decoded as sRGB. */
export async function loadWorkshopMaterials(
  renderer: THREE.WebGLRenderer,
): Promise<MaterialSet> {
  const loader = new THREE.TextureLoader();
  const surfaces = ["agedwood", "wall", "ground", "brick", "linen", "earthenware", "timber", "bamboo", "iron", "rooftile"] as const;
  const result = {} as MaterialSet;
  await Promise.all(
    surfaces.map(async (name) => {
      const entries = await Promise.all(
        ["diff", "rough", "nor_gl", "ao", "disp"].map(async (channel) => {
          const texture = await loader.loadAsync(
            ["linen", "earthenware", "timber", "bamboo", "iron", "rooftile"].includes(name) ? `/assets/craft-surfaces/${name}_${channel}.jpg` : `/assets/textures/realism/${name}_${channel}.jpg`,
          );
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.anisotropy = Math.min(
            16,
            renderer.capabilities.getMaxAnisotropy(),
          );
          if (channel === "diff") texture.colorSpace = THREE.SRGBColorSpace;
          return [channel, texture] as const;
        }),
      );
      const maps = Object.fromEntries(entries);
      const mat = new THREE.MeshStandardMaterial({
        name: `photographed_${name}`,
        map: maps.diff,
        roughnessMap: maps.rough,
        normalMap: maps.nor_gl,
        aoMap: maps.ao,
        aoMapIntensity: 0.7,
        roughness: name === "agedwood" ? 0.87 : 1,
        metalness: name === "iron" ? 1 : 0,
      });
      mat.normalScale.setScalar(
        name === "wall" ? 0.72 : name === "ground" ? 1.1 : 0.8,
      );
      mat.userData.heightMap = maps.disp;
      result[name] = mat;
    }),
  );
  return result;
}

/** A real unclipped daylight panorama supplies sky and specular illumination. */
export async function loadCourtyardSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  const sky = await new RGBELoader().loadAsync(
    "/assets/environment/courtyard-sky-2k.hdr",
  );
  sky.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromEquirectangular(sky);
  scene.environment = environment.texture;
  scene.background = sky;
  scene.backgroundBlurriness = 0.02;
  scene.backgroundIntensity = 0.75;
  scene.environmentIntensity = 0.75;
  // Align the shadow light to the photographed sun, rather than inventing a second sun.
  const data = sky.image.data as Uint16Array;
  const width = sky.image.width,
    height = sky.image.height;
  let brightest = -1,
    sunPixel = 0;
  for (let i = 0; i < (width * height) / 2; i++) {
    const energy =
      THREE.DataUtils.fromHalfFloat(data[i * 4]) +
      THREE.DataUtils.fromHalfFloat(data[i * 4 + 1]) +
      THREE.DataUtils.fromHalfFloat(data[i * 4 + 2]);
    if (energy > brightest) {
      brightest = energy;
      sunPixel = i;
    }
  }
  const longitude = (((sunPixel % width) + 0.5) / width - 0.5) * Math.PI * 2;
  const latitude =
    (0.5 - (Math.floor(sunPixel / width) + 0.5) / height) * Math.PI;
  const rotation = longitude - Math.atan2(11, -9);
  const direction = new THREE.Vector3(
    Math.cos(longitude) * Math.cos(latitude),
    Math.sin(latitude),
    Math.sin(longitude) * Math.cos(latitude),
  );
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
  scene.backgroundRotation.y = rotation;
  scene.environmentRotation.y = rotation;
  scene.userData.sunDirection = direction.toArray();
  pmrem.dispose();
}

/** Dense, metre-scale relief instead of a flat photograph underneath the player. */
export function replaceCourtyardGround(
  mesh: THREE.Mesh,
  material: THREE.MeshStandardMaterial,
) {
  // Transfer the baked top face's second UV set to every displaced paving vertex.
  const source = mesh.geometry, sourcePos = source.attributes.position,
    sourceNormal = source.attributes.normal, sourceLight = source.attributes.uv1;
  const top: number[] = [];
  if (sourceLight) for (let i = 0; i < sourcePos.count; i++) {
    if (sourceNormal.getY(i) > .95 && !top.some(j => Math.abs(sourcePos.getX(i)-sourcePos.getX(j)) + Math.abs(sourcePos.getZ(i)-sourcePos.getZ(j)) < .001)) top.push(i);
  }
  const g = new THREE.PlaneGeometry(20, 20, 240, 240);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position,
    uv = g.attributes.uv;
  if (top.length >= 3) {
    const [a,b,c] = top, ax=sourcePos.getX(a), az=sourcePos.getZ(a),
      bx=sourcePos.getX(b)-ax, bz=sourcePos.getZ(b)-az,
      cx=sourcePos.getX(c)-ax, cz=sourcePos.getZ(c)-az, det=bx*cz-bz*cx;
    const lightUV = new Float32Array(pos.count*2);
    for (let i=0;i<pos.count;i++) {
      const x=pos.getX(i)-ax,z=pos.getZ(i)-az, s=(x*cz-z*cx)/det,t=(z*bx-x*bz)/det;
      lightUV[i*2]=sourceLight.getX(a)+s*(sourceLight.getX(b)-sourceLight.getX(a))+t*(sourceLight.getX(c)-sourceLight.getX(a));
      lightUV[i*2+1]=sourceLight.getY(a)+s*(sourceLight.getY(b)-sourceLight.getY(a))+t*(sourceLight.getY(c)-sourceLight.getY(a));
    }
    g.setAttribute('uv1',new THREE.BufferAttribute(lightUV,2));
  }
  const image = (material.userData.heightMap as THREE.Texture)
    .image as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + 10) / 2.8,
      v = (pos.getZ(i) + 10) / 2.8;
    uv.setXY(i, u, v);
    const x = Math.floor((u % 1) * (image.width - 1)),
      y = Math.floor((1 - (v % 1)) * (image.height - 1));
    const h = pixels[(y * image.width + x) * 4] / 255;
    // The flat collision plane remains within 12mm of the visible paving.
    pos.setY(i, h * 0.016 - 0.012);
  }
  g.computeVertexNormals();
  mesh.geometry.dispose();
  mesh.geometry = g;
  mesh.material = material;
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  mesh.scale.set(1, 1, 1);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
}

/** Static irradiance is ray-traced through the actual openings in Blender.
 * It replaces ambient diffuse on these meshes; direct sun and specular remain live.
 */
export async function bindBakedLighting(root: THREE.Object3D) {
  const loader = new THREE.TextureLoader();
  const names = ["courtyard_stone","lime_plaster","weathered_wood","stone_plinth","kiln_firebrick","grey_fired_roof_tiles","ivory_porcelain","unglazed_stoneware","undyed_linen"];
  const maps = new Map<string,THREE.Texture[]>();
  await Promise.all(names.map(async name => {
    const textures = await Promise.all(["ao","indirect"].map(async type => {
      const texture = type === 'indirect'
        ? await new RGBELoader().loadAsync(`/assets/lighting/${name}_${type}.hdr`)
        : await loader.loadAsync(`/assets/lighting/${name}_${type}.png`);
      texture.flipY = false; texture.channel = 1; texture.anisotropy = 8;
      return texture;
    })); maps.set(name,textures);
  }));
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || !o.geometry.attributes.uv1) return;
    const name = o.userData.sourceMaterial as string, textures = maps.get(name);
    if (!textures) return;
    const material = (o.material as THREE.MeshStandardMaterial).clone();
    material.aoMap = textures[0]; material.aoMapIntensity = .20;
    // Cycles diffuse bake stores exitant radiance from a unit white Lambertian;
    // Three's lightMap expects irradiance, so convert using pi.
    material.lightMap = textures[1]; material.lightMapIntensity = Math.PI;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
        THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );',
          '/* Spatial sky irradiance is supplied by the baked lightmap. */'));
    };
    material.customProgramCacheKey = () => 'static-diffuse-lightmap-v1';
    o.material = material;
  });
}

/** Radiance rendered with the same Cycles sky/bounces as the static lightmaps. */
export async function loadWorkstationReflections(renderer: THREE.WebGLRenderer) {
  const pmrem=new THREE.PMREMGenerator(renderer),probes=new Map<string,THREE.Texture>();
  const names=['clay','wheel','paint','drying','glaze','supply','display','kiln'];
  for(const name of names) {
    const source=await new RGBELoader().loadAsync(`/assets/lighting/probes/${name}.hdr`);
    source.mapping=THREE.EquirectangularReflectionMapping;
    probes.set(name,pmrem.fromEquirectangular(source).texture);source.dispose();
  }
  pmrem.dispose();return probes;
}

export function workstationRegion(x:number,z:number) {
  if(Math.abs(x)>9.1||Math.abs(z)>8.05)return null;
  return z < -3.4 ? (x < -2.8?'clay':x>2.8?'paint':'wheel')
    : z > 3.4 ? (x < -2.8?'supply':x>3.2?'kiln':'display')
    : x>4.3?'glaze':x < -4.3?'drying':null;
}

/** Capture the actual rafters and courtyard in a ceramic's reflections. */
export function captureWorkshopReflections(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const probes = new Map<string, THREE.Texture>();
  const globalEnvironment=scene.environment;
  // Unbaked props must not inject unoccluded outdoor sky into an interior probe.
  // Baked architecture, actual sky through openings, and direct lights remain visible.
  scene.environment=null;
  for (const [name, x, z] of [
    ["north", 0, -5.6],
    ["east", 6.3, -0.2],
    ["south", 0, 5.8],
  ] as const) {
    const target = new THREE.WebGLCubeRenderTarget(256, {
      type: THREE.HalfFloatType,
    });
    const camera = new THREE.CubeCamera(0.05, 60, target);
    camera.position.set(x, 1.35, z);
    camera.update(renderer, scene);
    probes.set(name, pmrem.fromCubemap(target.texture).texture);
    target.dispose();
  }
  scene.environment=globalEnvironment;
  pmrem.dispose();
  return probes;
}
