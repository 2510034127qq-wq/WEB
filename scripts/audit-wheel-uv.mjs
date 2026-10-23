import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const doc=await io.read('public/assets/potters-wheel.glb'),meshes=[];
for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){
 const uv=p.getAttribute('TEXCOORD_0').getArray(),pos=p.getAttribute('POSITION').getArray(),indices=p.getIndices().getArray();
 let degenerate=0,zeroArea=0;
 for(let i=0;i<indices.length;i+=3){
  const [a,b,c]=indices.slice(i,i+3),u=[uv[b*2]-uv[a*2],uv[b*2+1]-uv[a*2+1]],v=[uv[c*2]-uv[a*2],uv[c*2+1]-uv[a*2+1]];
  const ab=[0,1,2].map(k=>pos[b*3+k]-pos[a*3+k]),ac=[0,1,2].map(k=>pos[c*3+k]-pos[a*3+k]);
  const area=Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]);
  if(area<1e-12){zeroArea++;continue;}
  if(Math.abs(u[0]*v[1]-u[1]*v[0])<1e-12)degenerate++;
 }
 meshes.push({mesh:m.getName(),material:p.getMaterial()?.getName(),triangles:indices.length/3,zeroArea,degenerateUV:degenerate});
}
await fs.writeFile('qa/wheel-uv.json',JSON.stringify({method:'Count nonzero-area triangles with zero UV area after export. Does not certify seam quality or correct end grain.',meshes},null,2));
console.log(JSON.stringify(meshes));
