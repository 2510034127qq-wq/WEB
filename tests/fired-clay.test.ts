import {it,expect} from 'vitest';
import * as THREE from 'three';
import {metricVesselUV} from '../src/render/fired-clay';

it('changes vessel surface UV scale without changing triangles, normals or baked lighting coordinates',()=>{
  const geometry=new THREE.CylinderGeometry(.28,.28,.35,128,50,true);
  geometry.setAttribute('uv1',geometry.attributes.uv.clone());
  const before=geometry.toNonIndexed();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());
  mesh.rotation.x=.0;mesh.position.set(6,.495,5);
  metricVesselUV(mesh);
  for(const name of ['position','normal','uv1'])
    expect(Array.from(mesh.geometry.attributes[name].array)).toEqual(Array.from(before.attributes[name].array));
  const uv=mesh.geometry.attributes.uv;
  const v=Array.from({length:uv.count},(_,i)=>uv.getY(i));
  expect(Math.max(...v)-Math.min(...v)).toBeCloseTo(.35/.2,5);
  for(let i=0;i<uv.count;i+=3){
    const u=[uv.getX(i),uv.getX(i+1),uv.getX(i+2)];
    expect(Math.max(...u)-Math.min(...u)).toBeLessThan(.08);
  }
});
