import {describe,it,expect} from 'vitest';
import {GLAZE_VAT,glazeContact} from '../src/simulation/glaze-contact';
import {newPiece,dip} from '../src/simulation/model';

describe('physical glaze contact',()=>{
  it('does not coat a short vessel hovering above the slurry',()=>{
    const p=newPiece('bowl',1);p.height=.16;p.shrink=1;p.stage='trimmed';
    const pose=glazeContact(p,.2);
    expect(pose.bottom).toBeGreaterThan(GLAZE_VAT.liquid);
    dip(p,2,pose.immersed);
    expect(p.glaze.every(v=>v===0)).toBe(true);
    expect(p.stage).toBe('trimmed');
  });
  it('submerges a fitting bowl and stops a tall vessel above the solid floor',()=>{
    expect(glazeContact({height:.16,shrink:1},1).immersed).toBe(1);
    for(const height of [.30,.44]){
      const pose=glazeContact({height,shrink:1},1);
      expect(pose.atFloor).toBe(true);
      expect(pose.bottom).toBeCloseTo(GLAZE_VAT.floor+GLAZE_VAT.clearance);
      expect(pose.immersed).toBeCloseTo((GLAZE_VAT.liquid-pose.bottom-.012)/height);
      expect(pose.immersed).toBeLessThan(1);
    }
  });
});
