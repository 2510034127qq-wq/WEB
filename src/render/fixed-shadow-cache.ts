import * as THREE from "three";

type Snapshot = { frame: number; values: number[] };

/** Reuse the exact depth map while its casters and light are unchanged.
 * Camera motion does not change this fixed, world-space shadow projection.
 * Never reuse a map after moving, hiding, adding or deforming a caster.
 */
export class FixedShadowCache {
  private snapshots = new WeakMap<THREE.Object3D, Snapshot>();
  private frame = 0;
  private previousCount = -1;
  private previousLight: number[] = [];
  private identities = new WeakMap<object, number>();
  private nextIdentity = 0;
  updates = 0;
  reused = 0;
  casterCount = 0;

  private identity(object: object | null | undefined) {
    if (!object) return -1;
    let id = this.identities.get(object);
    if (id === undefined) {
      id = ++this.nextIdentity;
      this.identities.set(object, id);
    }
    return id;
  }

  private changed(previous: number[], next: number[]) {
    return (
      previous.length !== next.length ||
      next.some((value, i) => value !== previous[i])
    );
  }

  needsUpdate(
    scene: THREE.Scene,
    light: THREE.DirectionalLight | THREE.PointLight,
    camera: THREE.Camera,
  ) {
    scene.updateMatrixWorld();
    if (light instanceof THREE.DirectionalLight)
      light.target.updateWorldMatrix(true, false);
    const shadow = light.shadow;
    const lightState = [
      ...light.matrixWorld.elements,
      ...(light instanceof THREE.DirectionalLight ? light.target.matrixWorld.elements : [light.distance]),
      ...shadow.camera.projectionMatrix.elements,
      shadow.mapSize.x,
      shadow.mapSize.y,
      shadow.camera.near,
      shadow.camera.far,
      camera.layers.mask,
    ];
    let changed = this.changed(this.previousLight, lightState);
    this.previousLight = lightState;
    this.frame++;
    let count = 0;
    scene.traverseVisible((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !object.castShadow ||
        !object.layers.test(camera.layers)
      )
        return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      if (!materials.some((material) => material.visible)) return;
      count++;
      const geometry = object.geometry;
      const values = [
        ...object.matrixWorld.elements,
        geometry.id,
        this.identity(geometry.index),
        geometry.index?.version ?? -1,
        geometry.drawRange.start,
        geometry.drawRange.count,
      ];
      for (const attribute of [
        "position",
        "uv",
        "uv1",
        "skinIndex",
        "skinWeight",
      ]) {
        const data = geometry.getAttribute(attribute);
        values.push(
          this.identity(data),
          data
            ? "isInterleavedBufferAttribute" in data
              ? data.data.version
              : data.version
            : -1,
        );
      }
      for (const name of ["position", "normal", "color"] as const)
        for (const data of geometry.morphAttributes[name] || [])
          values.push(
            this.identity(data),
            "isInterleavedBufferAttribute" in data
              ? data.data.version
              : data.version,
          );
      for (const group of geometry.groups)
        values.push(group.start, group.count, group.materialIndex ?? 0);
      for (const source of materials) {
        const material = source as THREE.MeshStandardMaterial;
        values.push(
          this.identity(material),
          Number(material.visible),
          material.version,
          material.side,
          material.shadowSide ?? -1,
          material.alphaTest,
          Number(material.alphaToCoverage),
          material.displacementScale ?? 0,
          material.displacementBias ?? 0,
        );
        for (const texture of [
          material.map,
          material.alphaMap,
          material.displacementMap,
        ]) {
          values.push(texture?.id ?? -1, texture?.version ?? -1);
          if (texture) {
            if (texture.matrixAutoUpdate) texture.updateMatrix();
            values.push(...texture.matrix.elements);
          }
        }
      }
      if (object instanceof THREE.InstancedMesh)
        values.push(
          object.count,
          this.identity(object.instanceMatrix),
          object.instanceMatrix.version,
        );
      if (object.morphTargetInfluences)
        values.push(...object.morphTargetInfluences);
      if (object instanceof THREE.SkinnedMesh) {
        object.skeleton.update();
        values.push(
          ...object.skeleton.boneMatrices,
          ...object.bindMatrix.elements,
          ...object.bindMatrixInverse.elements,
        );
      }
      // Custom depth shaders may animate without changing a geometry buffer.
      // Conservatively render those every frame instead of assuming stability.
      if (light instanceof THREE.PointLight ? object.customDistanceMaterial : object.customDepthMaterial) changed = true;
      const previous = this.snapshots.get(object);
      if (
        !previous ||
        previous.frame !== this.frame - 1 ||
        this.changed(previous.values, values)
      )
        changed = true;
      this.snapshots.set(object, { frame: this.frame, values });
    });
    if (count !== this.previousCount) changed = true;
    this.previousCount = this.casterCount = count;
    return changed;
  }

  update(
    scene: THREE.Scene,
    light: THREE.DirectionalLight | THREE.PointLight,
    camera: THREE.Camera,
    enabled: boolean,
  ) {
    const changed = this.needsUpdate(scene, light, camera);
    light.shadow.autoUpdate = !enabled;
    light.shadow.needsUpdate ||= changed || !light.shadow.map;
    if (!enabled || light.shadow.needsUpdate) this.updates++;
    else this.reused++;
  }
}
