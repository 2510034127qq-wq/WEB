import * as THREE from 'three';
import { modelLoader } from './model-loader';
import {gltfMaterial,type MaterialSet} from './materials';

export async function loadPottersWheel(surfaces:MaterialSet) {
  const {scene}=await modelLoader().loadAsync('/assets/potters-wheel.glb');
  const wood=gltfMaterial(surfaces.solidwood).clone();wood.normalScale.setScalar(.35);
  const working=wood.clone();
  const clay=await new THREE.TextureLoader().loadAsync('/assets/clay-surfaces/Clay005_4K-JPG_Color.jpg');
  clay.colorSpace=THREE.SRGBColorSpace;clay.wrapS=clay.wrapT=THREE.RepeatWrapping;clay.anisotropy=16;
  // A thin retained slip deposit is confined to the centring/work area. The
  // wood outside that contact zone keeps its scanned grain and reflectance.
  working.onBeforeCompile=shader=>{
    shader.uniforms.wheelClay={value:clay};
    shader.vertexShader='varying vec3 wheelSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwheelSurface=position;');
    shader.fragmentShader='varying vec3 wheelSurface; uniform sampler2D wheelClay; float slipCoverage;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float r=length(wheelSurface.xz);
      slipCoverage=(1.-smoothstep(.11,.29,r))*.46;
      diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(wheelClay,wheelSurface.xz/.2).rgb*.72,slipCoverage);
    `).replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,.68,slipCoverage);
    `);
  };
  working.customProgramCacheKey=()=> 'wheel-retained-centering-slip-v1';
  const fired=gltfMaterial(surfaces.earthenware);
  const bearing=new THREE.MeshPhysicalMaterial({map:fired.map,normalMap:fired.normalMap,
    roughnessMap:fired.roughnessMap,color:'#736c5a',roughness:.45,
    clearcoat:.72,clearcoatRoughness:.16,normalScale:new THREE.Vector2(.1,.1)});
  const cord=gltfMaterial(surfaces.linen).clone();cord.color.set('#948263');cord.normalScale.setScalar(.22);
  const materials:Record<string,THREE.Material>={wheel_timber:wood,wheel_working_surface:working,wheel_ceramic_bearing:bearing,wheel_hemp_binding:cord};
  scene.traverse(o=>{
    if(!(o instanceof THREE.Mesh))return;
    o.castShadow=o.receiveShadow=true;
    o.material=Array.isArray(o.material)?o.material.map(m=>materials[m.name]||m):materials[o.material.name]||o.material;
  });
  return new Map(scene.children.map(o=>[o.name,o]));
}
