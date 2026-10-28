import * as THREE from 'three';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

/** Geometry AO must see the same leaf silhouettes as the colour/shadow passes. */
export class WorkshopAO extends SSAOPass {
  private normalCache=new WeakMap<THREE.Material,THREE.MeshNormalMaterial>();
  private passQuad=new FullScreenQuad();
  private passClearColor=new THREE.Color();
  _renderPass(renderer:THREE.WebGLRenderer,material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget|null,
    clearColor?:THREE.ColorRepresentation,clearAlpha?:number){
    // WorkshopOutput consumes this same AO texture. Keep normals, the complete
    // 16-sample AO kernel and blur; omit only the redundant MSAA composite.
    if(material===this.copyMaterial&&this.output===SSAOPass.OUTPUT.Default)return;
    renderer.getClearColor(this.passClearColor);
    const alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear;
    renderer.setRenderTarget(target);renderer.autoClear=false;
    try{
      if(clearColor!==undefined){renderer.setClearColor(clearColor,clearAlpha??0);renderer.clear();}
      this.passQuad.material=material;this.passQuad.render(renderer);
    }finally{renderer.autoClear=autoClear;renderer.setClearColor(this.passClearColor,alpha);}
  }
  override dispose(){this.passQuad.dispose();super.dispose();}
  private normalFor(source:THREE.Material) {
    let material=this.normalCache.get(source);
    if(material){material.visible=source.visible&&source.opacity>0;return material;}
    material=new THREE.MeshNormalMaterial({side:source.side,opacity:source.opacity});
    // Invisible interaction targets are raycastable, but must not become solid
    // occluders merely because this pass substitutes their shading material.
    material.visible=source.visible&&source.opacity>0;
    const surface=source as THREE.MeshStandardMaterial;
    const cutout=surface.alphaMap||surface.map;
    if(source.alphaTest>0&&cutout){
      cutout.updateMatrix();
      material.onBeforeCompile=shader=>{
        shader.uniforms.cutoutMap={value:cutout};shader.uniforms.cutoutTransform={value:cutout.matrix};
        shader.uniforms.cutoutThreshold={value:source.alphaTest};
        shader.vertexShader='uniform mat3 cutoutTransform; varying vec2 cutoutUV;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',
          '#include <uv_vertex>\ncutoutUV=(cutoutTransform*vec3(uv,1.)).xy;');
        shader.fragmentShader='uniform sampler2D cutoutMap; uniform float cutoutThreshold; varying vec2 cutoutUV;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\nif(texture2D(cutoutMap,cutoutUV).${surface.alphaMap?'g':'a'}<cutoutThreshold)discard;`);
      };
      material.customProgramCacheKey=()=>`cutout-normal-${surface.alphaMap?'green':'alpha'}-v1`;
    }
    this.normalCache.set(source,material);
    source.addEventListener('dispose',()=>material!.dispose());
    return material;
  }
  // SSAOPass currently replaces the whole scene with a single normal material,
  // which turns cut-out cards into solid rectangles. Keep per-material opacity.
  _renderOverride(renderer:THREE.WebGLRenderer,_override:THREE.Material,target:THREE.WebGLRenderTarget,
    clearColor:THREE.ColorRepresentation,clearAlpha:number) {
    const color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),
      autoClear=renderer.autoClear,shadowUpdate=renderer.shadowMap.autoUpdate,override=this.scene.overrideMaterial;
    const originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
    try{
      this.scene.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        originals.set(o,o.material);
        o.material=Array.isArray(o.material)?o.material.map(m=>this.normalFor(m)):this.normalFor(o.material);
      });
      this.scene.overrideMaterial=null;
      renderer.setRenderTarget(target);renderer.setClearColor(clearColor,clearAlpha);renderer.autoClear=false;renderer.clear();
      // The colour pass has already updated the shadows. The normal pass does
      // not consume lights and must not render the same shadow maps a second time.
      renderer.shadowMap.autoUpdate=false;renderer.render(this.scene,this.camera);
    }finally{
      originals.forEach((material,mesh)=>{mesh.material=material;});
      this.scene.overrideMaterial=override;renderer.shadowMap.autoUpdate=shadowUpdate;
      renderer.autoClear=autoClear;renderer.setClearColor(color,alpha);
    }
  }
}
