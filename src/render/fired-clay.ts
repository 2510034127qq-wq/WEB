import * as THREE from 'three';

let maps:Promise<THREE.Texture[]>|undefined;
export function loadClay005Maps(){
  return maps??=Promise.all(['Color','NormalGL','Roughness'].map(async channel=>{
    const map=await new THREE.TextureLoader().loadAsync(`/assets/clay-surfaces/Clay005_4K-JPG_${channel}.jpg`);
    if(channel==='Color')map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.flipY=false;map.anisotropy=16;return map;
  }));
}

/** Restore metric cylindrical UVs on complete vessel islands in the authored
 * static workshop. Keep positions, normals and baked LightUV exactly intact.
 * Flat construction parts retain their existing planar UVs.
 */
export function metricVesselUV(mesh:THREE.Mesh){
  const source=mesh.geometry,index=source.index,position=source.attributes.position;
  if(!index||!source.attributes.uv)return;
  const parent=Int32Array.from({length:position.count},(_,i)=>i);
  const find=(i:number):number=>parent[i]===i?i:(parent[i]=find(parent[i]));
  for(let i=0;i<index.count;i+=3){const a=find(index.getX(i));parent[find(index.getX(i+1))]=a;parent[find(index.getX(i+2))]=a;}
  mesh.updateWorldMatrix(true,false);
  const bounds=new Map<number,THREE.Box3>(),counts=new Map<number,number>(),world=new THREE.Vector3();
  for(let i=0;i<position.count;i++){
    const root=find(i);world.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    if(!bounds.has(root))bounds.set(root,new THREE.Box3());bounds.get(root)!.expandByPoint(world);
    counts.set(root,(counts.get(root)||0)+1);
  }
  const vessels=new Map<number,{center:THREE.Vector3;radius:number;base:number}>();
  for(const [id,box] of bounds){
    const size=box.getSize(new THREE.Vector3());
    if((counts.get(id)||0)>500&&size.y>.03&&size.y<1&&size.x/size.z>.93&&size.x/size.z<1.07)
      vessels.set(id,{center:box.getCenter(new THREE.Vector3()),radius:(size.x+size.z)/4,base:box.min.y});
  }
  if(!vessels.size)return;
  const output=source.toNonIndexed(),uv=output.attributes.uv;
  output.deleteAttribute('tangent'); // Derive TBN from the new UVs, never reuse old tangents.
  const triangle=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  const normal=new THREE.Vector3(),edge=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){
    const vessel=vessels.get(find(index.getX(i)));if(!vessel)continue;
    for(let j=0;j<3;j++)triangle[j].fromBufferAttribute(position,index.getX(i+j)).applyMatrix4(mesh.matrixWorld);
    normal.subVectors(triangle[1],triangle[0]).cross(edge.subVectors(triangle[2],triangle[0])).normalize();
    const angles=triangle.map(v=>Math.atan2(v.z-vessel.center.z,v.x-vessel.center.x));
    const seam=Math.max(...angles)-Math.min(...angles)>Math.PI;
    for(let j=0;j<3;j++){
      const v=triangle[j],angle=angles[j]+(seam&&angles[j]<0?Math.PI*2:0);
      if(Math.abs(normal.y)>.92)uv.setXY(i+j,(v.x-vessel.center.x)/.2,(v.z-vessel.center.z)/.2);
      else uv.setXY(i+j,angle*vessel.radius/.2,(v.y-vessel.base)/.2);
    }
  }
  mesh.geometry=output;
}

export async function firedClayMaterial(){
  const [map,normalMap,roughnessMap]=await loadClay005Maps();
  return new THREE.MeshStandardMaterial({name:'scanned_fired_clay_20cm',map,normalMap,roughnessMap,
    color:'#b9aaa0',roughness:.92,normalScale:new THREE.Vector2(.48,.48),metalness:0});
}
