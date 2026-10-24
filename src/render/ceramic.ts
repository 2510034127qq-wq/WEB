import * as THREE from "three";
import type { Piece, Mark } from "../simulation/model";
import { glazeMean } from "../simulation/model";
const ceramicAudit = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('ceramic-audit');
const mineralSources = new Map<string, THREE.Texture>();
function clayMap(channel: string) {
  let source=mineralSources.get(channel);
  if(!source) {
    source=new THREE.TextureLoader().load(`/assets/clay-surfaces/Clay005_4K-JPG_${channel}.jpg`);
    if(channel==='Color') source.colorSpace=THREE.SRGBColorSpace;
    mineralSources.set(channel,source);
  }
  const map=source.clone();map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=16;
  return map;
}
export function ceramicGeometry(p: Piece) {
  const points: THREE.Vector2[] = [];
  const h = p.height;
  points.push(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(p.radius[0] * 0.83, 0),
    new THREE.Vector2(p.radius[0] * 0.83, 0.012),
  );
  const thrown = !['raw','prepared'].includes(p.stage), fired=['fired','packed'].includes(p.stage);
  const profileRadius=(i:number) => {
    const row=Math.min(46,Math.floor(i)),f=i-row,y=i/47*h;
    // Interpolate the player's profile continuously, without introducing an
    // equal-pitch corrugation over untouched clay.
    const a=p.radius[Math.max(0,row-1)],b=p.radius[row],c=p.radius[row+1],d=p.radius[Math.min(47,row+2)];
    const radius=THREE.MathUtils.clamp(.5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f),Math.min(b,c),Math.max(b,c));
    let relief=0;
    if(thrown)for(const trace of p.wheelTraces||[]) {
      const distance=(y-trace.v*h)/(trace.width*.5);
      // Pressed band and the displaced lip on either side conserve local shape.
      relief+=trace.depth*(.45*Math.exp(-(((Math.abs(distance)-1.1)/.45)**2))-Math.exp(-distance*distance*2));
    }
    return radius+THREE.MathUtils.clamp(relief,-.0005,.0005)*(fired?.28:1);
  };
  const rows=Math.max(188,Math.ceil(h/.0015));
  for (let i = 0; i <= rows; i++)
    points.push(new THREE.Vector2(profileRadius(i/rows*47), 0.012 + i/rows*h));
  let insideStart = points.length;
  if (p.opened) {
    const outer = p.radius[47], thickness = p.thickness[47], center = outer - thickness * .5;
    // A rolled lip has a real cross section. The opening remains hollow.
    for (let j = 1; j <= 10; j++) {
      const a = Math.PI * j / 10;
      points.push(new THREE.Vector2(center + Math.cos(a) * thickness * .5, h + .012 + Math.sin(a) * thickness * .5));
    }
    insideStart = points.length;
    for (let k = rows; k >= 0; k--) {
      const i=k/rows*47,row=Math.min(46,Math.floor(i)), f=i-row;
      points.push(
        new THREE.Vector2(
          Math.max(0.005, profileRadius(i) - (p.thickness[row]*(1-f)+p.thickness[row+1]*f)),
          0.016 + (i / 47) * h,
        ),
      );
    }
    points.push(new THREE.Vector2(0, 0.021));
  } else {
    points.push(
      new THREE.Vector2(p.radius[47] * 0.7, h + 0.023),
      new THREE.Vector2(0, h + 0.028),
    );
  }
  const g = new THREE.LatheGeometry(points, 128);
  const pos = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const inside = p.opened && i % points.length >= insideStart;
    uv.setX(i, uv.getX(i) * 0.5 + (inside ? 0.5 : 0));
    uv.setY(i, Math.max(0, Math.min(1, (pos.getY(i) - 0.012) / h)));
  }
  if (p.defects.some((d) => d.startsWith("过火"))) {
    for (let i = 0; i < pos.count; i++) {
      const f = pos.getY(i) / h;
      pos.setY(
        i,
        pos.getY(i) +
          Math.sin(Math.atan2(pos.getX(i), pos.getZ(i)) * 3) * 0.012 * f * f,
      );
    }
  }
  g.computeVertexNormals();
  const normals = g.attributes.normal;
  for (let j = 0; j < points.length; j++) {
    const last = 128 * points.length + j,
      n = new THREE.Vector3()
        .fromBufferAttribute(normals, j)
        .add(new THREE.Vector3().fromBufferAttribute(normals, last))
        .normalize();
    normals.setXYZ(j, n.x, n.y, n.z);
    normals.setXYZ(last, n.x, n.y, n.z);
  }
  return g;
}
function stamp(
  ctx: CanvasRenderingContext2D,
  m: Mark,
  x: number,
  y: number,
  size: number,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  if (m.kind === "brush") {
    ctx.beginPath();
    ctx.arc(0, 0, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.kind === "leaf") {
    ctx.rotate(-0.7);
    ctx.beginPath();
    ctx.moveTo(0, 1.8);
    ctx.quadraticCurveTo(-1.3, -0.7, 0, -2);
    ctx.quadraticCurveTo(1.1, -0.2, 0, 1.8);
    ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(0, 2.2);
    ctx.lineTo(0, -2);
    ctx.stroke();
  }
  if (m.kind === "flower") {
    for (let a = 0; a < 6; a++) {
      ctx.save();
      ctx.rotate((a * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -1, 0.5, 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
    ctx.fill();
  }
  if (m.kind === "wave") {
    ctx.lineWidth = 0.15;
    for (let row = 0; row < 3; row++) {
      ctx.beginPath();
      for (let j = -30; j <= 30; j++) {
        const xx = j / 10;
        const yy = Math.sin(xx * 2) * 0.4 + row * 0.6;
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}
export class Ceramic extends THREE.Group {
  mesh: THREE.Mesh<THREE.LatheGeometry, THREE.MeshPhysicalMaterial>;
  canvas = document.createElement("canvas");
  texture: THREE.CanvasTexture;
  private roughnessTexture: THREE.Texture;
  private mineralNormal: THREE.Texture;
  private mineralAlbedo: THREE.Texture;
  signature = "";
  private shapeSignature = '';
  private glazeField = document.createElement('canvas');
  constructor(public piece: Piece) {
    super();
    this.canvas.width = 2048;
    this.canvas.height = 1024;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.anisotropy = 8;
    const mat = new THREE.MeshPhysicalMaterial({
      map: this.texture,
      roughness: 0.65,
      clearcoat: 0,
      ior: 1.5,
      specularIntensity: 0.92,
      side: THREE.DoubleSide,
      // The vessel is a closed shell with a real inner wall. Back-face shadow
      // casting avoids treating its lit outer surface as its own occluder.
      shadowSide: THREE.BackSide,
    });
    // Clay005 is a 20cm fine clay sample. Wheel traces belong to the geometry,
    // while the mineral surface provides fine fingerprints and micro roughness.
    this.roughnessTexture = clayMap("Roughness");
    this.mineralNormal = clayMap("NormalGL");
    this.mineralAlbedo = clayMap("Color");
    this.mineralAlbedo.colorSpace = THREE.SRGBColorSpace;
    mat.roughnessMap = this.roughnessTexture;
    mat.clearcoatRoughnessMap = this.roughnessTexture;
    mat.normalMap = this.mineralNormal;
    if(ceramicAudit==='normal-off')mat.normalMap=null;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.mineralAlbedo = { value: this.mineralAlbedo };
      shader.uniforms.mineralScale = { value: this.mineralAlbedo.repeat };
      shader.vertexShader = `varying vec3 ceramicLocal;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nceramicLocal = position;");
      shader.fragmentShader = `uniform sampler2D mineralAlbedo; uniform vec2 mineralScale; varying vec3 ceramicLocal;\n${shader.fragmentShader}`
        .replace("#include <map_fragment>", `#include <map_fragment>
          float mineralValue = dot(texture2D(mineralAlbedo, vMapUv * mineralScale).rgb, vec3(.2126,.7152,.0722));
          // Preserve measured surface variation while replacing red-clay pigment
          // with the stage's kaolin colour. Clay005's median linear luminance is .215.
          diffuseColor.rgb *= mix(1.,clamp(mineralValue/.215,.75,1.25),.65);
          // Uncoated trimmed foot is porous, even on a fully glazed vessel.
          float foot = 1. - smoothstep(.009,.019,ceramicLocal.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.90,.88,.82),foot*.55);
        `)
        .replace('#include <lights_physical_fragment>',THREE.ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;',
          'material.clearcoat = clearcoat * smoothstep(.009,.019,ceramicLocal.y);'))
        .replace("#include <roughnessmap_fragment>", `
          // The scan averages .49: multiplying it by 1 made dry clay as smooth
          // as wet clay. Keep scan variation around each state's physical value.
          float roughnessFactor=roughness;
          #ifdef USE_ROUGHNESSMAP
          roughnessFactor=clamp(roughness+(texture2D(roughnessMap,vRoughnessMapUv).g-.49)*.22,.08,1.);
          #endif
          roughnessFactor = mix(roughnessFactor,.91,1.-smoothstep(.009,.019,ceramicLocal.y));
        `);
    };
    this.mesh = new THREE.Mesh(ceramicGeometry(piece), mat);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    if(ceramicAudit==='shadow-off')this.mesh.receiveShadow=false;
    this.add(this.mesh);
    this.update(true);
  }
  update(force = false) {
    const p = this.piece;
    const fired = ["fired", "packed"].includes(p.stage),
      wet = ["raw", "prepared", "thrown"].includes(p.stage),
      glazed = ["glazed", "dry", "loaded"].includes(p.stage),mat=this.mesh.material;
    // Drying changes wet sheen even when the geometry is unchanged.
    mat.roughness = fired ? (p.defects.some(d=>d.startsWith('欠火'))?.82:.30) : wet ? .64-.14*Math.min(1,p.moisture/.7) : glazed ? .88 : .94;
    mat.clearcoat = fired ? 1 : wet ? .24 * Math.min(1,p.moisture/.7) : 0;
    mat.clearcoatRoughness = fired ? (glazeMean(p)>1.2?.28:.12) : .32;
    if(ceramicAudit==='matte'){mat.normalMap=null;mat.roughnessMap=null;mat.clearcoatRoughnessMap=null;mat.roughness=1;mat.clearcoat=0;}
    const sig = [
      p.stage,
      p.height,
      p.radius.join(","),
      p.thickness.join(","),
      p.marks.length,
      p.glaze.join(","),
      p.defects.join(","),
      p.shrink,
      JSON.stringify(p.wheelTraces||[]),
    ].join("|");
    if (!force && sig === this.signature) return;
    this.signature = sig;
    const shapeSignature=[p.opened,wet?'wet':fired?'fired':'dry',p.height,p.radius.join(','),p.thickness.join(','),p.defects.join(','),JSON.stringify(p.wheelTraces||[])].join('|');
    if(force||shapeSignature!==this.shapeSignature){
      this.mesh.geometry.dispose();
      this.mesh.geometry = ceramicGeometry(p);
      this.shapeSignature=shapeSignature;
    }
    this.scale.setScalar(p.shrink);
    const ctx = this.canvas.getContext("2d")!;
    ctx.fillStyle = fired
      ? "#e0e5dd"
      : wet
        ? "#85867a"
        : "#b9b6a6";
    ctx.fillRect(0, 0, 2048, 1024);
    mat.normalScale.setScalar(fired ? .025 : wet ? .45 : .75);
    const circumference=p.radius.reduce((a,b)=>a+b,0)/p.radius.length*Math.PI*2;
    for(const t of [this.roughnessTexture,this.mineralNormal,this.mineralAlbedo])
      t.repeat.set(circumference/.2*2,p.height/.2);
    for (const m of p.marks) {
      ctx.save();
      const offset = m.surface === "inner" ? 1024 : 0;
      ctx.beginPath();
      ctx.rect(offset, 0, 1024, 1024);
      ctx.clip();
      ctx.fillStyle = ctx.strokeStyle = fired
        ? `rgba(23,61,108,${m.ink * 0.84})`
        : `rgba(44,47,47,${m.ink * 0.8})`;
      ctx.lineWidth = Math.max(1, m.size * 55);
      const x = offset + m.u * 1024,
        y = (1 - m.v) * 1024,
        size = m.size * 1024;
      if (m.kind === "band") {
        ctx.fillRect(offset, y - size * 0.2, 1024, size * 0.4);
        ctx.fillRect(offset, y + size, 1024, size * 0.16);
      } else for (const dx of [-1024, 0, 1024]) stamp(ctx, m, x + dx, y, size);
      ctx.restore();
    }
    if(glazed){
      // Show actual local coverage while coating, rather than turning the whole
      // body white on the first drop. The simulation field stays save-compatible.
      this.glazeField.width=16;this.glazeField.height=12;
      const field=this.glazeField.getContext('2d')!,data=field.createImageData(16,12);
      for(let row=0;row<12;row++)for(let col=0;col<16;col++){
        const i=((11-row)*16+col)*4;
        data.data.set([196,198,184,Math.round(Math.min(.86,p.glaze[row*16+col]*.85)*255)],i);
      }
      field.putImageData(data,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(this.glazeField,0,0,1024,1024);
    }
    if (glazed || fired) {
      for (const panel of [0, 1])
        for (let i = 0; i < 192; i++) {
          const layer = p.glaze[i];
          if (layer < 0.25 && fired) {
            ctx.fillStyle = "rgba(120,112,93,0.28)";
            ctx.fillRect(
              panel * 1024 + (i % 16) * 64,
              ((11 - Math.floor(i / 16)) * 1024) / 12,
              65,
              1024 / 12 + 1,
            );
          } else if (layer > 1.2 && fired) {
            ctx.fillStyle = "rgba(179,195,180,0.18)";
            ctx.fillRect(
              panel * 1024 + (i % 16) * 64,
              ((11 - Math.floor(i / 16)) * 1024) / 12,
              65,
              1024 / 12 + 1,
            );
          }
        }
    }
    if (fired && p.defects.some((d) => d.startsWith("开裂"))) {
      ctx.strokeStyle = "#4e514a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 12; i++)
        ctx.lineTo(700 + Math.sin(i * 1.7) * 14, i * 45);
      ctx.stroke();
    }
    if (fired && p.defects.some((d) => d.startsWith("针孔"))) {
      ctx.fillStyle = "#7a8072";
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.arc((i * 239) % 2048, (i * 173) % 1024, 1.5, 0, 7);
        ctx.fill();
      }
    }
    if (fired && p.defects.some((d) => d.startsWith("欠火")))
      mat.roughness = 0.74;
    if (fired && glazeMean(p) > 1.2) mat.clearcoatRoughness = 0.28;
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.bumpMap?.dispose();
    this.mesh.material.dispose();
    this.roughnessTexture.dispose();
    this.mineralNormal.dispose();
    this.mineralAlbedo.dispose();
    this.texture.dispose();
  }
}
