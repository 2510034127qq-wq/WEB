import * as THREE from "three";
import type { Piece } from "../simulation/model";
import { sampleProfile } from "../simulation/profile";

const SEGMENTS = 128,
  ROWS = 256;
const geometryCache = new WeakMap<
  THREE.LatheGeometry,
  { slopes: Float64Array; uvHeight: number }
>();
const circle = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
  const a = (i / SEGMENTS) * Math.PI * 2;
  return {
    sin: Math.sin(a),
    cos: Math.cos(a),
    sin3: Math.sin(a * 3),
    cos3: Math.cos(a * 3),
  };
});

function profile(p: Piece, points: THREE.Vector2[] = []) {
  let count = 0;
  const point = (x: number, y: number) => {
    (points[count] ??= new THREE.Vector2()).set(x, y);
    count++;
  };
  const h = p.height,
    foot = p.radius[0] * 0.83;
  point(0, 0);
  point(foot - 0.002, 0);
  point(foot - 0.0006, 0.0006);
  point(foot, 0.002);
  point(foot, 0.009);
  point(foot + 0.0015, 0.011);
  const thrown = !["raw", "prepared"].includes(p.stage),
    fired = ["fired", "packed"].includes(p.stage);
  const radius = (t: number) => {
    let relief = 0;
    if (thrown)
      for (const trace of p.wheelTraces || []) {
        const distance = (t * h - trace.v * h) / (trace.width * 0.5);
        relief +=
          trace.depth *
          (0.45 * Math.exp(-(((Math.abs(distance) - 1.1) / 0.45) ** 2)) -
            Math.exp(-distance * distance * 2));
      }
    return (
      sampleProfile(p.radius, t * 47) +
      THREE.MathUtils.clamp(relief, -0.0005, 0.0005) * (fired ? 0.28 : 1)
    );
  };
  for (let i = 0; i <= ROWS; i++)
    point(radius(i / ROWS), 0.012 + (i / ROWS) * h);
  let insideStart = count;
  if (p.opened) {
    const outer = p.radius[47],
      thickness = p.thickness[47],
      center = outer - thickness * 0.5;
    for (let j = 1; j <= 16; j++) {
      const a = (Math.PI * j) / 16;
      point(
        center + Math.cos(a) * thickness * 0.5,
        h + 0.012 + Math.sin(a) * thickness * 0.5,
      );
    }
    insideStart = count;
    // The inner wall meets the lip at the same height, then reaches a raised
    // inner floor. The previous +4 mm offset made a reverse lip and dark seam.
    for (let k = ROWS; k >= 0; k--) {
      const y = 0.021 + ((h - 0.009) * k) / ROWS,
        t = (y - 0.012) / h;
      point(Math.max(0.005, radius(t) - sampleProfile(p.thickness, t * 47)), y);
    }
    point(0, 0.021);
  } else {
    point(p.radius[47] * 0.7, h + 0.023);
    point(0, h + 0.028);
  }
  points.length = count;
  return { points, insideStart };
}

export function ceramicGeometry(p: Piece) {
  const { points } = profile(p),
    g = new THREE.LatheGeometry(points, SEGMENTS);
  for (const key of ["position", "normal", "uv"])
    (g.attributes[key] as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage,
    );
  updateCeramicGeometry(g, p);
  return g;
}

/** Keep topology, buffers, trigonometry and profile storage across frames. */
export function updateCeramicGeometry(g: THREE.LatheGeometry, p: Piece) {
  const { points, insideStart } = profile(p, g.parameters.points),
    stride = points.length;
  if (g.attributes.position.count !== (SEGMENTS + 1) * stride) return false;
  const pos = g.attributes.position,
    normal = g.attributes.normal,
    uv = g.attributes.uv;
  const xyz = pos.array as Float32Array,
    normals = normal.array as Float32Array,
    tex = uv.array as Float32Array;
  let cached = geometryCache.get(g);
  if (!cached || cached.slopes.length !== stride * 2) {
    cached = { slopes: new Float64Array(stride * 2), uvHeight: NaN };
    geometryCache.set(g, cached);
  }
  const slopes = cached.slopes;
  const warped = p.defects.some((d) => d.startsWith("过火"));
  const updateUv = cached.uvHeight !== p.height;
  let maximumRadius = 0,
    minY = 0,
    maxY = 0;
  for (let j = 0; j < stride; j++) {
    const point = points[j];
    let before = j - 1,
      after = j + 1;
    while (before >= 0 && points[before].distanceToSquared(point) < 1e-16)
      before--;
    while (after < stride && points[after].distanceToSquared(point) < 1e-16)
      after++;
    const prev = points[Math.max(0, before)],
      next = points[Math.min(stride - 1, after)];
    const dr = next.x - prev.x,
      dy = next.y - prev.y,
      length = Math.hypot(dr, dy) || 1;
    slopes[j * 2] = dy / length;
    slopes[j * 2 + 1] = -dr / length;
    maximumRadius = Math.max(maximumRadius, point.x);
    const warp = warped ? 0.012 * (point.y / p.height) ** 2 : 0;
    minY = Math.min(minY, point.y - warp);
    maxY = Math.max(maxY, point.y + warp);
  }
  for (let i = 0; i <= SEGMENTS; i++) {
    const c = circle[i];
    for (let j = 0; j < stride; j++) {
      const point = points[j],
        k = i * stride + j,
        q = k * 3;
      const nr = slopes[j * 2],
        ny = slopes[j * 2 + 1];
      xyz[q] = point.x * c.sin;
      xyz[q + 1] =
        point.y + (warped ? c.sin3 * 0.012 * (point.y / p.height) ** 2 : 0);
      xyz[q + 2] = point.x * c.cos;
      if (warped) {
        const dy =
          nr * (1 + (0.024 * c.sin3 * point.y) / (p.height * p.height));
        const twist =
          point.x > 1e-8
            ? (ny / point.x) * 0.036 * c.cos3 * (point.y / p.height) ** 2
            : 0;
        const nx = dy * c.sin - twist * c.cos,
          nz = dy * c.cos + twist * c.sin,
          len = Math.hypot(nx, ny, nz) || 1;
        normals[q] = nx / len;
        normals[q + 1] = ny / len;
        normals[q + 2] = nz / len;
      } else {
        normals[q] = nr * c.sin;
        normals[q + 1] = ny;
        normals[q + 2] = nr * c.cos;
      }
      if (updateUv) {
        tex[k * 2] =
          (0.5 + (i / SEGMENTS) * 1023) / 2048 +
          (p.opened && j >= insideStart ? 0.5 : 0);
        tex[k * 2 + 1] = THREE.MathUtils.clamp(
          (point.y - 0.012) / p.height,
          0,
          1,
        );
      }
    }
  }
  pos.needsUpdate = true;
  normal.needsUpdate = true;
  if (updateUv) {
    uv.needsUpdate = true;
    cached.uvHeight = p.height;
  }
  const box = (g.boundingBox ??= new THREE.Box3());
  box.min.set(-maximumRadius, minY, -maximumRadius);
  box.max.set(maximumRadius, maxY, maximumRadius);
  const sphere = (g.boundingSphere ??= new THREE.Sphere());
  sphere.center.set(0, (minY + maxY) / 2, 0);
  sphere.radius = Math.hypot(maximumRadius, (maxY - minY) / 2);
  return true;
}
