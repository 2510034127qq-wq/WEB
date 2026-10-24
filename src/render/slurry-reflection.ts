import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

/** Reflect actual ware and the nearby rim. A room probe cannot contain either.
 * The opaque suspension keeps diffuse lighting; only water-surface specular is
 * replaced. Mip-filtering is a planar rough-reflection approximation, not GI.
 */
export function bindSlurryReflection(surface:THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>) {
  const mirror=new Reflector(surface.geometry,{textureWidth:1,textureHeight:1,clipBias:.0003,multisample:4});
  const target=mirror.getRenderTarget();
  target.texture.generateMipmaps=true;
  target.texture.minFilter=THREE.LinearMipmapLinearFilter;
  const uniforms=(mirror.material as THREE.ShaderMaterial).uniforms;
  const material=surface.material;
  material.roughness=.22;material.clearcoat=0;material.ior=1.333;
  material.onBeforeCompile=shader=>{
    shader.uniforms.slurryReflection={value:target.texture};
    shader.uniforms.slurryTextureMatrix=uniforms.textureMatrix;
    shader.vertexShader='uniform mat4 slurryTextureMatrix; varying vec4 slurryReflectionUV;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nslurryReflectionUV=slurryTextureMatrix*vec4(transformed,1.);');
    shader.fragmentShader='uniform sampler2D slurryReflection; varying vec4 slurryReflectionUV;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',
      THREE.ShaderChunk.envmap_physical_pars_fragment.replace('return envMapColor.rgb * envMapIntensity;', 'return vec3(0.);'));
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      float waterFresnel=.02037+.97963*pow(1.-clamp(dot(normal,geometryViewDir),0.,1.),5.);
      vec3 nearReflection=texture2DProj(slurryReflection,slurryReflectionUV,roughness*5.).rgb;
      outgoingLight+=nearReflection*waterFresnel;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'opaque-slurry-with-local-planar-reflection-v1';
  let capturing=false;
  const size=new THREE.Vector2();
  surface.onBeforeRender=(renderer,scene,camera,geometry,activeMaterial,group)=>{
    // SSAO substitutes a normal material. It must not capture another reflection.
    if(capturing || !(activeMaterial instanceof THREE.MeshPhysicalMaterial))return;
    capturing=true;const wasVisible=surface.visible;
    try{
      renderer.getDrawingBufferSize(size);
      if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
      mirror.matrixWorld.copy(surface.matrixWorld);
      surface.visible=false;
      mirror.onBeforeRender(renderer,scene,camera,geometry,mirror.material as THREE.ShaderMaterial,group);
    }finally{surface.visible=wasVisible;capturing=false;}
  };
  return ()=>mirror.dispose();
}
