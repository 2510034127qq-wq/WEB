import * as THREE from "three";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { WorkshopAO } from "./workshop-ao";

/** Apply the existing AO in the final HDR -> display conversion. Multiplying
 * after the colour resolve is equivalent to the old fullscreen blend, without
 * reopening and resolving a full-size 4x MSAA buffer a second time.
 */
export class WorkshopOutput extends OutputPass {
  declare uniforms: Record<string, THREE.IUniform>;
  constructor(private ao: WorkshopAO) {
    super();
    this.needsSwap = false;
    this.uniforms.workshopAO = { value: ao.blurRenderTarget.texture };
    this.uniforms.aoEnabled = { value: 1 };
    this.material.fragmentShader = this.material.fragmentShader
      .replace(
        "uniform sampler2D tDiffuse;",
        "uniform sampler2D tDiffuse; uniform sampler2D workshopAO; uniform float aoEnabled;",
      )
      .replace(
        "gl_FragColor = texture2D( tDiffuse, vUv );",
        "gl_FragColor = texture2D( tDiffuse, vUv ); gl_FragColor.rgb *= mix(1.,texture2D(workshopAO,vUv).r,aoEnabled);",
      );
  }
  override render(
    renderer: THREE.WebGLRenderer,
    write: THREE.WebGLRenderTarget,
    read: THREE.WebGLRenderTarget,
  ) {
    this.uniforms.aoEnabled.value = this.ao.enabled ? 1 : 0;
    super.render(renderer, write, read, 0, false);
  }
}
