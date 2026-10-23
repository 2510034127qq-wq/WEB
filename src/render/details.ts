import * as THREE from "three";
import { makeWoodland } from "./woodland";
import { makeTerrain } from "./terrain";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Physical leaves and branches, instanced to keep the courtyard GPU budget bounded. */
export async function makeGarden(scene: THREE.Scene) {
  await makeWoodland(scene);
  await makeTerrain(scene);
}

export function makeWear(scene: THREE.Scene) {
  const rand = random(373);
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
  grad.addColorStop(0, "rgba(24,28,20,.42)");
  grad.addColorStop(0.5, "rgba(36,36,22,.24)");
  grad.addColorStop(1, "rgba(30,38,22,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 350; i++) {
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.18})`;
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 512, rand() * 20, 0, 7);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    toneMapped: false,
  });
  for (const [x, z, w, d] of [
    [-5.6, -5.6, 4, 2.7],
    [0, -5.6, 2.8, 2.6],
    [5.4, -5.6, 3.4, 2.4],
    [-7.4, -0.2, 2, 5],
    [7.4, -0.2, 2.3, 3.5],
    [6, 4, 4, 3],
    [-6, 5, 3.6, 2],
    [0, 5.8, 3.6, 2],
  ]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.006, z);
    scene.add(patch);
  }
  // Narrow damp line at the base of lime walls; dirt is attached to real surfaces.
  for (const side of [-1, 1]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 16), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(side * 8.7, 0.008, 0);
    scene.add(patch);
  }
  const brickMap = new THREE.TextureLoader().load(
    "/assets/textures/brick_diff.jpg",
  );
  brickMap.colorSpace = THREE.SRGBColorSpace;
  brickMap.wrapS = brickMap.wrapT = THREE.RepeatWrapping;
  brickMap.repeat.set(0.15, 0.035);
  brickMap.offset.set(0.32, 0.945);
  const mortar = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.51, 0.04),
    new THREE.MeshStandardMaterial({ color: "#a4a08d", roughness: 1 }),
  );
  mortar.position.set(0, 0.27, -7.83);
  mortar.receiveShadow = true;
  scene.add(mortar);
  const backdrop = new THREE.MeshStandardMaterial({
      color: "#8e8c83",
      map: brickMap,
      bumpMap: fineNoise(),
      bumpScale: 0.0017,
      roughness: 1,
    }),
    blocks = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.465, 0.162, 0.08, 2, 0.005),
      backdrop,
      111,
    ),
    matrix = new THREE.Matrix4();
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 37; i++) {
      matrix.makeTranslation(
        -8.8 + i * 0.48 + (j % 2) * 0.12,
        0.1 + j * 0.17,
        -7.81,
      );
      blocks.setMatrixAt(j * 37 + i, matrix);
    }
  blocks.receiveShadow = true;
  scene.add(blocks);
}

export function fineNoise(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    data = ctx.createImageData(size, size),
    rand = random(93);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 110 + rand() * 50;
    data.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
