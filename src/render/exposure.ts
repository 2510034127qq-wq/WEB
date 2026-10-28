import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

/** Centre-weighted photographic metering of the actual linear HDR frame.
 * Exposure changes the camera response, never scene light energy or shadow depth.
 */
export class ExposureMeter extends Pass {
  private target=new THREE.WebGLRenderTarget(16,16,{depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  private material=new THREE.ShaderMaterial({
    uniforms:{frame:{value:null},ao:{value:null},aoEnabled:{value:0}},depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D frame,ao;uniform float aoEnabled;varying vec2 p;
      void main(){vec3 c=texture2D(frame,p).rgb*mix(1.,texture2D(ao,p).r,aoEnabled);float l=max(dot(c,vec3(.2126,.7152,.0722)),.000015);
        float encoded=clamp((log2(l)+16.)/24.,0.,1.);gl_FragColor=vec4(vec3(encoded),1.);}`,
  });
  private quad=new FullScreenQuad(this.material);
  private pixels=new Uint8Array(16*16*4);
  private pending=false;
  private nextSample=0;
  private lastFrame=0;
  targetExposure=1.4;
  meteredLuminance=0;
  constructor(public fixedExposure:number|null){super();this.needsSwap=false;}
  setAO(texture:THREE.Texture,enabled:boolean){this.material.uniforms.ao.value=texture;this.material.uniforms.aoEnabled.value=enabled?1:0;}
  render(renderer:THREE.WebGLRenderer,_write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
    if(this.fixedExposure!==null){renderer.toneMappingExposure=this.fixedExposure;return;}
    const now=performance.now(),dt=Math.min(.1,this.lastFrame?(now-this.lastFrame)/1000:0);this.lastFrame=now;
    // Human/camera adaptation is continuous; emerge into daylight more quickly.
    const current=renderer.toneMappingExposure,rate=this.targetExposure<current?2.4:1.25;
    renderer.toneMappingExposure=Math.exp(THREE.MathUtils.damp(Math.log(current),Math.log(this.targetExposure),rate,dt));
    if(this.pending||now<this.nextSample)return;
    this.nextSample=now+500;this.pending=true;
    const previous=renderer.getRenderTarget();
    this.material.uniforms.frame.value=read.texture;renderer.setRenderTarget(this.target);this.quad.render(renderer);
    renderer.setRenderTarget(previous);
    void renderer.readRenderTargetPixelsAsync(this.target,0,0,16,16,this.pixels).then(()=>{
      const samples=Array.from({length:256},(_,i)=>({log:this.pixels[i*4]/255*24-16,
        weight:.35+Math.exp(-(((i%16-7.5)/6)**2+((Math.floor(i/16)-7.5)/6)**2))})).sort((a,b)=>a.log-b.log);
      // Ignore the darkest crevice pixels and isolated solar/fire pixels.
      let sum=0,weight=0;
      for(const sample of samples.slice(20,236)){sum+=sample.log*sample.weight;weight+=sample.weight;}
      this.meteredLuminance=2**(sum/weight);
      this.targetExposure=THREE.MathUtils.clamp(.08/this.meteredLuminance,1.2,16);
    }).catch(()=>{/* Keep the last valid exposure if the context is temporarily unavailable. */})
      .finally(()=>{this.pending=false;});
  }
  dispose(){this.target.dispose();this.material.dispose();this.quad.dispose();}
}
