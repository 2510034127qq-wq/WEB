import * as THREE from "three";
import { modelLoader } from "./model-loader";
import {
  loadWorkshopMaterials,
  loadCourtyardSky,
  replaceCourtyardGround,
  loadWorkstationReflections,
  workstationRegion,
  bindBakedLighting,
  type MaterialSet,
  gltfMaterial,
} from "./materials";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { WorkshopAO } from "./workshop-ao";
import { ExposureMeter } from "./exposure";
import { FixedShadowCache } from "./fixed-shadow-cache";
import { GLAZE_VAT, glazeContact } from "../simulation/glaze-contact";
import { bindSlurryReflection } from "./slurry-reflection";
import {firedClayMaterial,metricVesselUV} from './fired-clay';
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { fineNoise, makeGarden, makeWear } from "./details";
import { Ceramic } from "./ceramic";
import { loadScannedProps } from "./scanned-props";
import { loadCraftAssets } from "./craft-assets";
import { loadPottersWheel } from "./potters-wheel";
import { fingerTip, solveFingerContact } from "./hand-contact";
import { sleeveGeometry, poseSleeve } from "./sleeve";
import type { MotionPose } from "../simulation/locomotion";
import {
  STATIONS,
  type StationId,
  type GameState,
  type Piece,
  type Vec3,
} from "../simulation/model";
export class Workshop {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.035, 90);
  ray = new THREE.Raycaster();
  ceramics = new Map<string, Ceramic>();
  props = new Map<string, THREE.Group>();
  hands: THREE.Object3D[] = [];
  labels: THREE.Mesh[] = [];
  composer: EffectComposer;
  ao: WorkshopAO;
  exposure: ExposureMeter;
  private shadowCache = new FixedShadowCache();
  private fireShadowCache = new FixedShadowCache();
  private reuseShadows = new URLSearchParams(location.search).get('shadow-cache') !== 'off';
  board: THREE.Mesh;
  contact: THREE.Vector3 | null = null;
  contactNormal = new THREE.Vector3(0, 0, 1);
  action = "";
  packId: string | null = null;
  packProgress = 0;
  dipDepth = 0;
  private parcel = new THREE.Group();
  private paperFlaps: THREE.Group[] = [];
  private strawTies: THREE.Mesh[] = [];
  private kilnSeal = new THREE.Group();
  private brushPose = new THREE.Object3D();
  private glazeBrush = new THREE.Group();
  private wheelHead = new THREE.Group();
  private slurry?:THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>;
  private lastDip=0;
  private slurryWave={at:-Infinity,amplitude:0,settled:false};
  private skinMaterials = new Set<THREE.MeshStandardMaterial>();
  private forearms: THREE.Mesh[] = [];
  private surfaces!: MaterialSet;
  get controlSurfaces(){return this.surfaces;}
  private reflections = new Map<string, THREE.Texture>();
  craftAssets = new Map<string, THREE.Object3D>();
  private reach: {target:THREE.Vector3;start:number;hand:number} | null = null;
  sun = new THREE.DirectionalLight("#fff0d6", 4.25);
  fire = new THREE.PointLight("#ff6b1b", 0, 8, 2);
  flames: THREE.Mesh[] = [];
  focus: StationId | null = null;
  turn = 0;
  rotation = 0;
  workMotion = 0;
  lastRevision = 0;
  private dust!: THREE.Points;
  private target = new THREE.PerspectiveCamera();
  constructor(
    public host: HTMLElement,
    public state: GameState,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, state.settings.quality === "high" ? 1.6 : 1),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    // Reproducible photographic comparisons use the same scene and light energy.
    const photographicAudit = new URLSearchParams(location.search);
    if (photographicAudit.get('tone') === 'agx') this.renderer.toneMapping = THREE.AgXToneMapping;
    if (photographicAudit.get('tone') === 'aces') this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const auditExposure = Number(photographicAudit.get('exposure'));
    if (auditExposure >= .1 && auditExposure <= 24) this.renderer.toneMappingExposure = auditExposure;
    this.exposure=new ExposureMeter(auditExposure>=.1&&auditExposure<=24?auditExposure:null);
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color("#b8cfdf");
    this.scene.fog = new THREE.Fog("#c2cdd1", 34, 80);
    this.camera.rotation.order = "YXZ";
    this.camera.position.fromArray(state.player);
    // Direct sun is aligned with the sky panorama after it has loaded.
    this.sun.position.set(-9, 13, 11);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    Object.assign(this.sun.shadow.camera, {
      left: -13,
      right: 13,
      top: 13,
      bottom: -13,
      near: 0.1,
      far: 55,
    });
    this.sun.shadow.normalBias = 0.007;
    this.sun.shadow.radius = 2.5;
    this.sun.shadow.bias = -0.00008;
    this.sun.target.position.set(0, 0, -2);
    this.scene.add(this.sun, this.sun.target);
    // Inside the fuel bed, safely behind the 150mm seal masonry. A light in a
    // mortar joint is not a fire source and near-plane clipping leaks through it.
    this.fire.position.set(6, .74, 4.38);
    this.fire.castShadow = new URLSearchParams(location.search).get('fire-audit')!=='no-shadow';
    this.fire.visible = false;
    this.fire.shadow.autoUpdate = false;
    this.fire.shadow.mapSize.set(1024, 1024);
    this.fire.shadow.camera.near = 0.06;
    this.fire.shadow.camera.far = 8;
    this.fire.shadow.normalBias = 0.003;
    this.fire.shadow.bias = -0.00005;
    this.scene.add(this.fire);
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new WorkshopAO(
      this.scene,
      this.camera,
      innerWidth,
      innerHeight,
      16,
    );
    this.ao.kernelRadius = 0.18;
    this.ao.minDistance = 0.0004;
    this.ao.maxDistance = 0.008;
    this.ao.enabled = state.settings.quality==='high'&&new URLSearchParams(location.search).get('ao-audit') !== 'off';
    this.composer.addPass(this.ao);
    this.composer.addPass(this.exposure);
    this.composer.addPass(new OutputPass());
    this.board = new THREE.Mesh(
      new THREE.CylinderGeometry(0.245, 0.245, 0.018, 48),
      new THREE.MeshStandardMaterial({ color: "#675a40", roughness: 0.93 }),
    );
    this.board.castShadow = this.board.receiveShadow = true;
    this.board.visible = false;
    this.scene.add(this.board);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  async load(onProgress: (label: string) => void) {
    const loader = modelLoader();
    onProgress("木构、窑砖与石阶");
    const gltf = await loader.loadAsync("/assets/workshop.glb");
    onProgress("载入表面材质与自然天光");
    const [surfaces] = await Promise.all([
      loadWorkshopMaterials(this.renderer),
      loadCourtyardSky(this.scene, this.renderer),
    ]);
    this.surfaces = surfaces;
    const firedClay=await firedClayMaterial();
    this.sun.position
      .fromArray(this.scene.userData.sunDirection)
      .multiplyScalar(24)
      .add(this.sun.target.position);
    const map: Record<string, keyof MaterialSet> = {
      weathered_wood: "solidwood",
      lime_plaster: "wall",
      courtyard_stone: "ground",
      kiln_firebrick: "brick",
      stone_plinth: "ground",
      unglazed_stoneware: "earthenware",
    };
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = o.receiveShadow = true;
      const old = o.material as THREE.MeshStandardMaterial;
      o.userData.sourceMaterial = old.name;
      const key = map[old.name];
      if (key) {
        o.material = gltfMaterial(surfaces[key]);
        if(key==='earthenware'){
          o.material=firedClay;
          metricVesselUV(o);
          const audit=new URLSearchParams(location.search).get('fire-audit');
          if(audit==='no-normal')(o.material as THREE.MeshStandardMaterial).normalMap=null;
          if(audit==='double-side')(o.material as THREE.MeshStandardMaterial).shadowSide=THREE.DoubleSide;
        }
        if (old.name === "courtyard_stone") replaceCourtyardGround(o, surfaces.ground);
        if (key === "wall") {
          // Source UV units are 1.4m. A 2.2m plaster sample retains visible trowel detail.
          const uv = o.geometry.attributes.uv;
          if (uv)
            for (let i = 0; i < uv.count; i++)
              uv.setXY(i, uv.getX(i) * 0.64, uv.getY(i) * 0.64);
        }
      }
      if (old.name === "grey_fired_roof_tiles") {
        o.material=gltfMaterial(surfaces.rooftile);
        (o.material as THREE.MeshStandardMaterial).normalScale.setScalar(.38);
        const uv=o.geometry.attributes.uv;
        // Sample the interior of individual photographed tiles. The model itself
        // supplies lap joints and thickness, so painted seams must not cross it.
        const strips=[.031,.103,.173,.302,.435,.562,.704];
        for(let i=0;i<uv.count;i++){
          const u=uv.getX(i),v=uv.getY(i),col=Math.floor(u/.13),row=Math.floor(v/.15);
          uv.setXY(i,strips[Math.abs(col)%7]+THREE.MathUtils.clamp((u-col*.13)/.11,0,1)*.036,
            .12+(Math.abs(row)%6)*.122+THREE.MathUtils.clamp((v-row*.15)/.14,0,1)*.065);
        }
        uv.needsUpdate=true;
      }
      if (old.name === "still_water") {
        o.material = new THREE.MeshPhysicalMaterial({
          color: "#667060",
          roughness: 0.08,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          ior: 1.333,
        });
      }
      if (old.name === "ivory_porcelain") {
        const body = gltfMaterial(surfaces.earthenware).clone();
        body.map = null; body.color.set("#b4b1a0"); body.roughness = 1;
        body.normalScale.setScalar(.18); o.material = body;
      }
      if (old.name === "undyed_linen") {
        old.normalMap = gltfMaterial(surfaces.linen).normalMap;
        old.roughnessMap = gltfMaterial(surfaces.linen).roughnessMap;
        old.normalScale.setScalar(.18); old.color.set("#a89e78");
      }
      if (old.name === "bamboo_leaves") old.side = THREE.DoubleSide;
    });
    onProgress("工棚遮蔽、窗洞天光与墙面反弹光");
    await bindBakedLighting(gltf.scene);
    this.scene.add(gltf.scene);
    onProgress("悬挂陶罐实物资产");
    const purchased = await loader.loadAsync("/assets/fab/hanging-pottery.glb");
    const hanging = purchased.scene;
    const bounds = new THREE.Box3().setFromObject(hanging);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 0.9 / Math.max(size.x, size.y, size.z);
    hanging.scale.setScalar(scale);
    hanging.position.set(
      -6.7 - center.x * scale,
      1.77 - center.y * scale,
      5.78 - center.z * scale,
    );
    hanging.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.receiveShadow = true;
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.map)
          m.map.anisotropy = Math.min(
            16,
            this.renderer.capabilities.getMaxAnisotropy(),
          );
      }
    });
    hanging.name = "Fab_Glowbox3D_hanging_pottery_CC_BY_4";
    this.scene.add(hanging);
    onProgress("实物扫描柴堆");
    const firewoodAsset = await loader.loadAsync(
      "/assets/fab/firewood-pile.glb",
    );
    const pile = firewoodAsset.scene;
    const pileBounds = new THREE.Box3().setFromObject(pile);
    const pileSize = pileBounds.getSize(new THREE.Vector3());
    const pileCenter = pileBounds.getCenter(new THREE.Vector3());
    const pileScale = 1.25 / Math.max(pileSize.x, pileSize.y, pileSize.z);
    pile.scale.setScalar(pileScale);
    pile.position.set(
      3.65 - pileCenter.x * pileScale,
      0.025 - pileBounds.min.y * pileScale,
      6.05 - pileCenter.z * pileScale,
    );
    pile.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.receiveShadow = true;
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.map)
          m.map.anisotropy = Math.min(
            16,
            this.renderer.capabilities.getMaxAnisotropy(),
          );
      }
    });
    pile.name = "Fab_sixonetwo_firewood_scan_CC_BY_4";
    this.scene.add(pile);
    onProgress("木器、编织与储料器具");
    await loadScannedProps(this.scene, this.renderer);
    onProgress("双手与工具");
    const hands = await loader.loadAsync("/assets/hands.glb");
    const handRig = await (await fetch('/assets/hand-rig.json')).json();
    for (let i = 0; i < 2; i++) {
      const hand = clone(hands.scene);
      // The imported rig is hand.L. Keep it on the player's left; mirror only
      // the right hand. Mirroring the left swapped both thumbs onto the underside.
      hand.scale.set(i === 0 ? 1 : -1, 1, 1);
      hand.name=i===0?'player_left_hand':'player_right_hand';
      hand.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mat = o.material as THREE.MeshStandardMaterial;
          if (mat.name === "warm_skin") {
            mat.color.set("#ffffff");
            mat.normalScale.setScalar(0.65);
            if (mat.map) mat.map.anisotropy = 16;
            this.skinMaterials.add(mat);
          }
          if (mat.name === "indigo_cotton") {
            o.visible = false;
            mat.bumpMap = fineNoise();
            mat.bumpScale = 0.0005;
            mat.color.set("#293e40");
          }
        }
        if (o instanceof THREE.Bone) {
          o.userData.restQuaternion = o.quaternion.clone();
          o.userData.length=handRig.boneLengths[o.name];
        }
      });
      hand.visible = false;
      this.scene.add(hand);
      this.hands.push(hand);
    }
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(
        sleeveGeometry(),
        this.surfaces.linen.clone(),
      );
      (arm.material as THREE.MeshStandardMaterial).color.set("#3b5757");
      arm.castShadow = arm.receiveShadow = true;
      arm.visible = false;
      this.forearms.push(arm);
      this.scene.add(arm);
    }
    this.craftAssets = await loadCraftAssets(surfaces);
    const wheel=await loadPottersWheel(surfaces);
    this.wheelHead.add(wheel.get('wheel_turning')!);
    const fixedWheel=wheel.get('wheel_fixed')!;
    fixedWheel.position.set(0,.78,-5.6);this.scene.add(fixedWheel);
    this.makeProps();
    this.makeSigns();
    this.makeAtmosphere();
    await makeGarden(this.scene);
    makeWear(this.scene);
    this.reflections = await loadWorkstationReflections(this.renderer);
    this.applyLocalLighting(this.scene);
    this.sync();
  }
  /** Roof/wall occlusion must also apply to static timber's specular reflection. */
  applyLocalLighting(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      if(o.userData.sourceMaterial==='courtyard_stone') {
        if(o.userData.reflectionPartitioned)return;
        const geometry=o.geometry,index=geometry.index!,position=geometry.attributes.position,
          source=o.material as THREE.MeshStandardMaterial,groups=new Map<string,number[]>();
        for(let i=0;i<index.count;i+=3) {
          const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),
            x=(position.getX(a)+position.getX(b)+position.getX(c))/3,
            z=(position.getZ(a)+position.getZ(b)+position.getZ(c))/3,
            region=workstationRegion(x,z)||'outdoor';
          if(!groups.has(region))groups.set(region,[]);
          groups.get(region)!.push(a,b,c);
        }
        const indices:number[]=[],materials:THREE.MeshStandardMaterial[]=[];
        geometry.clearGroups();
        for(const [region,triangles] of groups) {
          const mat=source.clone();mat.onBeforeCompile=source.onBeforeCompile;mat.customProgramCacheKey=source.customProgramCacheKey;
          if(region!=='outdoor') {mat.envMap=this.reflections.get(region)!;mat.envMapIntensity=1;mat.envMapRotation.y=Math.PI/2;}
          geometry.addGroup(indices.length,triangles.length,materials.length);
          for(const value of triangles)indices.push(value);
          materials.push(mat);
        }
        geometry.setIndex(indices);o.material=materials;o.userData.reflectionPartitioned=true;return;
      }
      o.geometry.computeBoundingBox();
      const center=o.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(o.matrixWorld);
      // Workshop probes contain roof/wall occlusion. The outside tree belt must
      // retain its actual sky environment instead of inheriting an indoor probe.
      const region=(o.userData.lightingRegion as string)||workstationRegion(center.x,center.z);
      if (!region || region==='outdoor') return;
      const materials=Array.isArray(o.material) ? o.material : [o.material];
      const local=materials.map(m => {
        if (!(m instanceof THREE.MeshStandardMaterial)) return m;
        const mat=m.clone(); mat.envMap=this.reflections.get(region)!; mat.envMapIntensity=1;
        mat.onBeforeCompile=m.onBeforeCompile;mat.customProgramCacheKey=m.customProgramCacheKey;
        mat.envMapRotation.y=Math.PI/2;
        return mat;
      });
      o.material=Array.isArray(o.material)?local:local[0];
    });
  }
  makeProps() {
    const wood = new THREE.MeshStandardMaterial({
      color: "#735236",
      roughness: 0.72,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: "#33251b",
      roughness: 1,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: "#565c58",
      metalness: 0.7,
      roughness: 0.4,
    });
    const paper = new THREE.MeshStandardMaterial({
      color: "#b7ab8c",
      roughness: 1,
      side: THREE.DoubleSide,
      bumpMap: fineNoise(),
      bumpScale: 0.0006,
    });
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group(),
        flap = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 12, 12), paper);
      flap.position.y = 0.5;
      flap.castShadow = flap.receiveShadow = true;
      pivot.add(flap);
      this.parcel.add(pivot);
      this.paperFlaps.push(pivot);
    }
    for (let i = 0; i < 4; i++) {
      const rope = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(
            [
              new THREE.Vector3(-1, 0, -1),
              new THREE.Vector3(1, 0, -1),
              new THREE.Vector3(1, 0, 1),
              new THREE.Vector3(-1, 0, 1),
            ],
            true,
            "catmullrom",
            0.12,
          ),
          80,
          0.012,
          6,
          true,
        ),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? "#8a7750" : "#a39166",
          roughness: 1,
          bumpMap: fineNoise(),
          bumpScale: 0.001,
        }),
      );
      rope.castShadow = true;
      this.parcel.add(rope);
      this.strawTies.push(rope);
    }
    this.parcel.visible = false;
    this.scene.add(this.parcel);
    this.wheelHead.position.set(0, 0.78, -5.6);
    this.scene.add(this.wheelHead);
    const tub = this.craftAssets.get("glaze_vat")!;
    tub.position.set(7.2, GLAZE_VAT.base, 0.48);
    this.scene.add(tub);
    const slurry = new THREE.Mesh(
      new THREE.RingGeometry(0,0.263,128,40),
      new THREE.MeshPhysicalMaterial({
        color: "#b9bdac",
        roughness: 0.35,
        clearcoat: 0.25,
      }),
    );
    // Match the drying oval of the authored inner wall at local height .320m.
    // A circular disc previously pierced the rim and looked like a metal lid.
    const slurryPosition=slurry.geometry.attributes.position;
    for(let i=0;i<slurryPosition.count;i++){
      const x=slurryPosition.getX(i),y=slurryPosition.getY(i);
      const a=Math.atan2(-y,x),radius=.26343+.0022*(.320/.362)**2*Math.cos(2*a+.4);
      slurryPosition.setXY(i,x*radius/.263,y*radius/.263);
    }
    slurry.rotation.x = -Math.PI / 2;
    slurry.position.set(7.2, GLAZE_VAT.liquid, 0.48);
    slurry.name='glaze_slurry_surface';
    slurry.receiveShadow=true;slurry.castShadow=false;
    bindSlurryReflection(slurry);
    this.slurry=slurry;
    this.scene.add(slurry);
    const glazeBrush=this.craftAssets.get('brush')!.clone(true);
    glazeBrush.traverse(o=>{
      if(!(o instanceof THREE.Mesh))return;
      const source=Array.isArray(o.material)?o.material:[o.material];
      const materials=source.map(m=>{
        const material=m.clone() as THREE.MeshStandardMaterial;
        if(/hair|wet_point/.test(m.name)){material.color.set('#bbc0ad');material.roughness=.38;}
        return material;
      });
      o.material=Array.isArray(o.material)?materials:materials[0];
    });
    this.glazeBrush.add(glazeBrush);this.glazeBrush.name='glaze_touchup_brush';
    this.glazeBrush.position.set(6.9,1.013,-.02);
    this.scene.add(this.glazeBrush);
    for (const name of ["brush", "knife", "sagger", "bamboo"]) {
      const group = new THREE.Group();
      if (name === "brush" || name === "knife") {
        group.add(this.craftAssets.get(name)!);
      } else if (name === "sagger") {
        const pts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.23, 0),
          new THREE.Vector2(0.25, 0.34),
          new THREE.Vector2(0.225, 0.34),
          new THREE.Vector2(0.21, 0.03),
          new THREE.Vector2(0, 0.03),
        ];
        group.add(
          new THREE.Mesh(
            new THREE.LatheGeometry(pts, 48),
            new THREE.MeshStandardMaterial({
              color: "#756551",
              roughness: 0.95,
              side: THREE.DoubleSide,
            }),
          ),
        );
      } else {
        const len = name === "bamboo" ? 0.85 : 0.22;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.011, len, 16),
          wood,
        );
        shaft.rotation.x = Math.PI / 2;
        group.add(shaft);
        if (name === "brush") {
          const tip = new THREE.Mesh(
            new THREE.ConeGeometry(0.012, 0.045, 16),
            dark,
          );
          tip.rotation.x = -Math.PI / 2;
          tip.position.z = -len / 2 - 0.02;
          group.add(tip);
        }
        if (name === "knife") {
          const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.004, 0.075),
            steel,
          );
          blade.position.z = -0.14;
          group.add(blade);
        }
      }
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      group.userData.prop = name;
      this.props.set(name, group);
      this.scene.add(group);
    }
  }
  reachTo(target: THREE.Vector3, hand: number) {
    this.reach={target:target.clone(),start:performance.now()/1000,hand};
  }
  handDiagnostics() {
    return this.hands.map(h=>({
      name:h.name,visible:h.visible,mirror:h.scale.x,
      wrist:h.position.toArray(),
      thumb:fingerTip(h,'thumb_2').toArray(),index:fingerTip(h,'finger0_2').toArray(),
      palm:new THREE.Vector3(0,1,0).transformDirection(h.matrixWorld).toArray(),
    }));
  }
  makeSigns() {
    for (const s of STATIONS) {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 160;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#342e25";
      ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = "#a39270";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, 496, 144);
      ctx.font = '52px "Noto Serif SC", "SimSun", serif';
      ctx.textAlign = "center";
      ctx.fillStyle = "#ddd3b7";
      ctx.fillText(s.name, 256, 99);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.34, 0.035),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
      );
      const dir = new THREE.Vector3(...s.approach)
        .sub(new THREE.Vector3(...s.pos))
        .setY(0)
        .normalize();
      sign.position.set(s.pos[0], 2.55, s.pos[2]);
      sign.lookAt(sign.position.clone().add(dir));
      sign.castShadow = true;
      this.labels.push(sign);
      this.scene.add(sign);
      for (const side of [-1, 1]) {
        const rope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.006, 0.006, 0.45, 6),
          new THREE.MeshStandardMaterial({ color: "#695e43", roughness: 1 }),
        );
        rope.position
          .copy(sign.position)
          .add(
            new THREE.Vector3(side * 0.4, 0.39, 0).applyQuaternion(
              sign.quaternion,
            ),
          );
        this.scene.add(rope);
      }
    }
  }
  makeAtmosphere() {
    const points = new Float32Array(150 * 3);
    for (let i = 0; i < points.length; i += 3) {
      points[i] = (Math.random() - 0.5) * 17;
      points[i + 1] = 0.3 + Math.random() * 3.8;
      points[i + 2] = (Math.random() - 0.5) * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(points, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.016,
        color: "#ead5a4",
        opacity: 0.22,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.scene.add(this.dust);
    // Layered flame geometry follows turbulence; the transparent edges are shaded in 3D.
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { time: { value: 0 }, seed: { value: i * 1.7 } },
        vertexShader: `varying vec2 vUv;uniform float time;uniform float seed;void main(){vUv=uv;vec3 p=position;p.x+=sin(p.y*12.+time*7.+seed)*.06*uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
        fragmentShader: `varying vec2 vUv;uniform float time;uniform float seed;void main(){float y=vUv.y;float wave=sin(y*22.-time*9.+seed)*.09*y;float width=(1.-y)*.42;float edge=1.-smoothstep(width*.38,width,abs(vUv.x-.5+wave));float flicker=.68+.18*sin(time*11.+seed+y*6.);float a=edge*(1.-smoothstep(.55,1.,y))*smoothstep(0.,.12,y)*flicker;vec3 c=mix(vec3(1.,.12,.012),vec3(1.,.85,.32),edge*(1.-y));gl_FragColor=vec4(c,a*.65);}`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.85, 8, 16), mat);
      m.position.set(
        5.68 + (i % 3) * 0.24,
        0.7,
        4.18 + Math.floor(i / 3) * 0.11,
      );
      m.rotation.y = ((i % 3) - 1) * 0.5;
      this.scene.add(m);
      this.flames.push(m);
    }
    const brickMap = new THREE.TextureLoader().load(
      "/assets/textures/brick_diff.jpg",
    );
    brickMap.colorSpace = THREE.SRGBColorSpace;
    brickMap.repeat.set(0.15, 0.035);
    brickMap.offset.set(0.32, 0.945);
    const brick = new THREE.MeshStandardMaterial({
      color: "#9b8a79",
      map: brickMap,
      roughness: 1,
      bumpMap: fineNoise(),
      bumpScale: 0.002,
    });
    const positions: THREE.Vector3[] = [];
    for (let row = 0; row < 9; row++)
      for (let col = -5; col <= 5; col++) {
        const x = col * 0.27 + (row % 2) * 0.135,
          y = 0.42 + row * 0.23;
        if (
          Math.abs(x) > 1.42 ||
          y > 1.0 + Math.sqrt(Math.max(0, 1.55 ** 2 - x * x)) ||
          (Math.abs(x) < 0.34 && y < 1.0)
        )
          continue;
        positions.push(new THREE.Vector3(6 + x, y, 3.94));
      }
    const blocks = new THREE.InstancedMesh(
        new RoundedBoxGeometry(0.266, 0.224, 0.15, 2, 0.005),
        brick,
        positions.length,
      ),
      matrix = new THREE.Matrix4();
    positions.forEach((v, i) => {
      matrix.makeTranslation(v.x, v.y, v.z);
      blocks.setMatrixAt(i, matrix);
      blocks.setColorAt(
        i,
        new THREE.Color().setScalar(0.8 + Math.sin(i * 13) * 0.12),
      );
    });
    blocks.castShadow = blocks.receiveShadow = true;
    this.kilnSeal.add(blocks);
    this.scene.add(this.kilnSeal);
  }
  sync() {
    for (const p of this.state.pieces) {
      let o = this.ceramics.get(p.id);
      if (!o) {
        o = new Ceramic(p);
        this.ceramics.set(p.id, o);
        this.scene.add(o);
      } else o.piece = p;
      const position=p.location==='held'?this.state.player:p.position;
      const region=workstationRegion(position[0],position[2]);
      o.mesh.material.envMap = region?this.reflections.get(region)||null:null;
      o.mesh.material.envMapIntensity = 1;
      o.mesh.material.envMapRotation.y=Math.PI/2;
      o.update();
    }
    for (const [id, o] of this.ceramics)
      if (!this.state.pieces.some((p) => p.id === id)) {
        o.dispose();
        this.scene.remove(o);
        this.ceramics.delete(id);
      }
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(innerWidth, innerHeight);
    this.ao?.setSize(
      Math.round(innerWidth * 0.7),
      Math.round(innerHeight * 0.7),
    );
  }
  setQuality() {
    const ratio = Math.min(
      devicePixelRatio,
      this.state.settings.quality === "high" ? 1.6 : 1,
    );
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.sun.shadow.mapSize.setScalar(
      this.state.settings.quality === "high" ? 4096 : 2048,
    );
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.ao.enabled=this.state.settings.quality==='high'&&new URLSearchParams(location.search).get('ao-audit')!=='off';
    this.resize();
  }
  pose(
    dt: number,
    yaw: number,
    pitch: number,
    _walking: boolean,
    _time: number,
    motion?: MotionPose,
  ) {
    const s = this.focus
      ? STATIONS.find((v) => v.id === this.focus)
      : undefined;
    const p = this.state.pieces.find((p) => p.id === this.state.activeId);
    let goal = new THREE.Vector3(...this.state.player);
    let fov = 62;
    if (s) {
      const pos = new THREE.Vector3(...s.pos);
      const close =
        ["clay", "wheel", "paint", "glaze", "display"].includes(s.id) &&
        p?.location === s.id;
      if (close) {
        const distance = Math.max(0.72, (p?.height || 0.2) * 1.95);
        const dir = new THREE.Vector3(...s.approach)
          .sub(pos)
          .setY(0)
          .normalize();
        goal.copy(pos).addScaledVector(dir, distance);
        goal.y = pos.y + 0.46;
        const target = pos
          .clone()
          .add(new THREE.Vector3(0, (p?.height || 0.2) * 0.55, 0));
        this.target.position.copy(goal);
        this.target.lookAt(target);
        fov = 54;
      } else {
        goal.fromArray(s.approach);
        this.target.position.copy(goal);
        this.target.lookAt(pos.clone().add(new THREE.Vector3(0, 0.25, 0)));
        fov = 55;
      }
      if (s.id === "glaze") {
        goal.set(5.95, 1.92, 0.38);
        this.target.position.copy(goal);
        this.target.lookAt(new THREE.Vector3(7.2, 1.2+Math.max(0,(p?.height||.2)-.26)*.65, 0.38));
        fov = 52;
      }
      if (s.id === "kiln") {
        goal.set(6, 1.55, 2.6);
        this.target.position.copy(goal);
        this.target.lookAt(new THREE.Vector3(6, 0.65, 3.9));
        fov = 61;
      }
      this.camera.quaternion.slerp(
        this.target.quaternion,
        1 - Math.exp(-dt * 5),
      );
    } else {
      if (motion)
        goal.add(
          new THREE.Vector3(
            motion.offset.x,
            motion.offset.y,
            motion.offset.z,
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
        );
      this.target.rotation.order = "YXZ";
      this.target.rotation.set(
        pitch + (motion?.pitch || 0),
        yaw,
        motion?.roll || 0,
      );
      this.camera.quaternion.copy(this.target.quaternion);
    }
    this.camera.position.lerp(goal, 1 - Math.exp(-dt * (s ? 5 : 18)));
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 6, dt);
    this.camera.updateProjectionMatrix();
  }
  update(dt: number, time: number) {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    const p = this.state.pieces.find((p) => p.id === this.state.activeId);
    if(this.slurry){
      const bottom=p?glazeContact(p,this.dipDepth).bottom:GLAZE_VAT.rest;
      const delta=bottom-this.lastDip;
      const touching=p?.location==='glaze'&&this.focus==='glaze'&&glazeContact(p,this.dipDepth).immersed>0;
      if(touching&&Math.abs(delta)>.001){
        this.slurryWave.at=time;this.slurryWave.amplitude=Math.min(.0012,Math.abs(delta)*1.2);
        this.slurryWave.settled=false;
      }
      this.lastDip=bottom;
      const age=time-this.slurryWave.at;
      if(!this.slurryWave.settled){
        const position=this.slurry.geometry.attributes.position;
        for(let i=0;i<position.count;i++){
          const x=position.getX(i),y=position.getY(i),radius=Math.hypot(x,y);
          const a=Math.atan2(-y,x),edge=radius/(.26343+.0022*(.320/.362)**2*Math.cos(2*a+.4));
          const meniscus=.0018*edge**24;
          const ripple=age<3?this.slurryWave.amplitude*Math.sin(radius*105-age*8)*Math.exp(-age*2.3)*(1-edge**6):0;
          position.setZ(i,meniscus+ripple);
        }
        position.needsUpdate=true;this.slurry.geometry.computeVertexNormals();
        this.slurryWave.settled=age>=3;
      }
    }
    this.wheelHead.rotation.y = this.rotation;
    for (const [id, o] of this.ceramics) {
      const item = o.piece;
      o.visible = !(
        item.stage === "loaded" && this.state.kiln.phase !== "idle"
      );
      o.position.fromArray(item.position);
      o.rotation.set(0, 0, 0);
      if (item.location === "held") {
        o.position
          .set(0, -0.3, -0.68)
          .applyQuaternion(this.camera.quaternion)
          .add(this.camera.position);
        o.quaternion.copy(this.camera.quaternion);
      } else if (item.stage === "packed") {
        const index = this.state.pieces
          .filter((q) => q.stage === "packed")
          .slice(-8)
          .findIndex((q) => q.id === id);
        const selected = this.focus === "display" && id === this.state.activeId;
        o.visible = index >= 0 || selected;
        if (!selected)
          o.position.set(
            -0.9 + (index % 4) * 0.58,
            0.98,
            6.05 + Math.floor(index / 4) * 0.35,
          );
      }
      if (
        this.focus &&
        item.id === this.state.activeId &&
        item.location === this.focus
      )
        o.rotation.y = this.rotation;
      o.mesh.scale.set(1, 1, 1);
      if (
        ["prepare", "knead"].includes(this.action) &&
        item.location === "clay"
      ) {
        const squash = 1 + Math.sin(time * 8) * 0.09;
        o.mesh.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      }
      if (item.location === "glaze" && this.focus === "glaze") {
        // The player's dragged depth is the pose; releasing does not trigger an automatic dip.
        o.position.z += 0.68;
        o.position.y = glazeContact(item,this.dipDepth).bottom;
      }
    }
    const carried = this.state.pieces.find((q) => q.id === this.state.held);
    this.board.visible = !!carried;
    if (carried) {
      this.board.position
        .copy(this.ceramics.get(carried.id)!.position)
        .add(new THREE.Vector3(0, -0.014, 0));
      this.board.quaternion.copy(this.camera.quaternion);
    }
    const wrapping = this.state.pieces.find((q) => q.id === this.packId);
    this.parcel.visible = !!wrapping && this.focus === "display";
    if (wrapping) {
      this.parcel.position.copy(this.ceramics.get(wrapping.id)!.position);
      const r = Math.max(...wrapping.radius) * wrapping.shrink + 0.014,
        h = wrapping.height * wrapping.shrink + 0.025;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2,
          flap = this.paperFlaps[i],
          fold = THREE.MathUtils.smoothstep(
            this.packProgress,
            (i % 2) * 0.16,
            0.7 + (i % 2) * 0.15,
          );
        flap.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
        flap.rotation.set((Math.PI / 2) * (1 - fold), a, 0, "YXZ");
        flap.scale.set(r * 2.1, h, 1);
      }
      for (let i = 0; i < 4; i++) {
        const tie = this.strawTies[i];
        tie.visible = this.packProgress > 0.72 + i * 0.045;
        tie.position.y =
          h * (0.32 + (i % 2) * 0.35) + Math.floor(i / 2) * 0.006;
        tie.scale.setScalar(r * 1.01);
      }
    }
    for (const [id, o] of this.props) {
      o.position.fromArray(this.state.props[id]);
      o.quaternion.identity();
      if (this.state.held === id) {
        o.position
          .set(0.22, -0.27, -0.5)
          .applyQuaternion(this.camera.quaternion)
          .add(this.camera.position);
        o.quaternion.copy(this.camera.quaternion);
      }
    }
    const brushingGlaze=this.focus==='glaze'&&p?.location==='glaze'&&this.action==='glaze-brush';
    this.glazeBrush.position.set(6.9,1.013,-.02);this.glazeBrush.rotation.set(0,.35,0);
    if ((p?.location === "paint" && this.focus === "paint") || brushingGlaze) {
      const brush = brushingGlaze?this.glazeBrush:this.props.get("brush")!;
      const target =
        this.contact ||
        new THREE.Vector3(...p.position).add(
          new THREE.Vector3(p.radius[24] * 0.6, p.height * 0.5, p.radius[24]),
        );
      const normal = this.contact
        ? this.contactNormal
        : new THREE.Vector3(0.3, 0.5, 1).normalize();
      const brushAxis=normal.clone().add(new THREE.Vector3(0,.65,0)).normalize();
      brush.position.copy(target).addScaledVector(brushAxis, 0.149);
      brush.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        brushAxis.clone().negate(),
      );
      this.brushPose.position.copy(brush.position);
      this.brushPose.quaternion.copy(brush.quaternion);
    }
    if (
      p?.location === "wheel" &&
      this.focus === "wheel" &&
      ["leather", "trimmed"].includes(p.stage)
    ) {
      const knife = this.props.get("knife")!,
        r = p.radius[Math.floor(this.workMotion * 47)] || 0.1;
      knife.position.set(
        p.position[0] + r + 0.11,
        p.position[1] + p.height * this.workMotion + 0.02,
        p.position[2] + 0.04,
      );
      knife.rotation.y = Math.PI / 2;
      if (this.contact) {
        knife.position.copy(this.contact).add(new THREE.Vector3(0.1, 0.015, 0));
      }
    }
    const brushWork=this.focus==='paint'||brushingGlaze;
    this.hands.forEach((h, i) => {
      const side = i === 0 ? -1 : 1;
      const work =
        !!this.focus &&
        p?.location === this.focus &&
        (["wheel", "clay", "paint", "glaze"].includes(this.focus) ||
          this.action === "pack");
      h.visible = work || !!this.state.held;
      if (work && p) {
        const center = this.ceramics.get(p.id)!.position;
        const ringHeight = this.contact ? Math.max(.12,this.workMotion) : .42;
        const r =
          p.radius[
            this.focus === "glaze" ? 47 : Math.floor(ringHeight * 47)
          ] || 0.1;
        const toward = this.camera.position
            .clone()
            .sub(center)
            .setY(0)
            .normalize(),
          right = new THREE.Vector3(toward.z, 0, -toward.x);
        h.position
          .copy(center)
          .addScaledVector(right, side * (r + 0.065))
          .addScaledVector(toward, 0.07);
        h.position.y +=
          this.focus === "glaze"
            ? p.height + 0.022
            : 0.018 +
              p.height * Math.max(0.12, Math.min(0.98, ringHeight));
        if (this.contact && ["wheel", "clay"].includes(this.focus!)) {
          // Fingers stay on the selected ring instead of hovering at a fixed mid height.
          h.position.y = Math.max(center.y + 0.02, this.contact.y);
          if (this.focus === "clay") {
            h.position.addScaledVector(
              toward,
              (this.contact.z - center.z) * 0.6,
            );
            h.position.x += (this.contact.x - center.x) * 0.45;
          }
        }
        h.rotation.set(
          0,
          Math.atan2(toward.x, toward.z) + side * 0.7,
          -side * 0.15,
        );
        if (this.focus === "wheel" || this.focus === "glaze") {
          // The palm faces the wall of the vessel. Finger axes follow its height;
          // the wrist is below the contact ring and fingers flex onto the wall.
          const palm = right.clone().multiplyScalar(-side),
            backward = toward.clone().multiplyScalar(.8).add(new THREE.Vector3(0,-.6,0)).normalize(),
            across = new THREE.Vector3().crossVectors(palm,backward).normalize();
          h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,palm,backward));
          h.position.addScaledVector(right,-side*.035);
          h.position.y = Math.max(center.y+.085,h.position.y-(this.focus === "glaze" ? .045 : .025));
        }
        if (this.focus === "clay") {
          const palm = new THREE.Vector3(0,-1,0), backward = toward.clone(),
            across = new THREE.Vector3().crossVectors(palm,backward).normalize();
          h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,palm,backward));
          h.position.y = center.y + p.height * .72;
        }
        if (this.focus === "paint" && i === 0) h.visible = false;
      } else {
        h.position
          .set(side * 0.2, -0.32, -0.51)
          .applyQuaternion(this.camera.quaternion)
          .add(this.camera.position);
        h.quaternion.copy(this.camera.quaternion);
        h.rotateY(-side * 0.45);
        h.rotateX(-0.16);
      }
      if (work && brushWork && i === 1) {
        h.position
          .copy(this.brushPose.position)
          .add(new THREE.Vector3(0.055, 0.055, 0.07));
        h.position.y = Math.max(p!.position[1] + 0.09, h.position.y);
        h.rotation.set(0.18, 0.6, -0.18);
      }
      if (this.action === "pack" && wrapping)
        h.position.y =
          this.parcel.position.y +
          wrapping.height * (0.2 + 0.6 * this.packProgress);
      h.traverse((b) => {
        if (b instanceof THREE.Bone && /finger/.test(b.name)) {
          const j = Number(b.name.slice(-1));
          b.quaternion.copy(b.userData.restQuaternion);
          const finger = Number(b.name[6]);
          const grip = brushWork ? [0.62,1.06,.75] : this.focus === "glaze" ? [.35,.72,.48] : work ? [.10,.24,.16] : [.45,.72,.45];
          b.userData.flex=grip[j]+finger*.035;
          b.rotateX(b.userData.flex);
        }
        if (b instanceof THREE.Bone && /^thumb_/.test(b.name)) {
          const j = Number(b.name.slice(-1));
          b.quaternion.copy(b.userData.restQuaternion);
          b.userData.flex=j===0?.35:.22;
          b.rotateX(b.userData.flex);
          if (j === 0) b.rotateZ(brushWork ? -.40 : -.18);
        }
      });
      if(work && brushWork && i===1) {
        h.updateMatrixWorld(true);
        const pinch=fingerTip(h,'finger0_2').add(fingerTip(h,'thumb_2')).multiplyScalar(.5);
        const grip=new THREE.Vector3(0,0,.012).applyQuaternion(this.brushPose.quaternion).add(this.brushPose.position);
        h.position.add(grip.clone().sub(pinch));h.updateMatrixWorld(true);
        for(const [finger,x,y,z] of [['thumb',-.005,0,.012],['finger0',.005,0,.012],['finger1',.003,-.004,.025]] as const)
          solveFingerContact(h,finger,new THREE.Vector3(x,y,z).applyQuaternion(this.brushPose.quaternion).add(this.brushPose.position));
      }
      if(this.reach && i===this.reach.hand) {
        const age=performance.now()/1000-this.reach.start;
        if(age<.95) {
          const amount=age<.35?THREE.MathUtils.smoothstep(age,0,.35):1-THREE.MathUtils.smoothstep(age,.58,.95);
          const backward=this.camera.position.clone().sub(this.reach.target).setY(0).normalize(), palm=new THREE.Vector3(0,-1,0),
            across=new THREE.Vector3().crossVectors(palm,backward).normalize();
          const q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,palm,backward));
          const wrist=this.reach.target.clone().addScaledVector(backward,.11);
          wrist.y+=.025+.07*Math.sin(Math.PI*Math.min(1,age/.35));
          h.position.lerp(wrist,amount);h.quaternion.slerp(q,amount);h.visible=true;
        } else this.reach=null;
      }
      const region = workstationRegion(h.position.x,h.position.z)||'wheel';
      h.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        o.material.envMap=this.reflections.get(region)!; o.material.envMapIntensity=1;
        o.material.envMapRotation.y=Math.PI/2;
      }});
      const arm = this.forearms[i];
      (arm.material as THREE.MeshStandardMaterial).envMap=this.reflections.get(region)!;
      (arm.material as THREE.MeshStandardMaterial).envMapRotation.y=Math.PI/2;
      arm.visible = h.visible;
      if (h.visible) {
        h.updateMatrixWorld(true);
        const elbow = new THREE.Vector3(side * 0.38, -0.64, -0.06)
          .applyQuaternion(this.camera.quaternion)
          .add(this.camera.position);
        poseSleeve(arm, h, elbow);
      }
    });
    for (const skin of this.skinMaterials) {
      skin.color.set(
        p && ["raw", "prepared", "thrown"].includes(p.stage)
          ? "#e4dbcb"
          : "#ffffff",
      );
      skin.roughness =
        p && ["raw", "prepared", "thrown"].includes(p.stage) ? 0.49 : 0.68;
    }
    const heat =
      this.state.kiln.phase === "firing"
        ? Math.max(0.2, this.state.kiln.temperature / 1300)
        : this.state.kiln.phase === "cooling"
          // Relative red-band thermal radiance (650nm, normalized at 1200C).
          // Warm masonry at 360C must not illuminate the courtyard like flames.
          ? Math.exp(22135*(1/1473.15-1/(this.state.kiln.temperature+273.15)))
          : 0;
    this.kilnSeal.visible = this.state.kiln.phase !== "idle";
    this.fire.intensity = heat * (25 + (this.state.kiln.phase==='firing'?Math.sin(time * 13) * 2:0));
    this.fire.visible = this.fire.intensity > .001;
    this.fire.color.set(this.state.kiln.phase==='cooling'?'#ff310a':'#ff6b1b');
    for (let i = 0; i < this.flames.length; i++) {
      const m = this.flames[i];
      m.visible = this.state.kiln.phase === "firing";
      m.scale.set(1, heat * (0.8 + Math.sin(time * 9 + i * 7) * 0.2), 1);
      m.position.y = 0.43 + m.scale.y * 0.42;
      (m.material as THREE.ShaderMaterial).uniforms.time.value = time;
    }
    if (this.dust) this.dust.rotation.y = time * 0.004;
    if (this.ao.enabled) {
      this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
        this.camera.projectionMatrix,
      );
      this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
        this.camera.projectionMatrixInverse,
      );
    }
    this.shadowCache.update(this.scene, this.sun, this.camera, this.reuseShadows);
    // Flame brightness changes do not change the six depth projections. Moving
    // the damper, seal or ware does; the cache observes those actual casters.
    if (this.fire.visible)
      this.fireShadowCache.update(this.scene, this.fire, this.camera, this.reuseShadows);
    this.composer.render();
  }
  hitWheel(x: number, y: number) {
    this.ray.setFromCamera(
      new THREE.Vector2((x / innerWidth) * 2 - 1, (-y / innerHeight) * 2 + 1),
      this.camera,
    );
    return this.ray.intersectObject(this.wheelHead, true)[0] || null;
  }
  hitPiece(x: number, y: number) {
    const p = this.state.activeId;
    if (!p) return null;
    const o = this.ceramics.get(p);
    if (!o) return null;
    this.ray.setFromCamera(
      new THREE.Vector2((x / innerWidth) * 2 - 1, (-y / innerHeight) * 2 + 1),
      this.camera,
    );
    const hit = this.ray.intersectObject(o.mesh, false)[0];
    if (!hit?.uv) return null;
    return {
      ...hit,
      surface: hit.uv.x >= 0.5 ? ("inner" as const) : ("outer" as const),
      uv: new THREE.Vector2((hit.uv.x * 2) % 1, hit.uv.y),
    };
  }
  nearbyProp() {
    this.ray.setFromCamera(new THREE.Vector2(), this.camera);
    const hits = this.ray.intersectObjects([...this.props.values()], true);
    if (hits[0] && hits[0].distance < 2.1) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.prop) o = o.parent;
      return o?.userData.prop as string | undefined;
    }
    return undefined;
  }
  placement(): Vec3 | null {
    this.ray.setFromCamera(new THREE.Vector2(0, -0.18), this.camera);
    const hit = this.ray
      .intersectObjects(this.scene.children, true)
      .find(
        (h) =>
          h.distance < 2.2 &&
          h.object instanceof THREE.Mesh &&
          !this.hands.some(
            (hand) => hand === h.object || hand.getObjectById(h.object.id),
          ) &&
          ![...this.ceramics.values()].some((c) =>
            c.getObjectById(h.object.id),
          ) &&
          ![...this.props.values()].some((c) => c.getObjectById(h.object.id)),
      );
    if (!hit) return null;
    const normal = hit.face?.normal
      .clone()
      .transformDirection(hit.object.matrixWorld);
    if (!normal || normal.y < 0.6) return null;
    return [hit.point.x, hit.point.y + 0.025, hit.point.z];
  }
  getStats() {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      exposure:this.renderer.toneMappingExposure,
      meteredLuminance:this.exposure.meteredLuminance,
      shadowUpdates:this.shadowCache.updates,
      shadowReused:this.shadowCache.reused,
      shadowCasters:this.shadowCache.casterCount,
      fireShadowUpdates:this.fireShadowCache.updates,
      fireShadowReused:this.fireShadowCache.reused,
    };
  }
  activeBounds() {
    const o = this.ceramics.get(this.state.activeId || "");
    if (!o) return null;
    const box = new THREE.Box3().setFromObject(o),
      points: THREE.Vector3[] = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          points.push(new THREE.Vector3(x, y, z).project(this.camera));
    const xs = points.map((p) => ((p.x + 1) * innerWidth) / 2),
      ys = points.map((p) => ((1 - p.y) * innerHeight) / 2);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
}
