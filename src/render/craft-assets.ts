import * as THREE from 'three';
import { modelLoader } from './model-loader';
import type { MaterialSet } from './materials';

/** Authored meshes remain independently inspectable in art/craft-tools.blend. */
export async function loadCraftAssets(surfaces: MaterialSet) {
  const { scene } = await modelLoader().loadAsync('/assets/craft-tools.glb');
  const loader=new THREE.TextureLoader();
  const [clayNormal,clayRough]=await Promise.all(['NormalGL','Roughness'].map(async channel=>{
    const map=await loader.loadAsync(`/assets/clay-surfaces/Clay006_4K-JPG_${channel}.jpg`);
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=16;return map;
  }));
  const wet = new THREE.MeshPhysicalMaterial({
    color: '#85867a', roughness: .78, clearcoat: .24, clearcoatRoughness: .32,
    roughnessMap: clayRough,
    normalMap: clayNormal, normalScale: new THREE.Vector2(.18,.18),
  });
  const fired = surfaces.earthenware.clone();
  fired.color.set('#91836f'); fired.normalScale.set(.32,.32);
  const bamboo = surfaces.bamboo.clone();
  bamboo.color.set('#c7b99a'); bamboo.roughness=.65; bamboo.normalScale.set(.12,.12);
  // Small scale ground/smithing pits. The sharpened toe keeps its own smoother material.
  const iron = surfaces.iron.clone(); iron.normalScale.set(.12,.12); iron.roughness=.71;
  const blade = iron.clone(); blade.roughness=.32; blade.normalScale.set(.04,.04);
  const fiber = surfaces.linen.clone(); fiber.color.set('#92876c'); fiber.normalScale.set(.16,.16);
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow=o.receiveShadow=true;
    const original=Array.isArray(o.material)?o.material:[o.material];
    const maps: Record<string,THREE.Material>={craft_wet_kaolin:wet,craft_coiled_stoneware:fired,craft_bamboo:bamboo,craft_fiber_binding:fiber,craft_forged_iron:iron,honed_cutting_edge:blade};
    const assigned=original.map(m=>maps[m.name]||m);
    o.material=Array.isArray(o.material)?assigned:assigned[0];
  });
  return new Map(scene.children.map(o => [o.name,o]));
}
