import * as THREE from 'three';
import type {Piece,Mark} from '../simulation/model';
import {glazeMean} from '../simulation/model';
export function ceramicGeometry(p:Piece){
  const points:THREE.Vector2[]=[];const h=p.height;
  points.push(new THREE.Vector2(0,0),new THREE.Vector2(p.radius[0]*0.83,0),new THREE.Vector2(p.radius[0]*0.83,0.012));
  for(let i=0;i<48;i++)points.push(new THREE.Vector2(p.radius[i],0.012+i/47*h));
  if(p.opened){
    for(let i=47;i>=0;i--)points.push(new THREE.Vector2(Math.max(0.005,p.radius[i]-p.thickness[i]),0.016+i/47*h));
    points.push(new THREE.Vector2(0,0.021));
  }else{
    points.push(new THREE.Vector2(p.radius[47]*0.7,h+0.023),new THREE.Vector2(0,h+0.028));
  }
  const g=new THREE.LatheGeometry(points,128);const pos=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){uv.setY(i,Math.max(0,Math.min(1,(pos.getY(i)-0.012)/h)));}
  if(p.defects.some(d=>d.startsWith('过火'))){for(let i=0;i<pos.count;i++){const f=pos.getY(i)/h;pos.setY(i,pos.getY(i)+Math.sin(Math.atan2(pos.getX(i),pos.getZ(i))*3)*0.012*f*f);}}
  g.computeVertexNormals();return g;
}
function stamp(ctx:CanvasRenderingContext2D,m:Mark,x:number,y:number,size:number){
  ctx.save();ctx.translate(x,y);ctx.scale(size,size);
  if(m.kind==='brush'){ctx.beginPath();ctx.arc(0,0,0.5,0,Math.PI*2);ctx.fill();}
  if(m.kind==='leaf'){ctx.rotate(-0.7);ctx.beginPath();ctx.moveTo(0,1.8);ctx.quadraticCurveTo(-1.3,-0.7,0,-2);ctx.quadraticCurveTo(1.1,-0.2,0,1.8);ctx.fill();ctx.lineWidth=0.06;ctx.beginPath();ctx.moveTo(0,2.2);ctx.lineTo(0,-2);ctx.stroke();}
  if(m.kind==='flower'){for(let a=0;a<6;a++){ctx.save();ctx.rotate(a*Math.PI/3);ctx.beginPath();ctx.ellipse(0,-1,0.5,0.9,0,0,Math.PI*2);ctx.stroke();ctx.restore();}ctx.beginPath();ctx.arc(0,0,0.24,0,Math.PI*2);ctx.fill();}
  if(m.kind==='wave'){ctx.lineWidth=0.15;for(let row=0;row<3;row++){ctx.beginPath();for(let j=-30;j<=30;j++){const xx=j/10;const yy=Math.sin(xx*2)*0.4+row*0.6;ctx.lineTo(xx,yy);}ctx.stroke();}}
  ctx.restore();
}
export class Ceramic extends THREE.Group{
  mesh:THREE.Mesh<THREE.LatheGeometry,THREE.MeshPhysicalMaterial>;
  canvas=document.createElement('canvas'); texture:THREE.CanvasTexture;signature='';
  constructor(public piece:Piece){super();this.canvas.width=2048;this.canvas.height=1024;this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;this.texture.wrapS=THREE.RepeatWrapping;this.texture.anisotropy=8;
    const mat=new THREE.MeshPhysicalMaterial({map:this.texture,roughness:0.65,clearcoat:0,side:THREE.DoubleSide});
    // Fine throwing rings and micro pores change with wetness, never a glass shell.
    const micro=document.createElement('canvas');micro.width=256;micro.height=256;const c=micro.getContext('2d')!;let seed=17;
    const im=c.createImageData(256,256);for(let i=0;i<im.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const y=Math.floor(i/4/256),v=125+(seed%20)+Math.sin(y*2)*7;im.data.set([v,v,v,255],i);}c.putImageData(im,0,0);const bump=new THREE.CanvasTexture(micro);bump.wrapS=bump.wrapT=THREE.RepeatWrapping;bump.repeat.set(3,6);mat.bumpMap=bump;mat.bumpScale=0.00065;
    this.mesh=new THREE.Mesh(ceramicGeometry(piece),mat);this.mesh.castShadow=this.mesh.receiveShadow=true;this.add(this.mesh);this.update(true);
  }
  update(force=false){const p=this.piece;const sig=[p.stage,p.height,p.radius.join(','),p.thickness.join(','),p.marks.length,p.glaze.join(','),p.defects.join(','),p.shrink].join('|');if(!force&&sig===this.signature)return;this.signature=sig;
    this.mesh.geometry.dispose();this.mesh.geometry=ceramicGeometry(p);this.scale.setScalar(p.shrink);
    const fired=['fired','packed'].includes(p.stage),wet=['raw','prepared','thrown'].includes(p.stage),glazed=['glazed','dry','loaded'].includes(p.stage);
    const ctx=this.canvas.getContext('2d')!;ctx.fillStyle=fired?'#e0e5dd':wet?'#82745e':glazed?'#c4c6b8':'#b9b5a1';ctx.fillRect(0,0,2048,1024);
    const mat=this.mesh.material;mat.roughness=fired?0.19:wet?0.34:glazed?0.53:0.85;mat.clearcoat=fired?0.85:wet?0.18:0;mat.clearcoatRoughness=0.18;mat.bumpScale=fired?0.00018:wet?0.0006:0.0009;
    for(const m of p.marks){ctx.fillStyle=ctx.strokeStyle=fired?`rgba(23,61,108,${m.ink*0.84})`:`rgba(44,47,47,${m.ink*0.80})`;ctx.lineWidth=Math.max(1,m.size*55);const x=m.u*2048,y=(1-m.v)*1024,size=m.size*1024;
      if(m.kind==='band'){ctx.fillRect(0,y-size*0.2,2048,size*0.4);ctx.fillRect(0,y+size,2048,size*0.16);}else for(const dx of [-2048,0,2048])stamp(ctx,m,x+dx,y,size);
    }
    if(glazed||fired){for(let i=0;i<192;i++){const layer=p.glaze[i];if(layer<0.25&&fired){ctx.fillStyle='rgba(120,112,93,0.28)';ctx.fillRect((i%16)*128,(11-Math.floor(i/16))*1024/12,129,1024/12+1);}else if(layer>1.2&&fired){ctx.fillStyle='rgba(179,195,180,0.18)';ctx.fillRect((i%16)*128,(11-Math.floor(i/16))*1024/12,129,1024/12+1);}}}
    if(fired&&p.defects.some(d=>d.startsWith('开裂'))){ctx.strokeStyle='#4e514a';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<12;i++)ctx.lineTo(700+Math.sin(i*1.7)*14,i*45);ctx.stroke();}
    if(fired&&p.defects.some(d=>d.startsWith('针孔'))){ctx.fillStyle='#7a8072';for(let i=0;i<90;i++){ctx.beginPath();ctx.arc((i*239)%2048,(i*173)%1024,1.5,0,7);ctx.fill();}}
    if(fired&&p.defects.some(d=>d.startsWith('欠火')))mat.roughness=0.74;
    if(fired&&glazeMean(p)>1.2)mat.clearcoatRoughness=0.28;
    this.texture.needsUpdate=true;
  }
  dispose(){this.mesh.geometry.dispose();this.mesh.material.bumpMap?.dispose();this.mesh.material.dispose();this.texture.dispose();}
}
