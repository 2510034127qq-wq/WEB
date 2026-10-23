import * as THREE from 'three';
import { pathCenter, terrainHeight } from './woodland';

/** A worn carrying lane through leaf litter. Both surfaces keep their measured scale. */
export async function makeTerrain(scene: THREE.Scene) {
  const loader=new THREE.TextureLoader();
  const maps: Record<string,THREE.Texture>={};
  await Promise.all(['path','litter'].flatMap(surface=>['diff','normal','rough','ao','height'].map(async channel=>{
    const texture=await loader.loadAsync(`/assets/terrain/${surface}_${channel}.jpg`);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=16;
    if(channel==='diff')texture.colorSpace=THREE.SRGBColorSpace;
    maps[`${surface}_${channel}`]=texture;
  })));
  const sampleHeight=(texture:THREE.Texture)=>{
    const image=texture.image as HTMLImageElement;
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0);
    const {data}=context.getImageData(0,0,image.width,image.height);
    return (x:number,z:number,metres:number)=>{
      const u=((x/metres)%1+1)%1,v=((z/metres)%1+1)%1;
      return data[(Math.floor(v*image.height)*image.width+Math.floor(u*image.width))*4]/255;
    };
  };
  const pathHeight=sampleHeight(maps.path_height),litterHeight=sampleHeight(maps.litter_height);
  const geometry=new THREE.PlaneGeometry(180,180,480,480);geometry.rotateX(-Math.PI/2);
  const points=geometry.attributes.position;
  for(let i=0;i<points.count;i++) {
    const x=points.getX(i),z=points.getZ(i),
      edge=THREE.MathUtils.smoothstep(Math.abs(x-pathCenter(z)),1.35,2.65),
      cover=z>8?edge:1;
    const relief=THREE.MathUtils.lerp(pathHeight(x,z,1.3)*.016,litterHeight(x,z,2.3)*.034,cover);
    points.setY(i,terrainHeight(x,z)+relief);
  }
  geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({map:maps.path_diff,normalMap:maps.path_normal,roughnessMap:maps.path_rough,
    aoMap:maps.path_ao,aoMapIntensity:.6,roughness:1,normalScale:new THREE.Vector2(.75,.75)});
  material.onBeforeCompile=shader=>{
    for(const channel of ['diff','normal','rough','ao'])shader.uniforms[`litter_${channel}`]={value:maps[`litter_${channel}`]};
    shader.vertexShader='varying vec3 terrainPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPosition=position;');
    shader.fragmentShader=`varying vec3 terrainPosition;
      uniform sampler2D litter_diff,litter_normal,litter_rough,litter_ao;
      vec2 pathUV,litterUV;float leafCover;\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      pathUV=terrainPosition.xz/1.3;litterUV=terrainPosition.xz/2.3;
      float centre=terrainPosition.z>8.?max(0.,terrainPosition.z-15.)*.13+sin((terrainPosition.z-8.)*.12)*1.5+smoothstep(20.,38.,terrainPosition.z)*6.:0.;
      leafCover=terrainPosition.z>8.?smoothstep(1.35,2.65,abs(terrainPosition.x-centre)):1.;
      diffuseColor*=mix(texture2D(map,pathUV),texture2D(litter_diff,litterUV),leafCover);
    `).replace('#include <roughnessmap_fragment>',`
      float roughnessFactor=roughness*mix(texture2D(roughnessMap,pathUV).g,texture2D(litter_rough,litterUV).g,leafCover);
    `).replace('#include <normal_fragment_maps>',`
      vec3 mapN=normalize(mix(texture2D(normalMap,pathUV).xyz*2.-1.,texture2D(litter_normal,litterUV).xyz*2.-1.,leafCover));
      mapN.xy*=normalScale;normal=normalize(tbn*mapN);
    `).replace('#include <aomap_fragment>',`
      float terrainAO=mix(texture2D(aoMap,pathUV).r,texture2D(litter_ao,litterUV).r,leafCover);
      reflectedLight.indirectDiffuse*=mix(1.,terrainAO,aoMapIntensity);
    `);
  };
  const soil=new THREE.Mesh(geometry,material);soil.name='woodland_litter_and_carrying_path';soil.receiveShadow=true;scene.add(soil);
}
