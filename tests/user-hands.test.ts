/// <reference types="node" />
import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import * as THREE from 'three';
import {initializeHand,poseHand,aimForearm,gripTool,fingerTip} from '../src/render/hand-contact';

async function load(side:'left'|'right'){
 await MeshoptDecoder.ready;
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const doc=await io.read(`public/assets/user-${side}-hand.glb`),root=doc.getRoot();
 const info=JSON.parse(await readFile(`public/assets/user-${side}-hand-rig.json`,'utf8'));
 const joints=new Set(root.listSkins().flatMap(s=>s.listJoints()));
 const nodes=new Map(root.listNodes().map(n=>{const o=joints.has(n)?new THREE.Bone():new THREE.Group();o.name=n.getName();new THREE.Matrix4().fromArray(n.getMatrix()).decompose(o.position,o.quaternion,o.scale);return[n,o] as const;}));
 for(const [n,o] of nodes)for(const c of n.listChildren())o.add(nodes.get(c)!);
 const hand=new THREE.Group();for(const n of root.listScenes()[0].listChildren())hand.add(nodes.get(n)!);
 initializeHand(hand,info.boneLengths,side);return {doc,info,hand};
}
describe('user supplied skeletal hands',()=>{
 for(const side of ['left','right'] as const){
  it(`${side}: original source mapping, complete skin and editable poses`,async()=>{
   const {doc,info}=await load(side);
   expect(info.sourceFile.replaceAll('\\','/')).toBe(`art/user-hands/${side}/hand_3d_model_${side}.fbx`);
   expect(createHash('sha256').update(await readFile(info.sourceFile)).digest('hex')).toBe(info.sourceSha256);
   expect(doc.getRoot().listSkins()[0].listJoints()).toHaveLength(23);
   expect(doc.getRoot().listAnimations().map(a=>a.getName()).sort()).toEqual(['fist','open','pinch']);
   for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
    const weights=p.getAttribute('WEIGHTS_0')!,indices=p.getAttribute('JOINTS_0')!;
    expect(weights.getCount()).toBe(p.getAttribute('POSITION')!.getCount());
    for(let i=0;i<weights.getCount();i++){
     const values=weights.getElement(i,[]);expect(values.reduce((a,b)=>a+b,0)).toBeCloseTo(1,5);
     expect(indices.getElement(i,[]).every(v=>v>=0&&v<23)).toBe(true);
    }
   }
  });
  it(`${side}: live tripod contact and fixed arm lengths`,async()=>{
   const {hand}=await load(side);for(let i=0;i<30;i++)poseHand(hand,'tool',.1);
   const center=fingerTip(hand,'thumb_2').add(fingerTip(hand,'finger0_2')).multiplyScalar(.5);
   const shaft=(hand.userData.toolAxis as THREE.Vector3).clone();
   for(let frame=0;frame<60;frame++){poseHand(hand,'tool',1/60);gripTool(hand,center,shaft,new THREE.Vector3(0,-.2,.3));}
   expect(Math.max(...hand.userData.contacts.filter((c:{finger:string})=>c.finger!=='finger1').map((c:{error:number})=>c.error))).toBeLessThan(.006);
   aimForearm(hand,new THREE.Vector3(side==='left'?-.15:.15,-.15,.42));
   const a=hand.userData.armReach;
   expect(new THREE.Vector3(...a.wrist).distanceTo(new THREE.Vector3(...a.elbow))).toBeCloseTo(.255,5);
   expect(new THREE.Vector3(...a.elbow).distanceTo(new THREE.Vector3(...a.shoulder))).toBeCloseTo(.29,5);
   for(const name of ['forearm','upperarm'])expect(hand.getObjectByName(name)!.scale.toArray()).toEqual([1,1,1]);
   expect(hand.matrixWorld.determinant()).toBeGreaterThan(0);
  });
 }
});
