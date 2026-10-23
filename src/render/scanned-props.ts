import * as THREE from "three";
import { modelLoader } from './model-loader';

/** Complete authored props. Reuse topology/UVs, never rebuild their silhouette from primitives. */
export async function loadScannedProps(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const loader = modelLoader();
  const ids = ["chinese_console_table", "chinese_stool", "wicker_basket_01", "ceramic_pot", "wooden_bucket_01", "wooden_stool_01"];
  const models = new Map<string, THREE.Group>();
  await Promise.all(ids.map(async id => {
    const gltf = await loader.loadAsync(`/assets/scans/${id}/${id}.gltf`);
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = o.receiveShadow = true;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of materials) for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"] as const) {
        const t = (m as THREE.MeshStandardMaterial)[k];
        if (t) t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
      }
    });
    models.set(id, gltf.scene);
  }));
  const place = (id: string, p: number[], height: number, yaw = 0) => {
    const model = models.get(id)!.clone(true);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const scale = height / size.y;
    model.scale.multiplyScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const group = new THREE.Group(); group.name = `CC0_${id}`; group.add(model);
    group.position.fromArray(p); group.rotation.y = yaw; scene.add(group);
    return group;
  };
  // Ware and pigment storage: against the back wall, never in the carrying lane.
  place("chinese_console_table", [0, 0, 7.25], .80, Math.PI);
  place("chinese_stool", [4.35, 0, -6.75], .46, -.25);
  place("chinese_stool", [-4.65, 0, -6.62], .46, .20);
  place("wooden_stool_01", [-6.85, 0, 5.87], .39, .3);
  place("wooden_bucket_01", [-5.05, .01, -6.75], .43, .4);
  place("wooden_bucket_01", [8.05, .01, .85], .46, -.5);
  place("wooden_bucket_01", [-7.1, .01, 4.14], .40, 1.1);
  place("wicker_basket_01", [-5.03, .947, 5.12], .12, -.13);
  place("wicker_basket_01", [-.84, .978, 5.83], .09, .14);
  place("wicker_basket_01", [-7.9, .04, -.70], .14, .1);
  place("ceramic_pot", [6.25, 1.0, -6.16], .25, -.1);
  place("ceramic_pot", [-.56, .81, 7.25], .23, .6);
  place("ceramic_pot", [.40, .81, 7.25], .27, -.4);
}
