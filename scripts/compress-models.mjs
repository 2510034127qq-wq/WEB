import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

// No quantization, simplification, resampling or lossy Meshopt filters.
// The QUANTIZE extension mode only encodes existing bytes unless a separate
// quantize() transform is applied. We deliberately do not apply that transform.
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder,
});
const hash=b=>createHash('sha256').update(b).digest('hex');
function evidence(doc) {
  return {
    primitives:doc.getRoot().listMeshes().flatMap(mesh=>mesh.listPrimitives().map(p=>({
      mode:p.getMode(),
      attributes:p.listSemantics().sort().map(name=>{
        const a=p.getAttribute(name),v=a.getArray();
        return [name,a.getType(),a.getNormalized(),hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))];
      }),
      triangles:(()=>{
        const a=p.getIndices()?.getArray();if(!a)return null;
        const out=new Uint32Array(a.length);
        for(let i=0;i<a.length;i+=3){
          const tri=[a[i],a[i+1],a[i+2]],min=tri.indexOf(Math.min(...tri));
          for(let k=0;k<3;k++)out[i+k]=tri[(k+min)%3];
        }
        return {count:a.length,hash:hash(Buffer.from(out.buffer))};
      })(),
    }))),
    textures:doc.getRoot().listTextures().map(t=>hash(t.getImage())),
    nodes:doc.getRoot().listNodes().map(n=>({name:n.getName(),matrix:n.getMatrix()})),
  };
}
await fs.mkdir('art/exports',{recursive:true});
const reports=JSON.parse(await fs.readFile('qa/model-compression.json','utf8').catch(()=>'{}')).reports||[];
for(const name of process.argv.slice(2).length?process.argv.slice(2):['workshop','hands','craft-tools','woodland-pine','potters-wheel']) {
  const output=`public/assets/${name}.glb`,source=`art/exports/${name}.glb`;
  let doc=await io.read(output);
  const compressed=doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='EXT_meshopt_compression');
  if(compressed)doc=await io.read(source);else await fs.copyFile(output,source);
  const before=evidence(doc),inputBytes=(await fs.stat(source)).size;
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  const candidate=`.tmp/${name}-meshopt.glb`;
  await io.write(candidate,doc);
  const decoded=await io.read(candidate),after=evidence(decoded);
  assert.deepEqual(after.primitives,before.primitives,`${name}: mesh attributes and oriented triangles must remain exact`);
  assert.deepEqual(after.textures,before.textures,`${name}: embedded image bytes must remain exact`);
  assert.deepEqual(after.nodes.map(n=>n.name),before.nodes.map(n=>n.name));
  const transformMaxAbsDiff=Math.max(...after.nodes.flatMap((n,i)=>n.matrix.map((v,j)=>Math.abs(v-before.nodes[i].matrix[j]))));
  // glTF Transform's writer normalizes nearly-unit Blender node scales. Bound
  // this floating-point representation change separately from geometry bytes.
  assert(transformMaxAbsDiff<.000005,`${name}: node transform changed beyond floating-point tolerance`);
  await fs.copyFile(candidate,output);
  const report={name,inputBytes,outputBytes:(await fs.stat(output)).size,attributesAndImagesExact:true,transformMaxAbsDiff,sha256:hash(await fs.readFile(output))};
  const previous=reports.findIndex(r=>r.name===name);
  if(previous>=0)reports[previous]=report;else reports.push(report);
  console.log(JSON.stringify(report));
}
await fs.writeFile('qa/model-compression.json',JSON.stringify({method:'Meshopt byte compression without quantization or filters. Exact attribute/image comparison and cyclic-normalized triangle comparison after decode. Node matrices checked separately within 5e-6 absolute floating-point tolerance.',reports},null,2));
