import * as THREE from "three";
import { makeWoodland } from "./woodland";
import { makeTerrain } from "./terrain";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Physical leaves and branches, instanced to keep the courtyard GPU budget bounded. */
export async function makeGarden(scene: THREE.Scene) {
  const supportHeight=await makeTerrain(scene);
  await makeWoodland(scene,supportHeight);
}

export function makeWear(scene: THREE.Scene) {
  const clay=new THREE.TextureLoader().load('/assets/clay-surfaces/Clay006_4K-JPG_Color.jpg');
  clay.colorSpace=THREE.SRGBColorSpace;clay.wrapS=clay.wrapT=THREE.RepeatWrapping;clay.anisotropy=16;
  scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.userData.sourceMaterial!=='courtyard_stone')return;
    const material=o.material as THREE.MeshStandardMaterial;
    const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      compile.call(material,shader,renderer);shader.uniforms.floorClay={value:clay};
      shader.vertexShader='varying vec3 floorPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloorPosition=position;');
      shader.fragmentShader=`varying vec3 floorPosition;uniform sampler2D floorClay;
        float clayDust,wetFloor;
        float workFalloff(vec2 p,vec2 centre,vec2 extent){return 1.-smoothstep(.25,1.,length((p-centre)/extent));}
        \n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
        vec2 floorXZ=floorPosition.xz;
        // Trampled clay accumulates around kneading, throwing and raw storage;
        // glaze water stays close to the vat, wash jars and wall bases.
        clayDust=.28*workFalloff(floorXZ,vec2(-5.6,-5.35),vec2(1.9,1.25))
          +.22*workFalloff(floorXZ,vec2(0.,-5.5),vec2(1.25,1.15))
          +.12*workFalloff(floorXZ,vec2(-6.,4.9),vec2(1.5,1.1))
          +.08*workFalloff(floorXZ,vec2(-7.4,-.2),vec2(1.,2.3));
        wetFloor=.22*workFalloff(floorXZ,vec2(7.4,-.2),vec2(1.05,1.4))
          +.20*workFalloff(floorXZ,vec2(-6.9,-5.5),vec2(.65,.7))
          +.10*smoothstep(8.1,8.95,abs(floorXZ.x));
        vec3 settledClay=texture2D(floorClay,floorXZ/.2).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,settledClay,clayDust);
        diffuseColor.rgb*=1.-wetFloor*.45;
      `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.96,clayDust);
        roughnessFactor=mix(roughnessFactor,.44,wetFloor);
      `);
    };
    material.customProgramCacheKey=()=>key+'-physical-work-floor-v1';
  });
  const brickMap = new THREE.TextureLoader().load(
    "/assets/textures/brick_diff.jpg",
  );
  brickMap.colorSpace = THREE.SRGBColorSpace;
  brickMap.wrapS = brickMap.wrapT = THREE.RepeatWrapping;
  brickMap.repeat.set(0.15, 0.035);
  brickMap.offset.set(0.32, 0.945);
  const mortar = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.51, 0.04),
    new THREE.MeshStandardMaterial({ color: "#a4a08d", roughness: 1 }),
  );
  mortar.position.set(0, 0.27, -7.83);
  mortar.receiveShadow = true;
  scene.add(mortar);
  const backdrop = new THREE.MeshStandardMaterial({
      color: "#8e8c83",
      map: brickMap,
      bumpMap: fineNoise(),
      bumpScale: 0.0017,
      roughness: 1,
    }),
    blocks = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.465, 0.162, 0.08, 2, 0.005),
      backdrop,
      111,
    ),
    matrix = new THREE.Matrix4();
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 37; i++) {
      matrix.makeTranslation(
        -8.8 + i * 0.48 + (j % 2) * 0.12,
        0.1 + j * 0.17,
        -7.81,
      );
      blocks.setMatrixAt(j * 37 + i, matrix);
    }
  blocks.receiveShadow = true;
  scene.add(blocks);
}

export function fineNoise(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    data = ctx.createImageData(size, size),
    rand = random(93);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 110 + rand() * 50;
    data.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
