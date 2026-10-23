import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { fineNoise, makeGarden, makeWear } from "./details";
import { Ceramic } from "./ceramic";
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
  ao: SSAOPass;
  board: THREE.Mesh;
  contact: THREE.Vector3 | null = null;
  contactNormal = new THREE.Vector3(0, 0, 1);
  action = "";
  packId: string | null = null;
  packProgress = 0;
  dipDepth = 1;
  private parcel = new THREE.Group();
  private paperFlaps: THREE.Group[] = [];
  private strawTies: THREE.Mesh[] = [];
  private kilnSeal = new THREE.Group();
  private brushPose = new THREE.Object3D();
  private wheelHead = new THREE.Group();
  private dipAmount = 0;
  private skinMaterials = new Set<THREE.MeshStandardMaterial>();
  private forearms: THREE.Mesh[] = [];
  sun = new THREE.DirectionalLight("#ffedcc", 3.2);
  fire = new THREE.PointLight("#ff6b1b", 0, 8, 1.5);
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color("#c8cfc4");
    this.scene.fog = new THREE.Fog("#c8cfc4", 24, 65);
    this.camera.rotation.order = "YXZ";
    this.camera.position.fromArray(state.player);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.environmentIntensity = 0.35;
    this.scene.add(new THREE.HemisphereLight("#d9e6e3", "#746348", 1.05));
    this.sun.position.set(-7, 11, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -13,
      right: 13,
      top: 13,
      bottom: -13,
      near: 0.1,
      far: 35,
    });
    this.sun.shadow.normalBias = 0.009;
    this.sun.shadow.bias = -0.00006;
    this.sun.target.position.set(0, 0, -2);
    this.scene.add(this.sun, this.sun.target);
    this.fire.position.set(6, 1, 4);
    this.scene.add(this.fire);
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = 4;
    this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new SSAOPass(
      this.scene,
      this.camera,
      innerWidth,
      innerHeight,
      16,
    );
    this.ao.kernelRadius = 0.28;
    this.ao.minDistance = 0.0004;
    this.ao.maxDistance = 0.012;
    this.composer.addPass(this.ao);
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
    const loader = new GLTFLoader();
    onProgress("木构、窑砖与石阶");
    const gltf = await loader.loadAsync("/assets/workshop.glb");
    const textures = new THREE.TextureLoader();
    const loaded: Promise<unknown>[] = [];
    const maps: Record<string, string> = {
      weathered_wood: "agedwood",
      lime_plaster: "wall",
      courtyard_stone: "ground",
      kiln_firebrick: "brick",
    };
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = o.receiveShadow = true;
        const mat = o.material as THREE.MeshStandardMaterial;
        const prefix = maps[mat.name];
        if (prefix) {
          mat.color.set("#ffffff");
          for (const [channel, key] of [
            ["diff", "map"],
            ["rough", "roughnessMap"],
            ["nor_gl", "normalMap"],
          ] as const) {
            loaded.push(
              textures
                .loadAsync(`/assets/textures/${prefix}_${channel}.jpg`)
                .then((t) => {
                  t.wrapS = t.wrapT = THREE.RepeatWrapping;
                  t.anisotropy = Math.min(
                    8,
                    this.renderer.capabilities.getMaxAnisotropy(),
                  );
                  if (channel === "diff") t.colorSpace = THREE.SRGBColorSpace;
                  mat[key] = t;
                  mat.needsUpdate = true;
                }),
            );
          }
          mat.normalScale.setScalar(0.65);
        }
        if (
          mat.name === "bamboo_leaves" ||
          mat.name === "grey_fired_roof_tiles"
        )
          mat.side = THREE.DoubleSide;
        if (mat.name === "weathered_wood") {
          mat.color.set("#af9f86");
          mat.roughness = 1;
        }
        if (mat.name === "lime_plaster") mat.color.set("#d1c7af");
        if (mat.name === "courtyard_stone") mat.color.set("#c2c0ac");
        if (mat.name === "grey_fired_roof_tiles") mat.color.set("#3d4746");
        if (
          mat.name === "unglazed_stoneware" ||
          mat.name === "grey_fired_roof_tiles"
        ) {
          mat.bumpMap = fineNoise();
          mat.bumpScale = 0.0025;
        }
      }
    });
    this.scene.add(gltf.scene);
    await Promise.all(loaded);
    onProgress("双手与工具");
    const hands = await loader.loadAsync("/assets/hands.glb");
    for (let i = 0; i < 2; i++) {
      const hand = clone(hands.scene);
      hand.scale.set(i === 0 ? -1 : 1, 1, 1);
      hand.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mat = o.material as THREE.MeshStandardMaterial;
          if (mat.name === "warm_skin") {
            mat.bumpMap = fineNoise();
            mat.bumpScale = 0.00018;
            mat.color.set("#b68c6b");
            this.skinMaterials.add(mat);
          }
          if (mat.name === "indigo_cotton") {
            mat.bumpMap = fineNoise();
            mat.bumpScale = 0.0005;
            mat.color.set("#293e40");
          }
        }
        if (o instanceof THREE.Bone)
          o.userData.restQuaternion = o.quaternion.clone();
      });
      this.scene.add(hand);
      this.hands.push(hand);
    }
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.072, 1, 28, 8),
        new THREE.MeshStandardMaterial({
          color: "#293e40",
          roughness: 0.96,
          bumpMap: fineNoise(),
          bumpScale: 0.0005,
        }),
      );
      arm.castShadow = arm.receiveShadow = true;
      arm.visible = false;
      this.forearms.push(arm);
      this.scene.add(arm);
    }
    this.makeProps();
    this.makeSigns();
    this.makeAtmosphere();
    makeGarden(this.scene);
    makeWear(this.scene);
    this.sync();
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
    const wheelMat = new THREE.MeshStandardMaterial({
      color: "#746650",
      roughness: 0.8,
      map: new THREE.TextureLoader().load("/assets/textures/agedwood_diff.jpg"),
      bumpMap: fineNoise(),
      bumpScale: 0.0007,
    });
    wheelMat.map!.colorSpace = THREE.SRGBColorSpace;
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.015, 96),
      wheelMat,
    );
    head.castShadow = head.receiveShadow = true;
    this.wheelHead.add(head);
    this.wheelHead.position.set(0, 0.772, -5.6);
    this.scene.add(this.wheelHead);
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.17 + i * 0.037, 0.0008, 6, 96),
        new THREE.MeshStandardMaterial({
          color: "#665c48",
          roughness: 0.45,
          transparent: true,
          opacity: 0.24,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.008;
      this.wheelHead.add(ring);
    }
    const profile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.28, 0),
      new THREE.Vector2(0.3, 0.38),
      new THREE.Vector2(0.28, 0.4),
      new THREE.Vector2(0.26, 0.04),
      new THREE.Vector2(0, 0.04),
    ];
    const tub = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 64),
      new THREE.MeshStandardMaterial({
        color: "#62503b",
        roughness: 0.9,
        bumpMap: fineNoise(),
        bumpScale: 0.003,
        side: THREE.DoubleSide,
      }),
    );
    tub.position.set(7.2, 0.99, 0.48);
    tub.castShadow = tub.receiveShadow = true;
    this.scene.add(tub);
    const slurry = new THREE.Mesh(
      new THREE.CircleGeometry(0.275, 64),
      new THREE.MeshPhysicalMaterial({
        color: "#b9bdac",
        roughness: 0.35,
        clearcoat: 0.25,
      }),
    );
    slurry.rotation.x = -Math.PI / 2;
    slurry.position.set(7.2, 1.34, 0.48);
    this.scene.add(slurry);
    for (const name of ["brush", "knife", "sagger", "bamboo"]) {
      const group = new THREE.Group();
      if (name === "sagger") {
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
        3.82 + Math.floor(i / 3) * 0.11,
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
      this.state.settings.quality === "high" ? 2048 : 1024,
    );
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }
  pose(dt: number, yaw: number, pitch: number, walking: boolean, time: number) {
    const s = this.focus
      ? STATIONS.find((v) => v.id === this.focus)
      : undefined;
    const p = this.state.pieces.find((p) => p.id === this.state.activeId);
    let goal = new THREE.Vector3(...this.state.player);
    let fov = 62;
    if (s) {
      const pos = new THREE.Vector3(...s.pos);
      const close =
        ["wheel", "paint", "glaze", "display"].includes(s.id) &&
        p?.location === s.id;
      if (close) {
        const distance = Math.max(0.68, (p?.height || 0.2) * 2.1);
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
        fov = 43;
      } else {
        goal.fromArray(s.approach);
        this.target.position.copy(goal);
        this.target.lookAt(pos.clone().add(new THREE.Vector3(0, 0.25, 0)));
        fov = 55;
      }
      if (s.id === "glaze") {
        goal.set(5.95, 1.92, 0.38);
        this.target.position.copy(goal);
        this.target.lookAt(new THREE.Vector3(7.2, 1.2, 0.38));
        fov = 52;
      }
      if (s.id === "kiln") {
        goal.set(3.9, 1.85, 1.05);
        this.target.position.copy(goal);
        this.target.lookAt(new THREE.Vector3(6, 1.35, 5.2));
        fov = 61;
      }
      this.camera.quaternion.slerp(
        this.target.quaternion,
        1 - Math.exp(-dt * 5),
      );
    } else {
      if (this.state.settings.bob && walking)
        goal.y += Math.sin(time * 9) * 0.018;
      this.target.rotation.order = "YXZ";
      this.target.rotation.set(pitch, yaw, 0);
      this.camera.quaternion.slerp(
        this.target.quaternion,
        1 - Math.exp(-dt * 18),
      );
    }
    this.camera.position.lerp(goal, 1 - Math.exp(-dt * (s ? 5 : 18)));
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 6, dt);
    this.camera.updateProjectionMatrix();
  }
  update(dt: number, time: number) {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    const p = this.state.pieces.find((p) => p.id === this.state.activeId);
    this.dipAmount = THREE.MathUtils.damp(
      this.dipAmount,
      this.action === "dip" ? 1 : 0,
      5,
      dt,
    );
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
      if (this.action === "prepare" && item.location === "clay") {
        const squash = 1 + Math.sin(time * 8) * 0.09;
        o.mesh.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      }
      if (item.location === "glaze") {
        o.position.z += this.dipAmount * 0.68;
        o.position.y +=
          Math.sin(this.dipAmount * Math.PI) * 0.44 +
          this.dipAmount *
            (1.34 - item.height * this.dipDepth - item.position[1]);
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
    if (p?.location === "paint" && this.focus === "paint") {
      const brush = this.props.get("brush")!;
      const target =
        this.contact ||
        new THREE.Vector3(...p.position).add(
          new THREE.Vector3(p.radius[24] * 0.6, p.height * 0.5, p.radius[24]),
        );
      const normal = this.contact
        ? this.contactNormal
        : new THREE.Vector3(0.3, 0.5, 1).normalize();
      brush.position.copy(target).addScaledVector(normal, 0.135);
      brush.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        normal.clone().negate(),
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
    }
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
        const r =
          p.radius[
            this.focus === "glaze" ? 47 : Math.floor(this.workMotion * 47)
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
            : 0.04 + p.height * (0.3 + this.workMotion * 0.4);
        h.rotation.set(
          0,
          Math.atan2(toward.x, toward.z) + side * 0.7,
          -side * 0.15,
        );
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
      if (work && this.focus === "paint" && i === 1) {
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
          b.rotateX(-(work ? 0.1 : 0.35) - (j === 0 ? 0 : 0.12));
        }
      });
      const arm = this.forearms[i];
      arm.visible = h.visible;
      if (h.visible) {
        h.updateMatrixWorld(true);
        const wrist = h.localToWorld(new THREE.Vector3(0, 0, 0.26)),
          elbow = new THREE.Vector3(side * 0.38, -0.64, -0.06)
            .applyQuaternion(this.camera.quaternion)
            .add(this.camera.position);
        arm.position.copy(wrist).lerp(elbow, 0.5);
        arm.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          wrist.clone().sub(elbow).normalize(),
        );
        arm.scale.y = wrist.distanceTo(elbow);
      }
    });
    for (const skin of this.skinMaterials) {
      skin.color.set(
        p && ["raw", "prepared", "thrown"].includes(p.stage)
          ? "#a49679"
          : "#b68c6b",
      );
      skin.roughness =
        p && ["raw", "prepared", "thrown"].includes(p.stage) ? 0.49 : 0.68;
    }
    const heat =
      this.state.kiln.phase === "firing"
        ? Math.max(0.2, this.state.kiln.temperature / 1300)
        : this.state.kiln.phase === "cooling"
          ? this.state.kiln.temperature / 1600
          : 0;
    this.kilnSeal.visible = this.state.kiln.phase !== "idle";
    this.fire.intensity = heat * (25 + Math.sin(time * 13) * 2);
    for (let i = 0; i < this.flames.length; i++) {
      const m = this.flames[i];
      m.visible = this.state.kiln.phase === "firing";
      m.scale.set(1, heat * (0.8 + Math.sin(time * 9 + i * 7) * 0.2), 1);
      m.position.y = 0.43 + m.scale.y * 0.42;
      (m.material as THREE.ShaderMaterial).uniforms.time.value = time;
    }
    if (this.dust) this.dust.rotation.y = time * 0.004;
    if (this.state.settings.quality === "high") {
      this.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(
        this.camera.projectionMatrix,
      );
      this.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
        this.camera.projectionMatrixInverse,
      );
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
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
