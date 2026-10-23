import * as THREE from 'three';

/** Explicit developer capture mode; never selected by ordinary game settings. */
export function applyLightingAudit(scene:THREE.Scene, mode:string) {
  if(!['direct','indirect','combined'].includes(mode))return;
  const cache=new Map<THREE.Material,THREE.MeshStandardMaterial>();
  scene.traverse(o=>{
    if(o instanceof THREE.Light && mode==='indirect')o.intensity=0;
    if(!(o instanceof THREE.Mesh))return;
    const gray=(original:THREE.Material)=>{
      // Animated fire and other custom shaders keep their own uniforms/updates.
      if(!(original instanceof THREE.MeshStandardMaterial))return original;
      let material=cache.get(original);if(material)return material;
      const old=original;
      material=new THREE.MeshStandardMaterial({name:'audit_gray_'+old.name,color:new THREE.Color().setRGB(.18,.18,.18),roughness:1,
        side:old.side,alphaMap:old.alphaMap,alphaTest:old.alphaTest,
        envMap:mode==='direct'?null:old.envMap,envMapIntensity:mode==='direct'?0:old.envMapIntensity,
        lightMap:mode==='direct'?null:old.lightMap,lightMapIntensity:old.lightMapIntensity});
      if(old.lightMap){material.onBeforeCompile=old.onBeforeCompile;material.customProgramCacheKey=old.customProgramCacheKey;}
      material.envMapRotation.copy(old.envMapRotation);
      cache.set(original,material);return material;
    };
    o.material=Array.isArray(o.material)?o.material.map(gray):gray(o.material);
  });
  if(mode==='direct')scene.environment=null;
}
