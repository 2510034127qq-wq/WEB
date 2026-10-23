import * as THREE from 'three';
import { modelLoader } from './model-loader';

/** Authored trees and understory arranged along the working lane and wall runoff. */
export async function makeWoodland(scene: THREE.Scene) {
  const loader=modelLoader();
  const ids=['fern_02','grass_bermuda_01','shrub_03','tree_stump_01'];
  const [pine,...understory]=await Promise.all([
    loader.loadAsync('/assets/woodland-pine.glb'),
    ...ids.map(id=>loader.loadAsync(`/assets/scans/${id}/${id}.gltf`)),
  ]);
  const [pineAlpha,grassAlpha]=await Promise.all(['pine-twig-alpha','grass-alpha'].map(async name=>{
    const texture=await new THREE.TextureLoader().loadAsync(`/assets/vegetation/${name}.png`);
    texture.flipY=false;texture.anisotropy=16;return texture;
  }));
  for(const [root,alpha,match] of [[pine.scene,pineAlpha,'pine_tree_01_twig'],[understory[1].scene,grassAlpha,'grass_bermuda_01']] as const) {
    root.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      for(const m of Array.isArray(o.material)?o.material:[o.material]) {
        const material=m as THREE.MeshStandardMaterial;
        if(material.name!==match)continue;
        material.alphaMap=alpha;material.alphaTest=match.includes('pine')?.08:.35;material.alphaToCoverage=true;material.needsUpdate=true;
      }
    });
  }
  const sources=new Map<string,THREE.Object3D>([['pine',pine.scene],...ids.map((id,i)=>[id,understory[i].scene] as [string,THREE.Object3D])]);
  const place=(id:string,x:number,z:number,height:number,angle:number)=>{
    const source=sources.get(id)!;
    const model=new THREE.Group();
    model.add((id==='fern_02'||id==='shrub_03'?source.children[Math.abs(Math.floor(angle*3))%source.children.length]:source).clone(true));
    const box=new THREE.Box3().setFromObject(model),
      size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=height/size.y;
    model.scale.multiplyScalar(scale);model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    const parent=new THREE.Group();parent.name='CC0_woodland_'+id;parent.add(model);
    parent.position.set(x,terrainHeight(x,z),z);parent.rotation.y=angle;
    parent.traverse(o=>{
      if(!(o instanceof THREE.Mesh)) return;
      o.castShadow=o.receiveShadow=true;
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        const mat=m as THREE.MeshStandardMaterial;
        if(mat.map)mat.map.anisotropy=16;
        if(mat.normalMap)mat.normalMap.anisotropy=8;
      }
    });scene.add(parent);
  };
  for(const [x,z,h,a] of [[-6,-14,12,.2],[5,-16,15,2.1],[14,-5,12,1.2],[-9,15,13,.8],[8,18,15,3.5],[13,23,12,4.7],[-15,26,15,2.8],[-3.6,22,8,1.6],[1.5,32,11,.6],[10,33,14,2.5],[-8,35,12,4.1],[-2,-22,11,2.9],[12,-27,13,.7],[-2.8,17.8,5.8,2.1],[6.4,24.8,6.5,.7],[-4.5,29,7.1,4.2],[13.5,37,10,3.1]])
    place('pine',x,z,h,a);
  // Fern colonies occupy sheltered tree bases and the damp wall/runoff edge.
  // Keep a worn carrying lane, but avoid making the forest into two planted hedges.
  const colonies=[[-5,12,2.4,1.7],[-8,17,3.2,3.1],[5.5,14.5,2.3,2.6],[9,22,4,3],
    [-4.5,23.5,3.6,3.5],[-9,30,4,4],[2,34,3.2,2.4],[12,32,4,4],[-13,22,3,3]];
  for(let c=0;c<colonies.length;c++)for(let i=0;i<16;i++){
    const [cx,cz,rx,rz]=colonies[c],angle=i*2.399+c*.87,r=Math.sqrt((i+.5)/16),
      x=cx+Math.cos(angle)*rx*r,z=cz+Math.sin(angle)*rz*r;
    if(Math.abs(x-pathCenter(z))<1.95)continue;
    const edge=r>.78;
    place(edge&&c%2===0?'shrub_03':'fern_02',x,z,edge?.55+(i%4)*.16:.42+(i%5)*.10,angle);
  }
  // Taller regrowth closes the forest floor beyond the bend; mature pine trunks
  // remain visible between it, and the lane disappears around the wooded rise.
  for(const [x,z,h,a] of [[-3,19,1.4,.8],[-5,22,1.7,2.3],[6,21,1.45,4.1],[9,25,1.8,1.4],[-5,28,1.65,5.2],[1,31,1.8,3.4],[6,36,1.9,2.6],[-9,26,1.5,4.8],[-12,29,1.9,.3],[12,32,1.8,2.8]])
    place('shrub_03',x,z,h,a);
  for(let i=0;i<12;i++){
    const x=-8+i*1.45,z=-10.1-(i%3)*.7;
    place('fern_02',x,z,.44+(i%4)*.08,i*1.7);
  }
  place('tree_stump_01',-4.3,12.4,.61,.8);
  place('tree_stump_01',8.1,18.3,.47,2.4);
  const blades=understory[1].scene.children.filter(o=>/medium|small/.test(o.name)) as THREE.Mesh[];
  const dummy=new THREE.Object3D();
  for(let b=0;b<blades.length;b++) {
    const source=blades[b],geometry=source.geometry.clone();
    geometry.computeBoundingBox();
    const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3());
    geometry.translate(-center.x,-box.min.y,-center.z);
    const mesh=new THREE.InstancedMesh(geometry,source.material,240);
    mesh.castShadow=mesh.receiveShadow=true;
    for(let i=0;i<240;i++){
      const k=i*blades.length+b,side=k%2?-1:1,z=9.8+(k*.057)%30,
        x=pathCenter(z)+side*(1.65+((k*1.618)%1)*10.2);
      dummy.position.set(x,terrainHeight(x,z),z);dummy.rotation.set(0,k*2.399,0);
      dummy.scale.setScalar(1.3+((k*.719)%1)*1.2);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    }
    scene.add(mesh);
  }
}

export function pathCenter(z:number) {
  return z>8?Math.max(0,z-15)*.13+Math.sin((z-8)*.12)*1.5+THREE.MathUtils.smoothstep(z,20,38)*6:0;
}

export function terrainHeight(x:number,z:number) {
  const d=Math.hypot(x,z),rise=THREE.MathUtils.smoothstep(d,10,25);
  // A shallow drainage bank at the court and a wooded rise beyond the lane.
  return -.14+rise*(.36+Math.sin(x*.13)*Math.cos(z*.1)*.28)
    +THREE.MathUtils.smoothstep(d,24,60)*(3+Math.sin(x*.06+z*.04)*1.6)
    +THREE.MathUtils.smoothstep(z,17,36)*(2.4+.6*Math.cos(x*.15));
}
