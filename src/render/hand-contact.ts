import * as THREE from 'three';

function tipPoint(bone: THREE.Bone) {
  return bone.localToWorld(new THREE.Vector3(0,bone.userData.length || .022,0));
}
export function fingerTip(hand: THREE.Object3D, name: string) {
  return tipPoint(hand.getObjectByName(name) as THREE.Bone);
}
/** Flexion-only CCD: imported bone rolls align local X with a finger's hinge.
 * Mirrored hands require an axial-vector sign correction, unlike positions.
 */
export function solveFingerContact(hand: THREE.Object3D, prefix: string, target: THREE.Vector3) {
  const bones=[0,1,2].map(i=>hand.getObjectByName(`${prefix}_${i}`) as THREE.Bone);
  if(bones.some(b=>!b)) return;
  for(let pass=0;pass<7;pass++) for(let i=2;i>=0;i--) {
    const bone=bones[i],origin=bone.getWorldPosition(new THREE.Vector3()),
      tip=tipPoint(bones[2]).sub(origin),wanted=target.clone().sub(origin);
    const axis=new THREE.Vector3(1,0,0).transformDirection(bone.matrixWorld)
      .multiplyScalar(Math.sign(bone.matrixWorld.determinant()));
    tip.addScaledVector(axis,-tip.dot(axis)).normalize();
    wanted.addScaledVector(axis,-wanted.dot(axis)).normalize();
    const delta=Math.atan2(axis.dot(new THREE.Vector3().crossVectors(tip,wanted)),tip.dot(wanted));
    const previous=bone.userData.flex || 0;
    const angle=THREE.MathUtils.clamp(previous+delta*.8,-.10,i===0?1.35:1.65);
    bone.rotateX(angle-previous);bone.userData.flex=angle;
    hand.updateMatrixWorld(true);
  }
}
