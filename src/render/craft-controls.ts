import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { fineNoise } from "./details";
import type {MaterialSet} from './materials';
import type { StationId } from "../simulation/model";

export type CraftAction =
  | "supply-clay"
  | "clay-water"
  | "wheel-water"
  | "paint-ink"
  | "paint-water"
  | "glaze-dip"
  | "kiln-draft"
  | "kiln-fuel"
  | "kiln-light"
  | "kiln-seal"
  | "pack-paper";
export interface CraftHit {
  action: CraftAction;
  station: StationId;
  label: string;
  gesture: "press" | "hold" | "drag";
  point: THREE.Vector3;
  distance: number;
  object: THREE.Group;
}
export interface CraftDrag {
  action: CraftAction;
  point: THREE.Vector3;
  /** Normalized physical travel. Not a DOM slider. */
  value: number;
  overTarget: boolean;
}
interface Control {
  action: CraftAction;
  station: StationId;
  label: string;
  gesture: CraftHit["gesture"];
  root: THREE.Group;
  meshes: THREE.Mesh[];
  enabled: boolean;
  home: THREE.Vector3;
  value: number;
}

/** Diegetic, metre-scale workshop affordances. This class never changes game state.
 * The caller owns workflow validation and applies the returned physical actions.
 * All positions avoid the central working footprint of the ceramic vessel.
 */
export class CraftControls {
  readonly group = new THREE.Group();
  private controls = new Map<CraftAction, Control>();
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private focus: StationId | null = null;
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private dragState: {
    control: Control;
    start: THREE.Vector3;
    plane: THREE.Plane;
    initial: number;
    offset: THREE.Vector3;
    last: CraftDrag;
  } | null = null;
  private damper = new THREE.Group();
  private paperSheets: THREE.Mesh[] = [];
  private wetSurfaces: THREE.Mesh[] = [];
  private loader = new THREE.TextureLoader();
  private wood: THREE.MeshStandardMaterial;
  private stone: THREE.MeshStandardMaterial;
  private clay: THREE.MeshStandardMaterial;
  private ceramic: THREE.MeshPhysicalMaterial;
  private water: THREE.MeshPhysicalMaterial;
  private ink: THREE.MeshPhysicalMaterial;
  private paper: THREE.MeshStandardMaterial;
  private iron: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, private assets: Map<string, THREE.Object3D>,private surfaces:MaterialSet) {
    this.group.name = "physical-craft-controls";
    const noise = fineNoise();
    this.textures.add(noise);
    this.wood = this.material(
      new THREE.MeshStandardMaterial({
        color: "#ab9678",
        roughness: 0.89,
        map: this.texture("agedwood_diff", true),
        roughnessMap: this.texture("agedwood_rough"),
        normalMap: this.texture("agedwood_nor_gl"),
        normalScale: new THREE.Vector2(0.3, 0.3),
      }),
    );
    this.stone = this.material(
      new THREE.MeshStandardMaterial({
        color: "#413e34",
        roughness: 0.91,
        map: this.texture("ground_diff", true),
        bumpMap: noise,
        bumpScale: 0.0015,
      }),
    );
    this.clay = this.material(
      new THREE.MeshStandardMaterial({
        color: "#9b9583",
        roughness: 0.88,
        bumpMap: noise,
        bumpScale: 0.0014,
      }),
    );
    this.ceramic = this.material(
      new THREE.MeshPhysicalMaterial({
        color: "#6a5640",
        roughness: 0.37,
        clearcoat: 0.35,
        clearcoatRoughness: 0.23,
        bumpMap: noise,
        bumpScale: 0.00045,
      }),
    );
    this.water = this.material(
      new THREE.MeshPhysicalMaterial({
        color: "#e3e3d9",
        roughness: 0.045,
        metalness: 0,
        transmission: .94,
        thickness: .045,
        ior: 1.333,
        attenuationColor: new THREE.Color('#aeb5a0'),
        attenuationDistance: .22,
      }),
    );
    this.ink = this.material(
      new THREE.MeshPhysicalMaterial({
        color: "#101d26",
        roughness: 0.17,
        clearcoat: 0.72,
        clearcoatRoughness: 0.1,
        bumpMap: noise,
        bumpScale: 0.00005,
      }),
    );
    this.paper = this.material(
      new THREE.MeshStandardMaterial({
        color: "#baae8c",
        roughness: 1,
        side: THREE.DoubleSide,
        bumpMap: noise,
        bumpScale: 0.00035,
      }),
    );
    this.iron = this.material(
      new THREE.MeshStandardMaterial({
        color: "#393a33",
        metalness: 0.52,
        roughness: 0.69,
        bumpMap: noise,
        bumpScale: 0.0003,
      }),
    );
    this.makeSupply();
    this.makeWater("clay-water", "clay", [-5.18, 0.964, -5.55], 0.15);
    this.makeWater("wheel-water", "wheel", [-0.78, 0.81, -5.55], 0.125);
    this.makeSupport([-0.78, 0.81, -5.55], 0.30, 0.38);
    this.makeWater("paint-water", "paint", [5.84, 0.964, -5.58], 0.095);
    this.makeInk();
    this.makeGlazeTarget();
    this.makeKiln();
    this.makePaper();
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }
  private texture(name: string, srgb = false) {
    const texture = this.loader.load(`/assets/textures/${name}.jpg`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    return texture;
  }
  private mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number] = [0, 0, 0],
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private control(
    action: CraftAction,
    station: StationId,
    label: string,
    gesture: CraftHit["gesture"],
    position: [number, number, number],
  ) {
    const root = new THREE.Group();
    root.name = action;
    root.position.fromArray(position);
    this.group.add(root);
    const control: Control = {
      action,
      station,
      label,
      gesture,
      root,
      meshes: [],
      enabled: true,
      home: root.position.clone(),
      value: 0.5,
    };
    root.userData.craftAction = action;
    this.controls.set(action, control);
    return root;
  }
  private register() {
    for (const control of this.controls.values()) {
      control.meshes.length = 0;
      control.root.traverse((object) => {
        if (object instanceof THREE.Mesh) control.meshes.push(object);
      });
    }
  }
  private bowl(parent: THREE.Object3D, radius: number, height: number) {
    const profile = [
      [0, 0],
      [radius * 0.56, 0],
      [radius * 0.64, height * 0.08],
      [radius * 0.83, height * 0.45],
      [radius, height * 0.96],
      [radius, height],
      [radius * 0.94, height * 1.015],
      [radius * 0.9, height * 0.93],
      [radius * 0.72, height * 0.37],
      [radius * 0.48, height * 0.16],
      [0, height * 0.16],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0));
    const curve=new THREE.CatmullRomCurve3(profile,false,'centripetal');
    const points=curve.getPoints(96).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y));
    return this.mesh(parent, new THREE.LatheGeometry(points, 128), this.ceramic);
  }
  /** A three-plank stool under loose equipment, separate from draggable objects. */
  private makeSupport(
    position: [number, number, number],
    width: number,
    depth: number,
  ) {
    const stand = new THREE.Group();
    stand.position.fromArray(position);
    stand.name = "tool-stool";
    this.group.add(stand);
    for (let i = 0; i < 3; i++)
      this.mesh(
        stand,
        new RoundedBoxGeometry(width, 0.035, depth / 3 - 0.003, 2, 0.004),
        this.wood,
        [0, -0.018, ((i - 1) * depth) / 3],
      );
    const height = position[1] - 0.04;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const leg = this.mesh(
          stand,
          new THREE.CylinderGeometry(0.022, 0.028, height, 8),
          this.wood,
          [x * width * 0.36, -height / 2 - 0.035, z * depth * 0.34],
        );
        leg.rotation.z = x * 0.035;
      }
    this.mesh(
      stand,
      new THREE.CylinderGeometry(0.015, 0.015, width * 0.72, 8),
      this.wood,
      [0, -height * 0.7, 0],
    ).rotation.z = Math.PI / 2;
  }
  private makeWater(
    action: CraftAction,
    station: StationId,
    position: [number, number, number],
    radius: number,
  ) {
    const root = this.control(
      action,
      station,
      action === "paint-water" ? "清水碗 · 润笔" : "清水碗 · 手指蘸水",
      "press",
      position,
    );
    this.bowl(root, radius, radius * 0.62);
    const surface = this.mesh(
      root,
      new THREE.RingGeometry(.0001, radius * 0.84, 96, 24),
      this.water,
      [0, radius * 0.48, 0],
    );
    surface.rotation.x = -Math.PI / 2;
    surface.userData.radius=radius*.84;
    surface.userData.base=surface.geometry.attributes.position.array.slice();
    surface.userData.disturbedAt=-100;
    surface.castShadow = false;
    this.wetSurfaces.push(surface);
    // Small irregular water ring marks sit on the table, not over the liquid.
    const damp = this.material(
      new THREE.MeshStandardMaterial({
        color: "#393e32",
        roughness: 0.42,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    const ring = this.mesh(
      root,
      new THREE.RingGeometry(radius * 0.63, radius * 0.69, 48),
      damp,
      [radius * 0.2, 0.001, radius * 0.17],
    );
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
  }
  private lump(
    parent: THREE.Object3D,
    position: [number, number, number],
    size: number,
    seed: number,
  ) {
    const geometry = new THREE.SphereGeometry(size, 32, 20);
    const points = geometry.attributes.position;
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        y = points.getY(i),
        z = points.getZ(i);
      const wrinkle =
        1 +
        0.035 * Math.sin(x * 49 + seed) * Math.cos(z * 32 - y * 41) +
        0.023 * Math.sin(y * 70 + z * 24);
      points.setXYZ(
        i,
        x * wrinkle,
        Math.max(-size * 0.44, y * 0.72) * wrinkle,
        z * wrinkle,
      );
    }
    geometry.computeVertexNormals();
    return this.mesh(parent, geometry, this.clay, position);
  }
  private makeSupply() {
    const root = this.control(
      "supply-clay",
      "supply",
      "湿瓷土 · 掰下一团",
      "hold",
      [-5.74, 0.945, 4.98],
    );
    const clothMaterial=this.material(this.surfaces.linen.clone());
    clothMaterial.color.set('#b6af97');clothMaterial.side=THREE.DoubleSide;
    clothMaterial.normalScale.setScalar(.55);
    const clothGeometry=new THREE.PlaneGeometry(.72,.58,72,58),positions=clothGeometry.attributes.position,uv=clothGeometry.attributes.uv;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i);
      // A stored fold across the cloth relaxes under the weight of both billets.
      const loaded=Math.exp(-(((x+.09)/.11)**2)-((y+.025)/.14)**2)+Math.exp(-(((x-.11)/.10)**2)-((y-.035)/.13)**2);
      const fold=.0035*Math.exp(-((y/.018)**2))*Math.max(0,1-loaded);
      const hem=.0008*(Math.exp(-(((Math.abs(x)-.351)/.004)**2))+Math.exp(-(((Math.abs(y)-.281)/.004)**2)));
      // Poly Haven scan dimensions: 270.708 x 271.300 mm.
      positions.setZ(i,fold+hem);uv.setXY(i,(x+.36)/.270708,(y+.29)/.271300);
    }
    clothGeometry.computeVertexNormals();
    const cloth = this.mesh(
      root,
      clothGeometry,
      clothMaterial,
      [0, 0.003, 0],
    );
    cloth.rotation.x = -Math.PI / 2;
    root.add(this.assets.get("supply_clay")!);
  }
  private makeInk() {
    const root = this.control(
      "paint-ink",
      "paint",
      "青料砚 · 蘸料",
      "hold",
      [5.03, 0.964, -5.68],
    );
    this.mesh(
      root,
      new RoundedBoxGeometry(0.24, 0.025, 0.19, 3, 0.012),
      this.stone,
      [0, 0.014, 0],
    );
    const rim = this.mesh(
      root,
      new THREE.TorusGeometry(0.072, 0.009, 10, 48),
      this.stone,
      [0, 0.032, -0.008],
    );
    rim.scale.set(1.25, 0.82, 1);
    rim.rotation.x = -Math.PI / 2;
    const pigment = this.mesh(
      root,
      new THREE.CircleGeometry(0.065, 48),
      this.ink,
      [0, 0.031, -0.008],
    );
    pigment.rotation.x = -Math.PI / 2;
    pigment.scale.set(1.25, 0.82, 1);
    pigment.castShadow = false;
    // A separate little grinding stone has a flattened underside and worn edges.
    const stone = this.mesh(
      root,
      new THREE.SphereGeometry(0.033, 20, 12),
      this.stone,
      [-0.076, 0.047, 0.055],
    );
    stone.scale.set(1, 0.46, 0.74);
    const rest = this.mesh(
      root,
      new THREE.TorusGeometry(0.025, 0.012, 12, 16, Math.PI),
      this.ceramic,
      [-0.17, 0.015, 0.02],
    );
    rest.rotation.y = Math.PI / 2;
  }
  private makeGlazeTarget() {
    // The existing vat is at this exact coordinate. This invisible ray surface
    // avoids a second vat or any visible UI; it is above the real glaze surface.
    const root = this.control(
      "glaze-dip",
      "glaze",
      "釉桶 · 按住向下浸入，向上提起",
      "drag",
      [7.2, 1.345, 0.48],
    );
    const material = this.material(
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    );
    const surface = this.mesh(
      root,
      new THREE.CircleGeometry(0.272, 48),
      material,
    );
    surface.rotation.x = -Math.PI / 2;
    surface.castShadow = surface.receiveShadow = false;
  }
  private makeKiln() {
    // The existing front arch is at z=3.94; the fire mouth is x=6, y<1.
    const draft = this.control(
      "kiln-draft",
      "kiln",
      "风闸 · 左右推拉",
      "drag",
      [6.84, 0.69, 3.81],
    );
    this.mesh(
      draft,
      new RoundedBoxGeometry(0.44, 0.27, 0.035, 2, 0.006),
      this.stone,
    );
    for (let i = 0; i < 4; i++)
      this.mesh(draft, new THREE.BoxGeometry(0.028, 0.155, 0.035), this.iron, [
        -0.15 + i * 0.1,
        0,
        -0.023,
      ]);
    draft.add(this.damper);
    this.mesh(
      this.damper,
      new RoundedBoxGeometry(0.42, 0.245, 0.034, 2, 0.009),
      this.iron,
      [0, 0, -0.055],
    );
    const handle = this.mesh(
      this.damper,
      new THREE.TorusGeometry(0.038, 0.007, 10, 24),
      this.iron,
      [0.12, 0, -0.092],
    );
    handle.scale.y = 1.35;
    this.setValue("kiln-draft", 0.5);

    this.makeSupport([5.06, 0.42, 3.43], 0.52, 0.76);
    const fuel = this.control(
      "kiln-fuel",
      "kiln",
      "松柴 · 拖入炉口",
      "drag",
      [5.06, 0.48, 3.43],
    );
    for (let i = 0; i < 3; i++) {
      const log = this.mesh(
        fuel,
        new THREE.CylinderGeometry(0.046, 0.058, 0.5, 7, 3),
        this.wood,
        [(i - 1) * 0.078, i === 1 ? 0.06 : 0, 0],
      );
      log.rotation.set(Math.PI / 2, 0.06 * (i - 1), 0.09 * (i - 1));
    }
    this.makeSupport([6.95, 0.45, 3.5], 0.6, 0.5);
    const seal = this.control(
      "kiln-seal",
      "kiln",
      "封窑砖 · 拖向窑门",
      "drag",
      [6.95, 0.48, 3.5],
    );
    const brick=this.material(this.surfaces.brick.clone());
    brick.normalScale.setScalar(.65);
    for (let i = 0; i < 3; i++)
      {
      const geometry=new RoundedBoxGeometry(0.25,0.085,0.12,4,.004),uv=geometry.attributes.uv;
      // Sample the interior of one photographed brick, excluding mortar. The
      // original 0..1 UVs pasted an entire wall onto every individual face.
      for(let j=0;j<uv.count;j++)uv.setXY(j,.315+uv.getX(j)*.165,.652+uv.getY(j)*.038);
      this.mesh(
        seal,
        geometry,
        brick,
        [0, i * 0.088, 0],
      );
      }

    const light = this.control(
      "kiln-light",
      "kiln",
      "火折子 · 持近炉口点火",
      "drag",
      [5.18, 0.442, 3.74],
    );
    const tube = this.mesh(
      light,
      new THREE.CylinderGeometry(0.017, 0.019, 0.18, 20),
      this.wood,
    );
    tube.rotation.z = Math.PI / 2;
    const ember = this.material(
      new THREE.MeshStandardMaterial({
        color: "#2f2920",
        emissive: "#ae3004",
        emissiveIntensity: 0.6,
        roughness: 1,
      }),
    );
    this.mesh(
      light,
      new THREE.SphereGeometry(0.013, 12, 8),
      ember,
      [-0.087, 0, 0],
    );
  }
  private makePaper() {
    const root = this.control(
      "pack-paper",
      "display",
      "包装纸 · 拉过器身",
      "drag",
      [-0.45, 0.965, 5.65],
    );
    for (let layer = 0; layer < 3; layer++) {
      const geometry = new THREE.PlaneGeometry(0.54, 0.64, 24, 26);
      const points = geometry.attributes.position;
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i),
          y = points.getY(i);
        const edge =
          Math.pow(Math.abs(x) / 0.27, 12) + Math.pow(Math.abs(y) / 0.32, 12);
        points.setXYZ(
          i,
          x + Math.sin(i * 8.13) * 0.0009,
          y + Math.cos(i * 7.53) * 0.0014,
          0.0015 * Math.sin(x * 33 + y * 21) +
            edge * 0.004 * Math.sin(y * 17 + layer),
        );
      }
      geometry.computeVertexNormals();
      const sheet = this.mesh(root, geometry, this.paper, [
        layer * 0.005,
        layer * 0.0018,
        0,
      ]);
      sheet.rotation.set(-Math.PI / 2, 0, layer * 0.018);
      this.paperSheets.push(sheet);
    }
    this.register();
  }

  /** Null permits world interaction; a station restricts focused work to its props. */
  setFocus(station: StationId | null) {
    this.focus = station;
  }
  setEnabled(action: CraftAction, enabled: boolean) {
    const control = this.controls.get(action);
    if (control) control.enabled = enabled;
  }
  setValue(action: CraftAction, value: number) {
    const control = this.controls.get(action);
    if (!control) return;
    control.value = THREE.MathUtils.clamp(value, 0, 1);
    if (action === "kiln-draft") this.damper.position.x = control.value * 0.35;
    if (action === "pack-paper") {
      const top = this.paperSheets.at(-1);
      if (top) {
        // Lift the edge while the vessel's parcel performs the actual folding.
        top.rotation.x = -Math.PI / 2 + control.value * 0.35;
        top.position.y = 0.004 + control.value * 0.035;
      }
    }
  }
  private pointRay(
    camera: THREE.Camera,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    this.pointer.set((x / width) * 2 - 1, 1 - (y / height) * 2);
    camera.updateMatrixWorld();
    this.group.updateMatrixWorld(true);
    this.ray.setFromCamera(this.pointer, camera);
  }
  /** Pixel coordinates are relative to the canvas (subtract its bounding rect). */
  hit(
    camera: THREE.Camera,
    x: number,
    y: number,
    width: number,
    height: number,
  ): CraftHit | null {
    if (width <= 0 || height <= 0) return null;
    this.pointRay(camera, x, y, width, height);
    let closest: CraftHit | null = null;
    for (const control of this.controls.values()) {
      if (
        !control.enabled ||
        !control.root.visible ||
        (this.focus && control.station !== this.focus)
      )
        continue;
      const hit = this.ray.intersectObjects(control.meshes, false)[0];
      const reach = control.station === "kiln" ? 2.65 : 2.2;
      if (
        !hit ||
        hit.distance > reach ||
        (closest && hit.distance >= closest.distance)
      )
        continue;
      closest = {
        action: control.action,
        station: control.station,
        label: control.label,
        gesture: control.gesture,
        point: hit.point,
        distance: hit.distance,
        object: control.root,
      };
    }
    return closest;
  }
  beginDrag(hit: CraftHit, camera: THREE.Camera) {
    const control = this.controls.get(hit.action);
    if (!control || !control.enabled || control.gesture !== "drag")
      return false;
    const normal = camera.getWorldDirection(new THREE.Vector3());
    this.dragState = {
      control,
      start: hit.point.clone(),
      initial: control.value,
      offset: control.root.position.clone().sub(hit.point),
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point),
      last: {
        action: hit.action,
        point: hit.point.clone(),
        value: control.value,
        overTarget: false,
      },
    };
    return true;
  }
  drag(
    camera: THREE.Camera,
    x: number,
    y: number,
    width: number,
    height: number,
  ): CraftDrag | null {
    const state = this.dragState;
    if (!state) return null;
    this.pointRay(camera, x, y, width, height);
    const point = this.ray.ray.intersectPlane(state.plane, new THREE.Vector3());
    if (!point) return state.last;
    const control = state.control,
      action = control.action;
    const delta = point.clone().sub(state.start);
    let value = state.initial,
      overTarget = false;
    if (action === "kiln-draft") {
      value = state.initial + delta.x / 0.35;
      this.setValue(action, value);
    } else if (action === "glaze-dip") {
      value = state.initial - delta.y / 0.42;
    } else if (action === "pack-paper") {
      const vessel = new THREE.Vector3(0, 1.12, 5.8);
      state.plane.projectPoint(vessel, vessel);
      const towardVessel = vessel.sub(state.start).normalize();
      value = THREE.MathUtils.clamp(delta.dot(towardVessel) / 0.52, 0, 1);
      this.setValue(action, value);
      overTarget = value > 0.9;
    } else {
      // Fuel/tinder/brick travel along the screen plane; the target is evaluated
      // against the actual mouth projected onto that same plane, not UI pixels.
      const maxTravel = 1.8;
      if (delta.length() > maxTravel) delta.setLength(maxTravel);
      control.root.position.copy(state.start).add(delta).add(state.offset);
      const target = new THREE.Vector3(
        6,
        action === "kiln-seal" ? 1.05 : 0.55,
        3.8,
      );
      state.plane.projectPoint(target, target);
      const distance = point.distanceTo(target);
      overTarget = distance < (action === "kiln-seal" ? 0.6 : 0.42);
      value = THREE.MathUtils.clamp(1 - distance / 1.5, 0, 1);
    }
    state.last = {
      action,
      point,
      value: THREE.MathUtils.clamp(value, 0, 1),
      overTarget,
    };
    return state.last;
  }
  /** Returns the release result; reusable supply items return to their real home. */
  endDrag(): CraftDrag | null {
    const state = this.dragState;
    if (!state) return null;
    if (["kiln-fuel", "kiln-light", "kiln-seal"].includes(state.control.action))
      state.control.root.position.copy(state.control.home);
    this.dragState = null;
    return state.last;
  }
  /** Optional small water motion in seconds. No gameplay timing is performed here. */
  disturb(action: CraftAction, time: number) {
    const root=this.controls.get(action)?.root;
    for(const surface of this.wetSurfaces) if(surface.parent===root) surface.userData.disturbedAt=time;
  }
  update(time: number) {
    for (let i = 0; i < this.wetSurfaces.length; i++) {
      const surface = this.wetSurfaces[i];
      const positions=surface.geometry.attributes.position, base=surface.userData.base as Float32Array,
        age=time-surface.userData.disturbedAt, radius=surface.userData.radius as number;
      if(surface.userData.settled && (age<0 || age>4)) continue;
      for(let j=0;j<positions.count;j++) {
        const x=base[j*3], y=base[j*3+1], r=Math.hypot(x,y), edge=r/radius;
        // Capillary meniscus hugs the wall. Disturbances travel outward and decay.
        const meniscus=.0014*Math.pow(edge,16);
        const ripple=age>=0&&age<4?.0011*Math.sin(r*160-age*13)*Math.exp(-age*1.4)*(1-edge**4):0;
        positions.setZ(j,meniscus+ripple);
      }
      positions.needsUpdate=true;surface.geometry.computeVertexNormals();
      surface.userData.settled=age<0 || age>4;
    }
  }
  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) geometries.add(object.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.group.removeFromParent();
  }
}
