import { describe, it, expect } from "vitest";
import { SculptStroke } from "../src/simulation/sculpt";
import { sampleProfile } from "../src/simulation/profile";
import { newPiece, prepare, openClay, volume } from "../src/simulation/model";
import {
  ceramicGeometry,
  updateCeramicGeometry,
} from "../src/render/ceramic-geometry";

function clay() {
  const p = newPiece("vase", 1);
  prepare(p, 5, 0.65);
  openClay(p);
  return p;
}
describe("continuous sculpt motion", () => {
  it("settles without a release snap or overshoot", () => {
    const p = clay(),
      before = p.radius[24],
      stroke = new SculptStroke(p, 24 / 47, 1, 0.001);
    stroke.move(188, 0);
    stroke.step(1 / 60);
    const beforeRelease = [...p.radius];
    stroke.release();
    expect(p.radius).toEqual(beforeRelease);
    let previous = p.radius[24];
    for (let i = 0; i < 20; i++) {
      stroke.step(1 / 60);
      expect(p.radius[24]).toBeGreaterThanOrEqual(previous);
      previous = p.radius[24];
      expect(previous).toBeLessThanOrEqual(before + 0.0301);
    }
    expect(p.radius[24] - before).toBeCloseTo(0.03008, 4);
    expect(stroke.settled).toBe(true);
  });
  it("moves contact up the wall in the same uninterrupted drag", () => {
    const a = clay(),
      b = structuredClone(a),
      va = volume(a);
    const sweep = new SculptStroke(a, 0.35, 1, 0.001),
      fixed = new SculptStroke(b, 0.35, 1, 0.001);
    sweep.move(180, 0);
    sweep.move(180, -72);
    sweep.step(0, true);
    fixed.move(180, 0);
    fixed.step(0, true);
    expect(a.radius[36] - b.radius[36]).toBeGreaterThan(0.012);
    expect(a.radius[0]).toBe(b.radius[0]);
    expect(volume(a)).toBeCloseTo(va, 6);
  });
  it("resamples the same swept path independently of pointer and render cadence", () => {
    const a = clay(),
      b = structuredClone(a);
    function run(p: typeof a, count: number) {
      const s = new SculptStroke(p, 0.3, 1, 0.001);
      let x = 0,
        y = 0;
      for (const [nx, ny] of [
        [180, 0],
        [220, -60],
        [100, -95],
      ]) {
        for (let i = 1; i <= count; i++) {
          s.move(x + ((nx - x) * i) / count, y + ((ny - y) * i) / count);
          s.step(1 / (count * 2));
        }
        x = nx;
        y = ny;
      }
      s.step(0, true);
    }
    run(a, 8);
    run(b, 64);
    a.radius.forEach((r, i) => expect(r).toBeCloseTo(b.radius[i], 8));
    expect(a.wheelTraces?.length).toBe(b.wheelTraces?.length);
    a.wheelTraces?.forEach((t, i) => {
      expect(t.v).toBeCloseTo(b.wheelTraces![i].v, 8);
      expect(t.depth).toBeCloseTo(b.wheelTraces![i].depth, 8);
    });
  });
  it("records relief only along actual contact and polishes it locally", () => {
    const p = clay(),
      s = new SculptStroke(p, 0.3, 1, 0.001);
    s.move(220, 0);
    s.move(220, -45);
    s.step(0, true);
    expect(p.wheelTraces!.length).toBeGreaterThan(5);
    expect(
      p.wheelTraces!.every(
        (t) => t.v >= 0.3 && t.v < 0.59 && t.depth <= 0.0001,
      ),
    ).toBe(true);
    const strongest = p.wheelTraces![0].depth;
    p.wheelTraces!.push({ v: 0.94, width: 0.008, depth: 0.00008 });
    const polish = new SculptStroke(p, 0.3, 1, 0.001, 0.28, true);
    polish.move(160, 0);
    polish.step(0, true);
    expect(p.wheelTraces![0].depth).toBeLessThan(strongest * 0.1);
    expect(p.wheelTraces!.at(-1)!.depth).toBeGreaterThan(0.000079);
  });
  it("smooths the touched wall without flattening the whole vessel", () => {
    const p = clay();
    p.radius[28] += 0.018;
    const before = [...p.radius],
      v = volume(p);
    const s = new SculptStroke(p, 28 / 47, 1, 0.001, 0.28, true);
    s.move(160, 0);
    s.step(0, true);
    expect(p.radius[28]).toBeLessThan(before[28] - 0.005);
    expect(Math.abs(p.radius[3] - before[3])).toBeLessThan(0.000001);
    expect(volume(p)).toBeCloseTo(v, 6);
  });
  it("keeps curvature continuous through profile control rows", () => {
    const values = Array.from(
      { length: 48 },
      (_, i) => 0.1 + Math.sin(i * 0.55) * 0.02,
    );
    const h = 1e-3;
    const slope = (x: number) =>
      (sampleProfile(values, x + h) - sampleProfile(values, x - h)) / (2 * h);
    const curve = (x: number) =>
      (sampleProfile(values, x + h) -
        2 * sampleProfile(values, x) +
        sampleProfile(values, x - h)) /
      (h * h);
    for (let i = 2; i < 46; i++) {
      expect(Math.abs(slope(i - h) - slope(i + h))).toBeLessThan(0.00002);
      expect(Math.abs(curve(i - h) - curve(i + h))).toBeLessThan(0.00002);
    }
    expect(sampleProfile(values, 0)).toBeCloseTo(values[0], 12);
    expect(sampleProfile(values, 47)).toBeCloseTo(values[47], 12);
  });
  it("joins the inner lip continuously and reuses geometry through deformation", () => {
    const p = clay(),
      g = ceramicGeometry(p),
      points = g.parameters.points,
      pos = g.attributes.position.array;
    const join = points.findIndex(
      (point, i) =>
        i > 0 &&
        point.y > p.height &&
        point.distanceToSquared(points[i - 1]) < 1e-16,
    );
    expect(join).toBeGreaterThan(0);
    const normals = g.attributes.normal;
    expect(normals.getX(join)).toBeCloseTo(normals.getX(join - 1), 6);
    expect(normals.getY(join)).toBeCloseTo(normals.getY(join - 1), 6);
    expect(normals.getZ(join)).toBeCloseTo(normals.getZ(join - 1), 6);
    const stroke = new SculptStroke(p, 0.4, 1, 0.001);
    stroke.move(200, -20);
    stroke.step(0, true);
    expect(updateCeramicGeometry(g, p)).toBe(true);
    expect(g.parameters.points).toBe(points);
    expect(g.attributes.position.array).toBe(pos);
    expect(Object.keys(g.userData)).toHaveLength(0);
    expect([...g.attributes.normal.array].every(Number.isFinite)).toBe(true);
    g.dispose();
  });
});
