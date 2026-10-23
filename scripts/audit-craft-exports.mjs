import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

// Decode the files downloaded by the real playthrough. Format signatures alone
// cannot establish that a model has usable geometry, UVs and embedded textures.
const prefix=process.env.QA_PREFIX||'craft-chain-r19';
const chain=JSON.parse(await fs.readFile(`qa/${prefix}.json`,'utf8'));
assert(chain.passed,'audit a completed real-input playthrough');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),models=[];
for(const piece of chain.completed){
  const path=`qa/exports/${prefix}/${piece.form}.glb`,bytes=await fs.readFile(path),doc=await io.readBinary(bytes);
  const root=doc.getRoot(),node=root.listNodes().find(n=>n.getMesh());
  assert(node,'model node');
  const primitives=node.getMesh().listPrimitives(),stats=[];
  for(const primitive of primitives){
    const position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),uv=primitive.getAttribute('TEXCOORD_0');
    assert(position&&normal&&uv&&primitive.getIndices(),'indexed positions, normals and UVs');
    assert(position.getCount()>1000&&normal.getCount()===position.getCount()&&uv.getCount()===position.getCount());
    for(const attribute of [position,normal,uv])assert([...attribute.getArray()].every(Number.isFinite),'finite vertex attributes');
    const y=[],u=[];
    for(let i=0;i<position.getCount();i++){y.push(position.getElement(i,[])[1]);u.push(uv.getElement(i,[])[0]);}
    assert(Math.min(...u)<=0&&Math.max(...u)>=1,'inner and outer texture panels');
    const height=Math.max(...y)-Math.min(...y);
    assert(Math.abs(height-(piece.height+.012))<.02,'exported local height matches the crafted vessel');
    const material=primitive.getMaterial();
    assert(material?.getBaseColorTexture()&&material.getNormalTexture(),'paint and mineral normals embedded');
    stats.push({vertices:position.getCount(),triangles:primitive.getIndices().getCount()/3,heightBeforeShrink:height,material:material.getName()});
  }
  const metadata=root.listNodes().map(n=>n.getExtras()).find(e=>e.units==='metres');
  assert(metadata?.history?.length>5&&metadata.history.includes(piece.history[0]),'craft history and metric units');
  const textures=root.listTextures().map(texture=>{
    const size=texture.getSize(),image=texture.getImage();
    assert(size&&size[0]>=1024&&size[1]>=1024&&image?.length>0,'full embedded texture');
    return {size,bytes:image.length,mime:texture.getMimeType()};
  });
  models.push({form:piece.form,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),primitives:stats,textures,historyEntries:metadata.history.length});
}
await fs.writeFile(`qa/${prefix}-exports.json`,JSON.stringify({passed:true,method:'Decode downloaded GLBs with glTF Transform; validate mesh/UV/normal data, physical dimensions, embedded textures and craft history. This is a structural roundtrip, not a visual equivalence test for custom runtime shaders.',models},null,2));
console.log('EXPORT_STRUCTURE_PASS',models.map(m=>({form:m.form,bytes:m.bytes,textures:m.textures.length})));
