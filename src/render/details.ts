import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

function random(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Physical leaves and branches, instanced to keep the courtyard GPU budget bounded. */
export async function makeGarden(scene: THREE.Scene) {
  const rand = random(1743),
    dummy = new THREE.Object3D(),
    color = new THREE.Color();
  const loader = new THREE.TextureLoader();
  const [leafColour, leafAlpha, leafNormal] = await Promise.all([
    loader.loadAsync("/assets/vegetation/leaf_diff.jpg"),
    loader.loadAsync("/assets/vegetation/leaf_alpha.png"),
    loader.loadAsync("/assets/vegetation/leaf_nor_gl.jpg"),
  ]);
  leafColour.colorSpace = THREE.SRGBColorSpace;
  const foliage = new THREE.PlaneGeometry(0.17, 0.22, 2, 2);
  foliage.rotateX(-Math.PI / 2);
  const uv = foliage.attributes.uv,
    position = foliage.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i),
      v = uv.getY(i);
    // One actual photographed leaf on the source atlas, including its alpha silhouette.
    uv.setXY(i, 0.67 + u * 0.18, 0.7 + v * 0.15);
    position.setY(i, Math.sin(u * Math.PI) * 0.018);
  }
  foliage.computeVertexNormals();
  const leafMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: leafColour,
    alphaMap: leafAlpha,
    normalMap: leafNormal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    alphaTest: 0.52,
    roughness: 0.77,
    side: THREE.DoubleSide,
  });
  const leaves = new THREE.InstancedMesh(foliage, leafMat, 40000);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  const branch = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 7),
    new THREE.MeshStandardMaterial({ color: "#565442", roughness: 1 }),
    720,
  );
  branch.castShadow = true;
  let li = 0,
    bi = 0;
  const twig = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    dummy.position.copy(a).lerp(b, 0.5);
    dummy.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    dummy.scale.set(r, a.distanceTo(b), r);
    dummy.updateMatrix();
    branch.setMatrixAt(bi++, dummy.matrix);
  };
  for (let t = 0; t < 20; t++) {
    const base =
        t < 14
          ? new THREE.Vector3(-16 + t * 2.5, 0, -11 - rand() * 6)
          : new THREE.Vector3(-11 + (t - 14) * 4.2, -0.1, 17 + rand() * 5),
      height = 4.5 + rand() * 2;
    const top = base
      .clone()
      .add(new THREE.Vector3(rand() * 0.5, height, rand() * 0.5));
    twig(base, top, 0.12 + rand() * 0.05);
    for (let c = 0; c < 28; c++) {
      const angle = rand() * Math.PI * 2,
        radius = Math.sqrt(rand()) * 2.15;
      const center = top
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(angle) * radius,
            (rand() - 0.65) * 2.2,
            Math.sin(angle) * radius,
          ),
        );
      twig(
        top.clone().add(new THREE.Vector3(0, -1.2 - rand(), 0)),
        center,
        0.013 + rand() * 0.025,
      );
      for (let i = 0; i < 70; i++) {
        dummy.position
          .copy(center)
          .add(
            new THREE.Vector3(
              (rand() - 0.5) * 1.0,
              (rand() - 0.5) * 0.8,
              (rand() - 0.5) * 1.0,
            ),
          );
        dummy.rotation.set(rand() * 2, rand() * Math.PI * 2, rand() * 2);
        dummy.scale.setScalar(1.0 + rand() * 0.9);
        dummy.updateMatrix();
        leaves.setMatrixAt(li, dummy.matrix);
        color.setScalar(0.74 + rand() * 0.4);
        leaves.setColorAt(li++, color);
      }
    }
  }
  leaves.count = li;
  branch.count = bi;
  scene.add(leaves, branch);
  // The courtyard gate opens onto actual ground and a tree belt, not the lower HDR hemisphere.
  const groundMaps = await Promise.all(
    ["diff", "nor_gl", "rough"].map(async (channel) => {
      const texture = await loader.loadAsync(
        `/assets/outskirts/ground_${channel}.jpg`,
      );
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.setScalar(180 / 3.2);
      texture.anisotropy = 8;
      if (channel === "diff") texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }),
  );
  const terrain = new THREE.PlaneGeometry(180, 180, 60, 60);
  terrain.rotateX(-Math.PI / 2);
  const points = terrain.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i),
      z = points.getZ(i),
      d = Math.hypot(x, z);
    const rise = THREE.MathUtils.smoothstep(d, 16, 40);
    points.setY(
      i,
      -0.14 + rise * (1.2 + Math.sin(x * 0.11) * Math.cos(z * 0.09) * 1.1),
    );
  }
  terrain.computeVertexNormals();
  const soil = new THREE.Mesh(
    terrain,
    new THREE.MeshStandardMaterial({
      map: groundMaps[0],
      normalMap: groundMaps[1],
      roughnessMap: groundMaps[2],
      roughness: 1,
      normalScale: new THREE.Vector2(0.55, 0.55),
    }),
  );
  soil.receiveShadow = true;
  scene.add(soil);
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
