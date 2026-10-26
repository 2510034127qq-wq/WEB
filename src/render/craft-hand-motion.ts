import * as THREE from 'three';
import type {Piece} from '../simulation/model';
import {fingerTip,solveFingerContact} from './hand-contact';

const up=new THREE.Vector3(0,1,0);
function radiusAt(p:Piece,height:number) {
 const f=THREE.MathUtils.clamp((height-.012*p.shrink)/(p.height*p.shrink),0,1)*47;
 const i=Math.min(46,Math.floor(f));return THREE.MathUtils.lerp(p.radius[i],p.radius[i+1],f-i)*p.shrink;
}
/** Move the palm using a pad anchor, then solve each digit onto the current clay
 * profile. Targets follow the deformed vessel instead of a fixed grab animation. */
export function contactVessel(hand:THREE.Object3D,p:Piece,center:THREE.Vector3,toward:THREE.Vector3,side:number,height:number,mode:'wheel'|'rim'|'inside',dt:number) {
 const right=new THREE.Vector3(toward.z,0,-toward.x);
 const radial=right.multiplyScalar((mode==='inside'?1:side)*.8).addScaledVector(toward,.6).normalize();
 const backward=mode==='inside'?up.clone().addScaledVector(radial,-.25).normalize():toward.clone().multiplyScalar(.8).addScaledVector(radial,.5).addScaledVector(up,mode==='rim'?-.3:-.35).normalize();
 const palm=radial.clone().multiplyScalar(mode==='inside'?1:-1);
 // The wrist points back and out toward the same-side elbow. A perfectly
 // wall-normal palm forced both wrists inward and made the forearms cross.
 palm.addScaledVector(backward,-palm.dot(backward)).normalize();
 const across=new THREE.Vector3().crossVectors(palm,backward).normalize();
 const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,palm,backward));
 const cache=hand.userData.anchorMode?hand.userData.anchorQuaternion as THREE.Quaternion:undefined;
 if(cache)cache.slerp(q,1-Math.exp(-dt*16));else hand.userData.anchorQuaternion=q.clone();
 hand.quaternion.copy(hand.userData.anchorQuaternion);
 const thicknessAtHeight=p.thickness[Math.min(47,Math.max(0,Math.round(height/(p.height*p.shrink)*47)))]*p.shrink;
 const target=center.clone().addScaledVector(radial,radiusAt(p,height)+(mode==='inside'?-thicknessAtHeight-.005:.005));target.y=center.y+height;
 let anchor=hand.userData.anchorMode?hand.userData.padAnchor as THREE.Vector3:undefined;
 if(anchor)anchor.lerp(target,1-Math.exp(-dt*14));else anchor=target.clone();
 hand.userData.padAnchor=anchor;hand.userData.anchorMode=mode;
 hand.updateMatrixWorld(true);
 hand.position.add(anchor.clone().sub(fingerTip(hand,'finger1_2')));hand.updateMatrixWorld(true);
 for(const finger of ['finger0','finger1','finger2','finger3','thumb']){
   const tip=fingerTip(hand,`${finger}_2`),local=tip.clone().sub(center);
   const y=THREE.MathUtils.clamp(local.y,.025*p.shrink,p.height*p.shrink+.006);
   const normal=new THREE.Vector3(local.x,0,local.z).normalize();
   const thickness=p.thickness[Math.min(47,Math.round(y/(p.height*p.shrink)*47))]*p.shrink;
   // On dipping, the thumb opposes the fingertips across the physical rim.
   const r=radiusAt(p,y)+(mode==='inside'||(mode==='rim'&&finger==='thumb')?-thickness-.004:.005);
   const goal=center.clone().addScaledVector(normal,r);goal.y=center.y+y;
   solveFingerContact(hand,finger,goal);
 }
}

export function contactClay(hand:THREE.Object3D,p:Piece,center:THREE.Vector3,toward:THREE.Vector3,side:number,press:number,dt:number){
 const right=new THREE.Vector3(toward.z,0,-toward.x),palm=new THREE.Vector3(0,-1,0);
 const across=new THREE.Vector3().crossVectors(palm,toward).normalize();
 hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,palm,toward));
 const target=center.clone().addScaledVector(right,side*Math.min(.05,p.radius[20]*.35)).addScaledVector(toward,.015-.035*press);
 target.y=center.y+p.height*(1+.09*Math.sin(press*Math.PI))+.008-.012*press;
 const previous=hand.userData.anchorMode==='clay'?hand.userData.padAnchor as THREE.Vector3:undefined;
 if(previous)previous.lerp(target,1-Math.exp(-dt*18));
 hand.userData.padAnchor=previous||target;hand.userData.anchorMode='clay';
 hand.updateMatrixWorld(true);
 const palmPad=hand.localToWorld(new THREE.Vector3(0,.012,-.015));
 hand.position.add((hand.userData.padAnchor as THREE.Vector3).clone().sub(palmPad));hand.updateMatrixWorld(true);
 // Fingers drape over the far slope of the lump while the heel supplies pressure.
 for(const name of ['finger0','finger1','finger2','finger3']){
   const tip=fingerTip(hand,`${name}_2`),local=tip.clone().sub(center);
   const y=THREE.MathUtils.clamp(local.y,.04,p.height*.88),normal=new THREE.Vector3(local.x,0,local.z).normalize();
   const goal=center.clone().addScaledVector(normal,radiusAt(p,y)+.004);goal.y=center.y+y;
   solveFingerContact(hand,name,goal);
 }
}
