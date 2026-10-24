import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FixedShadowCache } from "../src/render/fixed-shadow-cache";

function setup() {
  const scene = new THREE.Scene(),
    light = new THREE.DirectionalLight(),
    camera = new THREE.PerspectiveCamera();
  const cache = new FixedShadowCache(),
    group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  mesh.castShadow = true;
  group.add(mesh);
  scene.add(group, light, light.target);
  const changed = () => cache.needsUpdate(scene, light, camera);
  expect(changed()).toBe(true);
  expect(changed()).toBe(false);
  return { scene, light, camera, mesh, group, cache, changed };
}

describe("solar shadow reuse", () => {
  it("reuses point-light depth through flicker, but refreshes for range, casters and custom distance shaders", () => {
    const scene = new THREE.Scene(), light = new THREE.PointLight(), camera = new THREE.PerspectiveCamera();
    const cache = new FixedShadowCache();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.castShadow = true;
    scene.add(light, mesh);
    const changed = () => cache.needsUpdate(scene, light, camera);
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    light.intensity = 25;
    light.color.set('#ff6b1b');
    expect(changed()).toBe(false);
    light.distance = 8;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    mesh.rotation.y = .3;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial();
    expect(changed()).toBe(true);
    expect(changed()).toBe(true);
  });
  it("keeps the map through camera motion, but updates for moved, hidden, removed and replaced casters", () => {
    const { camera, mesh, group, changed } = setup();
    camera.position.set(7, 2, -4);
    camera.lookAt(0, 1, 0);
    expect(changed()).toBe(false);
    group.position.x = 1;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    group.visible = false;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    group.visible = true;
    expect(changed()).toBe(true);
    group.remove(mesh);
    group.add(mesh.clone());
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    group.clear();
    expect(changed()).toBe(true);
  });

  it("invalidates for shaping, alpha cutouts, light changes and instanced transforms", () => {
    const { scene, mesh, light, changed } = setup();
    mesh.geometry.attributes.position.setY(0, 2);
    mesh.geometry.attributes.position.needsUpdate = true;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    mesh.material.alphaMap = new THREE.Texture();
    mesh.material.alphaTest = 0.35;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    mesh.material.alphaMap.offset.x = 0.2;
    expect(changed()).toBe(true);
    light.target.position.x = 1;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    light.shadow.mapSize.setScalar(2048);
    expect(changed()).toBe(true);
    const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, 2);
    instances.castShadow = true;
    scene.add(instances);
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 2, 3));
    instances.instanceMatrix.needsUpdate = true;
    expect(changed()).toBe(true);
  });

  it("invalidates skeletal motion even when the mesh transform is unchanged", () => {
    const { scene, changed } = setup();
    const bone = new THREE.Bone(),
      mesh = new THREE.SkinnedMesh(
        new THREE.BoxGeometry(),
        new THREE.MeshStandardMaterial(),
      );
    mesh.castShadow = true;
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]));
    scene.add(mesh);
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
    bone.rotation.x = 0.2;
    expect(changed()).toBe(true);
    expect(changed()).toBe(false);
  });
});
