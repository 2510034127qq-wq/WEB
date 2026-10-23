import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {Ceramic} from './ceramic';
import {STATIONS,type StationId,type GameState,type Piece,type Vec3} from '../simulation/model';
export class Workshop {
  renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(62,1,0.035,90);ray=new THREE.Raycaster();
  ceramics=new Map<string,Ceramic>();props=new Map<string,THREE.Group>();hands:THREE.Object3D[]=[];labels:THREE.Sprite[]=[];
  sun=new THREE.DirectionalLight('#ffedcc',3.2);fire=new THREE.PointLight('#ff6b1b',0,8,1.5);flames:THREE.Mesh[]=[];
  focus:StationId|null=null;turn=0;rotation=0;workMotion=0;lastRevision=0;private dust!:THREE.Points;private target=new THREE.PerspectiveCamera();
  constructor(public host:HTMLElement,public state:GameState){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,state.settings.quality==='high'?1.6:1));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;host.append(this.renderer.domElement);
    this.scene.background=new THREE.Color('#c8cfc4');this.scene.fog=new THREE.Fog('#c8cfc4',24,65);this.camera.rotation.order='YXZ';this.camera.position.fromArray(state.player);
    const pmrem=new THREE.PMREMGenerator(this.renderer);const room=new RoomEnvironment();this.scene.environment=pmrem.fromScene(room,0.04).texture;room.dispose();pmrem.dispose();this.scene.environmentIntensity=0.35;
    this.scene.add(new THREE.HemisphereLight('#d9e6e3','#746348',1.05));this.sun.position.set(-7,11,3);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-13,right:13,top:13,bottom:-13,near:0.1,far:35});this.sun.shadow.normalBias=0.009;this.sun.shadow.bias=-0.00006;this.sun.target.position.set(0,0,-2);this.scene.add(this.sun,this.sun.target);this.fire.position.set(6,1,4);this.scene.add(this.fire);
    this.resize();window.addEventListener('resize',()=>this.resize());
  }
  async load(onProgress:(label:string)=>void){
    const loader=new GLTFLoader();onProgress('木构、窑砖与石阶');const gltf=await loader.loadAsync('/assets/workshop.glb');
    const textures=new THREE.TextureLoader();const loaded:Promise<unknown>[]=[];
    const maps:Record<string,string>={weathered_wood:'agedwood',lime_plaster:'wall',courtyard_stone:'ground',kiln_firebrick:'brick'};
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=true;const mat=o.material as THREE.MeshStandardMaterial;const prefix=maps[mat.name];if(prefix){mat.color.set('#ffffff');for(const [channel,key] of [['diff','map'],['rough','roughnessMap'],['nor_gl','normalMap']] as const){loaded.push(textures.loadAsync(`/assets/textures/${prefix}_${channel}.jpg`).then(t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());if(channel==='diff')t.colorSpace=THREE.SRGBColorSpace;mat[key]=t;mat.needsUpdate=true;}));}mat.normalScale.setScalar(0.65);}
      if(mat.name==='bamboo_leaves'||mat.name==='grey_fired_roof_tiles')mat.side=THREE.DoubleSide;
      if(mat.name==='weathered_wood'){mat.color.set('#af9f86');mat.roughness=1;}
      if(mat.name==='lime_plaster')mat.color.set('#d1c7af');
      if(mat.name==='courtyard_stone')mat.color.set('#c2c0ac');
      if(mat.name==='grey_fired_roof_tiles')mat.color.set('#3d4746');
    }});this.scene.add(gltf.scene);await Promise.all(loaded);
    onProgress('双手与工具');const hands=await loader.loadAsync('/assets/hands.glb');
    for(let i=0;i<2;i++){const hand=clone(hands.scene);hand.scale.set(i===0?-1:1,1,1);hand.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}if(o instanceof THREE.Bone)o.userData.restQuaternion=o.quaternion.clone();});this.scene.add(hand);this.hands.push(hand);}
    this.makeProps();this.makeSigns();this.makeAtmosphere();this.sync();
  }
  makeProps(){const wood=new THREE.MeshStandardMaterial({color:'#735236',roughness:0.72});const dark=new THREE.MeshStandardMaterial({color:'#33251b',roughness:1});const steel=new THREE.MeshStandardMaterial({color:'#565c58',metalness:0.7,roughness:0.4});
    for(const name of ['brush','knife','sagger','bamboo']){const group=new THREE.Group();
      if(name==='sagger'){const pts=[new THREE.Vector2(0,0),new THREE.Vector2(0.23,0),new THREE.Vector2(0.25,0.34),new THREE.Vector2(0.225,0.34),new THREE.Vector2(0.21,0.03),new THREE.Vector2(0,0.03)];group.add(new THREE.Mesh(new THREE.LatheGeometry(pts,48),new THREE.MeshStandardMaterial({color:'#756551',roughness:0.95,side:THREE.DoubleSide})));}
      else{const len=name==='bamboo'?0.85:0.22;const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.008,0.011,len,16),wood);shaft.rotation.x=Math.PI/2;group.add(shaft);if(name==='brush'){const tip=new THREE.Mesh(new THREE.ConeGeometry(0.012,0.045,16),dark);tip.rotation.x=-Math.PI/2;tip.position.z=-len/2-0.02;group.add(tip);}if(name==='knife'){const blade=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.004,0.075),steel);blade.position.z=-0.14;group.add(blade);}}
      group.traverse(o=>{if(o instanceof THREE.Mesh)o.castShadow=true;});group.userData.prop=name;this.props.set(name,group);this.scene.add(group);
    }
  }
  makeSigns(){for(const s of STATIONS){const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d')!;ctx.fillStyle='#342e25';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#a39270';ctx.lineWidth=4;ctx.strokeRect(8,8,496,144);ctx.font='52px "Noto Serif SC", "SimSun", serif';ctx.textAlign='center';ctx.fillStyle='#ddd3b7';ctx.fillText(s.name,256,91);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,transparent:true}));sprite.position.set(s.pos[0],2.45,s.pos[2]-0.5);sprite.scale.set(1.25,0.39,1);this.labels.push(sprite);this.scene.add(sprite);}}
  makeAtmosphere(){const points=new Float32Array(150*3);for(let i=0;i<points.length;i+=3){points[i]=(Math.random()-0.5)*17;points[i+1]=0.3+Math.random()*3.8;points[i+2]=(Math.random()-0.5)*14;}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(points,3));this.dust=new THREE.Points(geo,new THREE.PointsMaterial({size:0.016,color:'#ead5a4',opacity:0.22,transparent:true,depthWrite:false}));this.scene.add(this.dust);
    for(let i=0;i<18;i++){const m=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.6,7),new THREE.MeshBasicMaterial({color:i%2?'#ff6a10':'#ffd66a',transparent:true,opacity:0.4,depthWrite:false,blending:THREE.AdditiveBlending}));m.position.set(5.3+(i%6)*0.26,0.65,4.1+Math.floor(i/6)*0.2);this.scene.add(m);this.flames.push(m);}
    // Distant forest is actual low-cost volumetric crowns beyond the courtyard.
    const trunk=new THREE.MeshStandardMaterial({color:'#4d4935',roughness:1}),leaves=new THREE.MeshStandardMaterial({color:'#4e6851',roughness:1});
    for(let i=0;i<20;i++){const x=-17+i*1.8,z=-13-(i%4)*2;const t=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.22,5,7),trunk);t.position.set(x,2.5,z);this.scene.add(t);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2,2),leaves);crown.position.set(x,4.6+(i%3)*0.5,z);crown.scale.set(1,1.3,1);this.scene.add(crown);}
  }
  sync(){for(const p of this.state.pieces){let o=this.ceramics.get(p.id);if(!o){o=new Ceramic(p);this.ceramics.set(p.id,o);this.scene.add(o);}else o.piece=p;o.update();}
    for(const [id,o] of this.ceramics)if(!this.state.pieces.some(p=>p.id===id)){o.dispose();this.scene.remove(o);this.ceramics.delete(id);}
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  setQuality(){this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.state.settings.quality==='high'?1.6:1));this.sun.shadow.mapSize.setScalar(this.state.settings.quality==='high'?2048:1024);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.resize();}
  pose(dt:number,yaw:number,pitch:number,walking:boolean,time:number){
    const s=this.focus?STATIONS.find(v=>v.id===this.focus):undefined;const p=this.state.pieces.find(p=>p.id===this.state.activeId);let goal=new THREE.Vector3(...this.state.player);let fov=62;
    if(s){const pos=new THREE.Vector3(...s.pos);const close=['wheel','paint','glaze','display'].includes(s.id)&&p?.location===s.id;
      if(close){const distance=Math.max(0.68,(p?.height||0.2)*2.1);const dir=new THREE.Vector3(...s.approach).sub(pos).setY(0).normalize();goal.copy(pos).addScaledVector(dir,distance);goal.y=pos.y+0.46;const target=pos.clone().add(new THREE.Vector3(0,(p?.height||0.2)*0.55,0));this.target.position.copy(goal);this.target.lookAt(target);fov=43;}
      else{goal.fromArray(s.approach);this.target.position.copy(goal);this.target.lookAt(pos.clone().add(new THREE.Vector3(0,0.25,0)));fov=55;}
      this.camera.quaternion.slerp(this.target.quaternion,1-Math.exp(-dt*5));
    }else{if(this.state.settings.bob&&walking)goal.y+=Math.sin(time*9)*0.018;this.target.rotation.order='YXZ';this.target.rotation.set(pitch,yaw,0);this.camera.quaternion.slerp(this.target.quaternion,1-Math.exp(-dt*18));}
    this.camera.position.lerp(goal,1-Math.exp(-dt*(s?5:18)));this.camera.fov=THREE.MathUtils.damp(this.camera.fov,fov,6,dt);this.camera.updateProjectionMatrix();
  }
  update(dt:number,time:number){
    const p=this.state.pieces.find(p=>p.id===this.state.activeId);
    for(const [id,o] of this.ceramics){const item=o.piece;o.visible=!(item.stage==='loaded'&&this.state.kiln.phase!=='idle');o.position.fromArray(item.position);o.rotation.set(0,0,0);
      if(item.location==='held'){o.position.set(0,-0.30,-0.68).applyQuaternion(this.camera.quaternion).add(this.camera.position);o.quaternion.copy(this.camera.quaternion);}
      else if(item.location==='kiln'){o.position.set(5.9,0.45,4.65);}
      else if(item.stage==='packed'){const index=this.state.pieces.filter(q=>q.stage==='packed').findIndex(q=>q.id===id);o.position.set(-0.85+(index%4)*0.5,0.98,5.8+Math.floor(index/4)*0.35);}
      if(this.focus&&item.id===this.state.activeId&&item.location===this.focus)o.rotation.y=this.rotation;
    }
    for(const [id,o] of this.props){o.position.fromArray(this.state.props[id]);o.quaternion.identity();if(this.state.held===id){o.position.set(0.22,-0.27,-0.5).applyQuaternion(this.camera.quaternion).add(this.camera.position);o.quaternion.copy(this.camera.quaternion);}}
    this.hands.forEach((h,i)=>{const side=i===0?-1:1;const work=!!this.focus&&p?.location===this.focus&&['wheel','clay','paint','glaze'].includes(this.focus);h.visible=work||!!this.state.held;
      if(work&&p){const center=new THREE.Vector3(...p.position);const r=p.radius[Math.floor(this.workMotion*47)]||0.1;h.position.copy(center).add(new THREE.Vector3(side*(r+0.065),0.04+p.height*(0.3+this.workMotion*0.4),0.07));h.rotation.set(0,side*0.7,-side*0.15);if(this.focus==='paint'&&i===0)h.visible=false;}
      else{h.position.set(side*0.20,-0.32,-0.51).applyQuaternion(this.camera.quaternion).add(this.camera.position);h.quaternion.copy(this.camera.quaternion);h.rotateY(-side*0.45);h.rotateX(-0.16);}
      h.traverse(b=>{if(b instanceof THREE.Bone&&/finger/.test(b.name)){const j=Number(b.name.slice(-1));b.quaternion.copy(b.userData.restQuaternion);b.rotateX(-(work?0.10:0.35)-(j===0?0:0.12));}});
    });
    const heat=this.state.kiln.phase==='firing'?Math.max(0.2,this.state.kiln.temperature/1300):this.state.kiln.phase==='cooling'?this.state.kiln.temperature/1600:0;
    this.fire.intensity=heat*(25+Math.sin(time*13)*2);for(let i=0;i<this.flames.length;i++){const m=this.flames[i];m.visible=heat>0.06;m.scale.set(1,heat*(0.6+Math.sin(time*9+i*7)*0.4),1);m.position.y=0.4+m.scale.y*0.3;}
    if(this.dust)this.dust.rotation.y=time*0.004;
    this.renderer.render(this.scene,this.camera);
  }
  hitPiece(x:number,y:number){const p=this.state.activeId;if(!p)return null;const o=this.ceramics.get(p);if(!o)return null;this.ray.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,-y/innerHeight*2+1),this.camera);return this.ray.intersectObject(o.mesh,false)[0]||null;}
  nearbyProp(){this.ray.setFromCamera(new THREE.Vector2(),this.camera);const hits=this.ray.intersectObjects([...this.props.values()],true);if(hits[0]&&hits[0].distance<2.1){let o:THREE.Object3D|null=hits[0].object;while(o&&!o.userData.prop)o=o.parent;return o?.userData.prop as string|undefined;}return undefined;}
  placement():Vec3|null{this.ray.setFromCamera(new THREE.Vector2(0,-0.18),this.camera);const hit=this.ray.intersectObjects(this.scene.children,true).find(h=>h.distance<2.2&&h.object instanceof THREE.Mesh&&!this.hands.some(hand=>hand===h.object||hand.getObjectById(h.object.id))&&![...this.ceramics.values()].some(c=>c.getObjectById(h.object.id))&&![...this.props.values()].some(c=>c.getObjectById(h.object.id)));if(!hit)return null;const normal=hit.face?.normal.clone().transformDirection(hit.object.matrixWorld);if(!normal||normal.y<0.6)return null;return [hit.point.x,hit.point.y+0.025,hit.point.z];}
  getStats(){return {drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,width:this.renderer.domElement.width,height:this.renderer.domElement.height};}
}

