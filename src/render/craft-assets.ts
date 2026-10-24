import * as THREE from 'three';
import { modelLoader } from './model-loader';
import {gltfMaterial,type MaterialSet} from './materials';
import {loadClay005Maps} from './fired-clay';

/** Authored meshes remain independently inspectable in art/craft-tools.blend. */
export async function loadCraftAssets(surfaces: MaterialSet) {
  const { scene } = await modelLoader().loadAsync('/assets/craft-tools.glb');
  const loader=new THREE.TextureLoader();
  const [clayNormal,clayRough,clayColor]=await Promise.all(['NormalGL','Roughness','Color'].map(async channel=>{
    const map=await loader.loadAsync(`/assets/clay-surfaces/Clay006_4K-JPG_${channel}.jpg`);
    if(channel==='Color')map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.flipY=false;map.anisotropy=16;return map;
  }));
  const wet = new THREE.MeshPhysicalMaterial({
    color: '#85867a', roughness: .50, clearcoat: .24, clearcoatRoughness: .32,
    map:clayColor,
    roughnessMap: clayRough,
    normalMap: clayNormal, normalScale: new THREE.Vector2(.65,.65),
  });
  wet.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      float clayValue=dot(texture2D(map,vMapUv).rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb*=mix(1.,clamp(clayValue/.214,.72,1.3),.8);
    `).replace('#include <roughnessmap_fragment>',`
      float roughnessFactor=clamp(roughness+(texture2D(roughnessMap,vRoughnessMapUv).g-.498)*.22,.1,1.);
    `);
  };
  wet.customProgramCacheKey=()=> 'scanned-kaolin-billet-v1';
  const [vatColor,vatNormal,vatRough] = await loadClay005Maps();
  const fired = new THREE.MeshPhysicalMaterial({
    map:vatColor,normalMap:vatNormal,roughnessMap:vatRough,
    color:'#b9aaa0',roughness:.84,normalScale:new THREE.Vector2(.48,.48),
    metalness:0,ior:1.5,vertexColors:true,
  });
  // Authored corner colors encode actual use: dried slurry runs / submerged
  // interior / handled lug. They are masks, not RGB paint or arbitrary grunge.
  fired.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      float vatGrain=texture2D(roughnessMap,vRoughnessMapUv).g;
      float residue=clamp(vColor.r*(.65+vatGrain*.35),0.,1.);
      float damp=clamp(vColor.g,0.,1.);
      diffuseColor.rgb*=mix(1.,.64,damp);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.39,.32),residue*.78);
    `).replace('#include <roughnessmap_fragment>',`
      float grain=texture2D(roughnessMap,vRoughnessMapUv).g;
      float roughnessFactor=clamp(.77+grain*.17-vColor.g*.40-vColor.b*.14, .3, .95);
    `);
  };
  fired.customProgramCacheKey=()=> 'metric-vat-clay-and-authored-residue-v1';
  const bamboo = gltfMaterial(surfaces.bamboo).clone();
  bamboo.color.set('#c7b99a'); bamboo.roughness=.65; bamboo.normalScale.set(.12,.12);
  // Small scale ground/smithing pits. The sharpened toe keeps its own smoother material.
  const iron = gltfMaterial(surfaces.iron).clone(); iron.normalScale.set(.12,.12); iron.roughness=.71;
  const blade = iron.clone(); blade.roughness=.32; blade.normalScale.set(.04,.04);
  const fiber = gltfMaterial(surfaces.linen).clone(); fiber.color.set('#92876c'); fiber.normalScale.set(.16,.16);
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
