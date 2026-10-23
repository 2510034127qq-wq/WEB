import { MathUtils } from 'three';

export function pathCenter(z:number) {
  return z>8?Math.max(0,z-15)*.13+Math.sin((z-8)*.12)*1.5+MathUtils.smoothstep(z,20,38)*6:0;
}

export function terrainHeight(x:number,z:number) {
  const d=Math.hypot(x,z),rise=MathUtils.smoothstep(d,10,25);
  return -.14+rise*(.36+Math.sin(x*.13)*Math.cos(z*.1)*.28)
    +MathUtils.smoothstep(d,24,60)*(3+Math.sin(x*.06+z*.04)*1.6)
    +MathUtils.smoothstep(z,17,36)*(2.4+.6*Math.cos(x*.15));
}
