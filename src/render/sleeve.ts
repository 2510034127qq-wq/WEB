import * as THREE from "three";

const rings = 13,
  sides = 24;
/** One continuous cloth surface from cuff to elbow, with no overlapping sleeve tubes. */
export function sleeveGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(rings * (sides + 1) * 3);
  const uv = new Float32Array(rings * (sides + 1) * 2);
  const index: number[] = [];
  for (let j = 0; j < rings; j++)
    for (let k = 0; k <= sides; k++) {
      const i = j * (sides + 1) + k;
      uv[i * 2] = k / sides;
      uv[i * 2 + 1] = j / (rings - 1);
      if (j < rings - 1 && k < sides)
        index.push(
          i,
          i + 1,
          i + sides + 1,
          i + 1,
          i + sides + 2,
          i + sides + 1,
        );
    }
  g.setAttribute(
    "position",
    new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
  );
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

export function poseSleeve(
  mesh: THREE.Mesh,
  hand: THREE.Object3D,
  elbow: THREE.Vector3,
) {
  const start = hand.localToWorld(new THREE.Vector3(0, 0, 0.087));
  const control = hand.localToWorld(new THREE.Vector3(0, 0, 0.23));
  const curve = new THREE.QuadraticBezierCurve3(start, control, elbow);
  const position = mesh.geometry.attributes.position;
  const up = new THREE.Vector3(0, 1, 0),
    x = new THREE.Vector3(),
    y = new THREE.Vector3();
  for (let j = 0; j < rings; j++) {
    const t = j / (rings - 1),
      p = curve.getPoint(t),
      tangent = curve.getTangent(t).normalize();
    x.crossVectors(up, tangent).normalize();
    if (x.lengthSq() < 0.5) x.set(1, 0, 0);
    y.crossVectors(tangent, x).normalize();
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const r =
        0.033 + 0.036 * Math.pow(t, 0.7) + Math.sin(a * 7 + t * 16) * 0.0016;
      const q = p
        .clone()
        .addScaledVector(x, Math.cos(a) * r)
        .addScaledVector(y, Math.sin(a) * r);
      position.setXYZ(j * (sides + 1) + k, q.x, q.y, q.z);
    }
  }
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}
