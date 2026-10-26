import * as THREE from 'three';

export const FINGERS = ['finger0','finger1','finger2','finger3','thumb'] as const;
export type HandPose = 'open'|'fist'|'pinch'|'tool'|'clay'|'wheel'|'carry';
type JointAxis='flex'|'spread'|'opposition';
export function initializeHand(hand:THREE.Object3D, lengths:Record<string,number>, side:'left'|'right') {
  hand.userData.side=side;hand.userData.contacts=[];
  hand.traverse(o=>{if(o instanceof THREE.Bone){
    o.userData.restQuaternion=o.quaternion.clone();o.userData.length=lengths[o.name];
    o.userData.flex=0;o.userData.spread=0;o.userData.opposition=0;
  }});
  for(let i=0;i<12;i++)poseHand(hand,'tool',.1);
  const pinch=fingerTip(hand,'thumb_2').add(fingerTip(hand,'finger0_2')).multiplyScalar(.5);
  hand.userData.toolAxis=hand.worldToLocal(pinch.clone()).sub(hand.worldToLocal(fingerTip(hand,'finger1_2'))).normalize();
  hand.traverse(o=>{if(o instanceof THREE.Bone){o.userData.flex=0;o.userData.spread=0;o.userData.opposition=0;applyJoint(o);}});hand.updateMatrixWorld(true);
}
export function applyJoint(b:THREE.Bone) {
  b.quaternion.copy(b.userData.restQuaternion);
  b.rotateZ(b.userData.spread||0);b.rotateY(b.userData.opposition||0);b.rotateX(b.userData.flex||0);
}
function tipPoint(bone: THREE.Bone) {
  return bone.localToWorld(new THREE.Vector3(0,bone.userData.length || .022,0));
}
export function fingerTip(hand: THREE.Object3D, name: string) {
  return tipPoint(hand.getObjectByName(name) as THREE.Bone);
}
/** Rest-space rotations shared by the live game and the inspection viewer. */
export function poseHand(hand:THREE.Object3D, pose:HandPose, dt=1/60) {
  const blend=1-Math.exp(-18*Math.min(.1,dt)),sign=hand.userData.side==='left'?-1:1;
  const palm=hand.getObjectByName('palm') as THREE.Bone;
  if(palm){palm.userData.flex=THREE.MathUtils.lerp(palm.userData.flex||0,pose==='fist'?.07:pose==='tool'?.025:0,blend);applyJoint(palm);}
  for(const name of FINGERS)for(let j=0;j<3;j++) {
    const b=hand.getObjectByName(`${name}_${j}`) as THREE.Bone;
    const thumb=name==='thumb',index=Number(name[6])||0;
    const angles:Record<HandPose,number[]>={open:[0,0,0],fist:[1.0,1.25,.72],pinch:[.45,.85,.50],tool:[.55,.95,.65],clay:[.16,.32,.16],wheel:[.08,.20,.12],carry:[.35,.68,.38]};
    let flex=angles[pose][j];
    if(pose==='fist'&&!thumb)flex=(hand.userData.side==='right'?[1.25,1.5,.85]:[1.10,1.35,.70])[j];
    if(thumb)flex=pose==='open'?0:(pose==='fist'?[.65,.75,.55]:[.10,.24,.18])[j];
    else if(pose==='pinch' && index>0)flex=[.18,.35,.2][j];
    let spread=0,opposition=0;
    if(thumb && j===0){spread=sign*(pose==='open'?0:pose==='fist'?.75:.48);opposition=sign*(pose==='open'?0:.30);}
    if(!thumb && j===0 && ['fist','tool','pinch'].includes(pose))spread=sign*[.12,.02,-.10,-.24][index];
    for(const [key,value] of Object.entries({flex,spread,opposition}))b.userData[key]=THREE.MathUtils.lerp(b.userData[key]||0,value,blend);
    applyJoint(b);
  }
  hand.userData.pose=pose;hand.userData.contacts=[];hand.updateMatrixWorld(true);
  if(pose==='fist'){
    const inward=new THREE.Vector3(0,.018,.035).transformDirection(hand.matrixWorld).multiplyScalar(Math.hypot(.018,.035));
    for(const name of FINGERS.slice(0,4)){
      const root=hand.getObjectByName(`${name}_0`)!;solveFingerContact(hand,name,root.getWorldPosition(new THREE.Vector3()).add(inward));
    }
    const thumbTarget=(hand.getObjectByName('finger0_1')!).getWorldPosition(new THREE.Vector3()).add((hand.getObjectByName('finger1_1')!).getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
    thumbTarget.add(new THREE.Vector3(0,.012,0).applyQuaternion(hand.quaternion));solveFingerContact(hand,'thumb',thumbTarget);
  }
}

/** A tripod grip aligns the hand's natural grip axis with the actual tool shaft. */
export function gripTool(hand:THREE.Object3D,center:THREE.Vector3,shaft:THREE.Vector3,body:THREE.Vector3,radius=.005){
 const localAxis=hand.userData.toolAxis as THREE.Vector3;
 const q=new THREE.Quaternion().setFromUnitVectors(localAxis,shaft);
 const wrist=new THREE.Vector3(0,0,1).applyQuaternion(q);wrist.addScaledVector(shaft,-wrist.dot(shaft)).normalize();
 const towardBody=body.clone().sub(center);towardBody.addScaledVector(shaft,-towardBody.dot(shaft)).normalize();
 const roll=Math.atan2(shaft.dot(new THREE.Vector3().crossVectors(wrist,towardBody)),wrist.dot(towardBody));
 hand.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(shaft,roll).multiply(q));hand.updateMatrixWorld(true);
 const pinch=fingerTip(hand,'thumb_2').add(fingerTip(hand,'finger0_2')).multiplyScalar(.5);
 hand.position.add(center.clone().sub(pinch));hand.updateMatrixWorld(true);
 const across=fingerTip(hand,'thumb_2').sub(fingerTip(hand,'finger0_2'));across.addScaledVector(shaft,-across.dot(shaft)).normalize();
 solveFingerContact(hand,'thumb',center.clone().addScaledVector(across,radius));
 solveFingerContact(hand,'finger0',center.clone().addScaledVector(across,-radius));
 const middle=fingerTip(hand,'finger1_2'),along=THREE.MathUtils.clamp(middle.clone().sub(center).dot(shaft),-.045,.045);
 const axisPoint=center.clone().addScaledVector(shaft,along);
 const normal=middle.clone().sub(axisPoint);normal.addScaledVector(shaft,-normal.dot(shaft));
 if(normal.lengthSq()<1e-8)normal.copy(across);normal.normalize();
 solveFingerContact(hand,'finger1',axisPoint.addScaledVector(normal,radius));
}
/** Bounded CCD: MCP spread and thumb opposition supplement hinge flexion. */
export function solveFingerContact(hand:THREE.Object3D,prefix:string,target:THREE.Vector3) {
  const bones=[0,1,2].map(i=>hand.getObjectByName(`${prefix}_${i}`) as THREE.Bone);
  if(bones.some(b=>!b))return Infinity;
  const thumb=prefix==='thumb';
  for(let pass=0;pass<16 && tipPoint(bones[2]).distanceTo(target)>.0008;pass++)for(let i=2;i>=0;i--){
    const bone=bones[i];
    const freedoms:JointAxis[]=i===0?(thumb?['spread','opposition','flex']:['spread','flex']):['flex'];
    for(const key of freedoms){
      const previous=bone.userData[key]||0,epsilon=.002;
      const before=tipPoint(bones[2]);
      bone.userData[key]=previous+epsilon;applyJoint(bone);hand.updateMatrixWorld(true);
      const derivative=tipPoint(bones[2]).sub(before).divideScalar(epsilon);
      const delta=target.clone().sub(before).dot(derivative)/Math.max(1e-9,derivative.lengthSq());
      const range=key==='flex'?[-.12,i===0?1.30:1.50]:key==='opposition'?[-.85,.85]:thumb?[-1.25,1.25]:[-.42,.42];
      bone.userData[key]=THREE.MathUtils.clamp(previous+THREE.MathUtils.clamp(delta*.55,-.2,.2),range[0],range[1]);
      applyJoint(bone);hand.updateMatrixWorld(true);
    }
  }
  const error=tipPoint(bones[2]).distanceTo(target);
  hand.userData.contacts.push({finger:prefix,target:target.toArray(),error});return error;
}
/** Bend the continuous user forearm toward the elbow, leaving fingers in place. */
export function aimForearm(hand:THREE.Object3D,shoulder:THREE.Vector3) {
  const bone=hand.getObjectByName('forearm') as THREE.Bone;
  const upper=hand.getObjectByName('upperarm') as THREE.Bone;
  if(!bone||!upper)return;
  const wrist=bone.getWorldPosition(new THREE.Vector3()),direction=shoulder.clone().sub(wrist);
  const lowerLength=bone.userData.length,upperLength=upper.userData.length,total=lowerLength+upperLength;
  // A small torso lean supplies unreachable camera poses; neither limb stretches.
  const distance=Math.min(total-.003,Math.max(.08,direction.length()));direction.normalize();
  const root=wrist.clone().addScaledVector(direction,distance);
  const along=(lowerLength**2-upperLength**2+distance**2)/(2*distance);
  const bend=new THREE.Vector3(hand.userData.side==='left'?-.4:.4,hand.userData.anchorMode==='inside'?1:-1,0);
  bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  const elbow=wrist.clone().addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,lowerLength**2-along**2)));
  for(const [joint,target] of [[bone,elbow],[upper,root]] as const){
    const local=joint.parent!.worldToLocal(target.clone()).sub(joint.position);
    const rest=joint.userData.restQuaternion as THREE.Quaternion;
    const restDirection=new THREE.Vector3(0,1,0).applyQuaternion(rest);
    joint.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(restDirection,local.normalize()).multiply(rest));joint.scale.set(1,1,1);
    hand.updateMatrixWorld(true);
  }
  hand.userData.armReach={wrist:wrist.toArray(),elbow:elbow.toArray(),shoulder:root.toArray(),lean:root.distanceTo(shoulder)};
}
