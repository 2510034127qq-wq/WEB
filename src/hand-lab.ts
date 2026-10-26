import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {modelLoader} from './render/model-loader';
import {initializeHand,poseHand,solveFingerContact,gripTool,fingerTip,FINGERS,type HandPose} from './render/hand-contact';

const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#303735');
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.01,10);camera.position.set(0,.72,.08);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,-.015);controls.update();
scene.add(new THREE.HemisphereLight(0xffffff,0x4b5854,1));
for(const [x,y,z,intensity] of [[-.4,.5,-.2,3],[.4,.3,.2,1.2]]){const light=new THREE.DirectionalLight(0xffffff,intensity);light.position.set(x,y,z);scene.add(light);}
let pose:HandPose='open',bonesVisible=false;const hands:THREE.Object3D[]=[],helpers:THREE.SkeletonHelper[]=[],targets:THREE.Mesh[]=[];
for(const [key,label] of [['open','1 张手'],['fist','2 握拳'],['pinch','3 捏合'],['tool','4 握笔'],['wheel','5 拉坯']] as const){const b=document.createElement('button');b.textContent=label;b.dataset.pose=key;b.onclick=()=>{pose=key;};document.querySelector('#poses')!.append(b);}
document.querySelector('#skeleton')!.addEventListener('click',()=>{bonesVisible=!bonesVisible;helpers.forEach(h=>h.visible=bonesVisible);});
window.addEventListener('keydown',e=>{const p=(['open','fist','pinch','tool','wheel'] as HandPose[])[Number(e.key)-1];if(p)pose=p;});
for(const [i,side] of (['left','right'] as const).entries()){
 const [asset,info]=await Promise.all([modelLoader().loadAsync(`/assets/user-${side}-hand.glb`),fetch(`/assets/user-${side}-hand-rig.json`).then(r=>r.json())]);
 const hand=asset.scene;initializeHand(hand,info.boneLengths,side);hand.position.x=i===0?-.125:.125;scene.add(hand);hands.push(hand);
 const helper=new THREE.SkeletonHelper(hand);helper.visible=false;scene.add(helper);helpers.push(helper);
 const target=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.13,32),new THREE.MeshStandardMaterial({color:'#513622',roughness:.55}));target.rotation.x=Math.PI/2;scene.add(target);targets.push(target);
}
const clock=new THREE.Clock();
function tick(){const dt=Math.min(.05,clock.getDelta());for(const [i,hand] of hands.entries()){
 hand.position.set(i===0?-.125:.125,0,0);hand.quaternion.identity();
 poseHand(hand,pose,dt);const sign=hand.userData.side==='left'?-1:1;
 if(pose==='pinch'||pose==='tool'){
   const center=fingerTip(hand,'finger0_2').add(fingerTip(hand,'thumb_2')).multiplyScalar(.5);targets[i].position.copy(center);targets[i].visible=pose==='tool';
   if(pose==='tool'){
     const shaft=(hand.userData.toolAxis as THREE.Vector3).clone().applyQuaternion(hand.quaternion);
     gripTool(hand,center,shaft,new THREE.Vector3(hand.position.x,-.1,.3));
     targets[i].quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),shaft);
   }else for(const [name,dx] of [['thumb',sign*.005],['finger0',-sign*.005]] as const)solveFingerContact(hand,name,center.clone().add(new THREE.Vector3(dx,0,0)));
 }else targets[i].visible=false;
 }
 document.querySelector('output')!.textContent=hands.map(h=>`${h.userData.side}: ${pose} · 23 骨骼\n${h.userData.contacts.map((c:{finger:string,error:number})=>`${c.finger} ${(c.error*1000).toFixed(1)}mm`).join(' · ')}`).join('\n');
 renderer.render(scene,camera);requestAnimationFrame(tick);
}tick();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
(window as unknown as {__HAND_LAB__:unknown}).__HAND_LAB__={inspect:()=>({pose,hands:hands.map(h=>({side:h.userData.side,determinant:h.matrixWorld.determinant(),contacts:h.userData.contacts,joints:FINGERS.flatMap(f=>[0,1,2].map(j=>{const b=h.getObjectByName(`${f}_${j}`)!;return {name:b.name,flex:b.userData.flex,spread:b.userData.spread,opposition:b.userData.opposition};})),tips:FINGERS.map(f=>fingerTip(h,`${f}_2`).toArray())}))})};
