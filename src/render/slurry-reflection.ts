import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';

/** Reflect actual ware and the nearby rim. A room probe cannot contain either.
 * The opaque suspension keeps diffuse lighting; only water-surface specular is
 * replaced. Mip-filtering is a planar rough-reflection approximation, not GI.
 */
export function bindSlurryReflection(surface:THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>,frame:()=>number) {
  const mirror=new Reflector(surface.geometry,{textureWidth:1,textureHeight:1,clipBias:.0003,multisample:4});
  const target=mirror.getRenderTarget();
  target.resolveDepthBuffer=false;
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
  const box=new THREE.Box3(),point=new THREE.Vector3(),crop=new THREE.Matrix4(),uvCrop=new THREE.Matrix4();
  const rendered=new Map<number,number>();
  surface.onBeforeRender=(renderer,scene,camera,geometry,activeMaterial,group)=>{
    // SSAO substitutes a normal material. It must not capture another reflection.
    if(capturing || !(activeMaterial instanceof THREE.MeshPhysicalMaterial)||rendered.get(camera.id)===frame())return;
    capturing=true;const wasVisible=surface.visible;
    const beforeScene=scene.onBeforeRender;
    try{
      renderer.getDrawingBufferSize(size);
      // A 30-pixel water surface must not render four million reflection pixels.
      // Crop the reflected frustum, retaining one reflection pixel per screen
      // pixel, four MSAA samples, the same geometry and the original roughness.
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      box.copy(geometry.boundingBox!).expandByScalar(.004).applyMatrix4(surface.matrixWorld);
      let minX=1,minY=1,maxX=-1,maxY=-1,near=false;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        point.set(x,y,z).applyMatrix4(camera.matrixWorldInverse);
        if(point.z>=-.035){near=true;break;}
        point.applyMatrix4(camera.projectionMatrix);
        minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);
        minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
      }
      if(!near&&(maxX<-1||minX>1||maxY<-1||minY>1))return;
      // Include mip-filter support beyond the visible surface; align the crop
      // outwards so moving the view doesn't continuously reallocate GPU targets.
      const left=near?0:Math.floor((Math.max(-1,minX)*.5+.5)*size.x/16)*16-16;
      const bottom=near?0:Math.floor((Math.max(-1,minY)*.5+.5)*size.y/16)*16-16;
      const width=near?size.x:Math.ceil(((Math.min(1,maxX)*.5+.5)*size.x-left+16)/64)*64;
      const height=near?size.y:Math.ceil(((Math.min(1,maxY)*.5+.5)*size.y-bottom+16)/64)*64;
      if(target.width!==width||target.height!==height)target.setSize(width,height);
      crop.set(size.x/width,0,0,(size.x-2*left-width)/width,
        0,size.y/height,0,(size.y-2*bottom-height)/height,0,0,1,0,0,0,0,1);
      uvCrop.set(size.x/width,0,0,-left/width,0,size.y/height,0,-bottom/height,0,0,1,0,0,0,0,1);
      scene.onBeforeRender=(...args)=>{
        beforeScene.apply(scene,args);const c=args[2];
        if(c!==mirror.camera)return;
        c.projectionMatrix.premultiply(crop);c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
        (uniforms.textureMatrix.value as THREE.Matrix4).premultiply(uvCrop);
      };
      mirror.matrixWorld.copy(surface.matrixWorld);
      surface.visible=false;
      mirror.onBeforeRender(renderer,scene,camera,geometry,mirror.material as THREE.ShaderMaterial,group);
      rendered.set(camera.id,frame());
      surface.userData.reflectionPixels=[width,height];
    }finally{scene.onBeforeRender=beforeScene;surface.visible=wasVisible;capturing=false;}
  };
  return ()=>mirror.dispose();
}
