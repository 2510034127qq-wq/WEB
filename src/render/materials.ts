import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export type Surface = "agedwood" | "wall" | "ground" | "brick";
export type MaterialSet = Record<Surface, THREE.MeshStandardMaterial>;

/** Photographed, locally shipped maps. Only base colour is decoded as sRGB. */
export async function loadWorkshopMaterials(
  renderer: THREE.WebGLRenderer,
): Promise<MaterialSet> {
  const loader = new THREE.TextureLoader();
  const surfaces = ["agedwood", "wall", "ground", "brick"] as const;
  const result = {} as MaterialSet;
  await Promise.all(
    surfaces.map(async (name) => {
      const entries = await Promise.all(
        ["diff", "rough", "nor_gl", "ao", "disp"].map(async (channel) => {
          const texture = await loader.loadAsync(
            `/assets/textures/realism/${name}_${channel}.jpg`,
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
        metalness: 0,
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
  const g = new THREE.PlaneGeometry(20, 20, 240, 240);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position,
    uv = g.attributes.uv;
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

/** Capture the actual rafters and courtyard in a ceramic's reflections. */
export function captureWorkshopReflections(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const probes = new Map<string, THREE.Texture>();
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
  pmrem.dispose();
  return probes;
}
